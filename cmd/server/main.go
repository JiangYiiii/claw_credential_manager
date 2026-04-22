package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/jiangyi/claw-credential-manager/internal/api"
	"github.com/jiangyi/claw-credential-manager/internal/audit"
	"github.com/jiangyi/claw-credential-manager/internal/config"
	"github.com/jiangyi/claw-credential-manager/internal/mcp"
	"github.com/jiangyi/claw-credential-manager/internal/scheduler"
	"github.com/jiangyi/claw-credential-manager/internal/vault"
)

var (
	configPath = flag.String("config", "", "Path to configuration file")
	mcpMode    = flag.Bool("mcp", false, "Run in MCP mode (stdio)")
	initMode   = flag.Bool("init", false, "Initialize new vault")
)

func main() {
	flag.Parse()

	if *initMode {
		if err := runInit(); err != nil {
			log.Fatalf("init failed: %v", err)
		}
		return
	}

	// Load configuration
	if *configPath == "" {
		home, _ := os.UserHomeDir()
		*configPath = filepath.Join(home, ".config", "claw-vault", "config.yaml")
	}

	cfg, err := config.Load(*configPath)
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	// Setup logging
	logLevel := slog.LevelInfo
	if os.Getenv("DEBUG") == "true" {
		logLevel = slog.LevelDebug
	}

	logger := slog.New(slog.NewJSONHandler(os.Stderr, &slog.HandlerOptions{
		Level: logLevel,
	}))
	slog.SetDefault(logger)

	auditLogger := audit.NewLogger(logger)

	// Open vault
	backend := vault.NewKDBXBackend(cfg.Vault.Path)

	masterPassword, err := cfg.GetMasterPassword()
	if err != nil {
		log.Fatalf("get master password: %v", err)
	}

	if err := backend.Open(masterPassword); err != nil {
		log.Fatalf("open vault: %v", err)
	}
	defer backend.Close()

	slog.Info("vault opened", "path", cfg.Vault.Path)

	// Create service
	service := vault.NewService(backend, cfg.Policy.EntryAllowlist)

	// Run in appropriate mode
	if *mcpMode {
		runMCPServer(service, auditLogger)
	} else {
		runHTTPServer(cfg, service, auditLogger)
	}
}

func runHTTPServer(cfg *config.Config, service *vault.Service, auditLogger *audit.Logger) {
	// Parse lockout duration
	lockoutDuration, err := time.ParseDuration(cfg.Security.RateLimit.LockoutDuration)
	if err != nil {
		lockoutDuration = 5 * time.Minute
	}

	// Create middlewares
	authMiddleware := api.NewAuthMiddleware(cfg.Auth.APIKey)
	rateLimitMiddleware := api.NewRateLimitMiddleware(
		cfg.Security.RateLimit.RequestsPerMinute,
		cfg.Security.RateLimit.AuthFailuresMax,
		lockoutDuration,
	)
	loggingMiddleware := api.NewLoggingMiddleware(func(format string, args ...interface{}) {
		slog.Info(fmt.Sprintf(format, args...))
	})
	corsMiddleware := api.NewCORSMiddleware()

	// Create API server
	apiServer := api.NewServer(service, auditLogger)

	// Chain middlewares
	handler := corsMiddleware.Handler(
		loggingMiddleware.Handler(
			rateLimitMiddleware.Handler(
				authMiddleware.Handler(apiServer),
			),
		),
	)

	// Start HTTP server
	server := &http.Server{
		Addr:         cfg.Server.Bind,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	// Start scheduler
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	home, _ := os.UserHomeDir()
	scriptsDir := filepath.Join(home, ".config", "claw-vault", "scripts")
	os.MkdirAll(scriptsDir, 0700)

	refreshScheduler := scheduler.NewScheduler(service, auditLogger, scriptsDir)
	go refreshScheduler.StartScheduler(ctx)

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan

		slog.Info("shutting down server...")
		cancel()

		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer shutdownCancel()

		if err := server.Shutdown(shutdownCtx); err != nil {
			slog.Error("server shutdown error", "error", err)
		}
	}()

	slog.Info("starting HTTP server", "bind", cfg.Server.Bind)
	if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		log.Fatalf("server error: %v", err)
	}
}

func runMCPServer(service *vault.Service, auditLogger *audit.Logger) {
	mcpServer := mcp.NewServer(service, auditLogger)

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Handle graceful shutdown
	go func() {
		sigChan := make(chan os.Signal, 1)
		signal.Notify(sigChan, os.Interrupt, syscall.SIGTERM)
		<-sigChan
		cancel()
	}()

	slog.Info("starting MCP server (stdio)")
	if err := mcpServer.Run(ctx); err != nil {
		log.Fatalf("MCP server error: %v", err)
	}
}

func runInit() error {
	home, _ := os.UserHomeDir()
	configDir := filepath.Join(home, ".config", "claw-vault")
	dataDir := filepath.Join(home, ".local", "share", "claw-vault")
	stateDir := filepath.Join(home, ".local", "state", "claw-vault")
	scriptsDir := filepath.Join(configDir, "scripts")

	// Create directories
	for _, dir := range []string{configDir, dataDir, stateDir, scriptsDir} {
		if err := os.MkdirAll(dir, 0700); err != nil {
			return fmt.Errorf("create directory %s: %w", dir, err)
		}
	}

	fmt.Println("Initialized directories:")
	fmt.Printf("  Config: %s\n", configDir)
	fmt.Printf("  Data: %s\n", dataDir)
	fmt.Printf("  State: %s\n", stateDir)
	fmt.Printf("  Scripts: %s\n", scriptsDir)

	// Generate random API key
	apiKey := generateAPIKey()

	// Create config file
	configPath := filepath.Join(configDir, "config.yaml")
	if _, err := os.Stat(configPath); os.IsNotExist(err) {
		configContent := fmt.Sprintf(`server:
  bind: "127.0.0.1:8765"
  tls_cert: ""
  tls_key: ""

vault:
  backend: "kdbx"
  path: "%s/credentials.kdbx"
  unlock:
    key_file: "%s/.vault-key"
    env_var: "CLAW_VAULT_PASSWORD"

auth:
  api_key: "%s"

policy:
  entry_allowlist:
    - "*"  # WARNING: This allows all entries. Restrict in production!

security:
  rate_limit:
    requests_per_minute: 60
    auth_failures_max: 5
    lockout_duration: "5m"
`, dataDir, stateDir, apiKey)

		if err := os.WriteFile(configPath, []byte(configContent), 0600); err != nil {
			return fmt.Errorf("write config: %w", err)
		}
		fmt.Printf("\nCreated config file: %s\n", configPath)
	}

	// Prompt for master password
	fmt.Print("\nEnter master password for new vault: ")
	var password string
	fmt.Scanln(&password)

	if password == "" {
		return fmt.Errorf("password cannot be empty")
	}

	// Save password to key file
	keyFilePath := filepath.Join(stateDir, ".vault-key")
	if err := os.WriteFile(keyFilePath, []byte(password), 0400); err != nil {
		return fmt.Errorf("write key file: %w", err)
	}
	fmt.Printf("Saved master password to: %s (mode 0400)\n", keyFilePath)

	// Create empty vault
	vaultPath := filepath.Join(dataDir, "credentials.kdbx")
	backend := vault.NewKDBXBackend(vaultPath)
	if err := backend.Open(password); err != nil {
		return fmt.Errorf("create vault: %w", err)
	}
	backend.Close()

	fmt.Printf("Created vault: %s\n", vaultPath)
	fmt.Printf("\nAPI Key: %s\n", apiKey)
	fmt.Println("\nIMPORTANT:")
	fmt.Println("  1. Store the API key securely")
	fmt.Println("  2. The master password is saved in:", keyFilePath)
	fmt.Println("  3. Update entry_allowlist in config.yaml to restrict access")
	fmt.Println("\nStart server with: claw-vault-server")
	fmt.Println("Or MCP mode with: claw-vault-server -mcp")

	return nil
}

func generateAPIKey() string {
	// Simple API key generation
	return fmt.Sprintf("claw_%d", time.Now().UnixNano())
}
