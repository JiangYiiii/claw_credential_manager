package config

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

type Config struct {
	Server   ServerConfig   `yaml:"server"`
	Vault    VaultConfig    `yaml:"vault"`
	Auth     AuthConfig     `yaml:"auth"`
	Policy   PolicyConfig   `yaml:"policy"`
	Security SecurityConfig `yaml:"security"`
}

type ServerConfig struct {
	Bind    string `yaml:"bind"`
	TLSCert string `yaml:"tls_cert"`
	TLSKey  string `yaml:"tls_key"`
}

type VaultConfig struct {
	Backend string       `yaml:"backend"`
	Path    string       `yaml:"path"`
	Unlock  UnlockConfig `yaml:"unlock"`
}

type UnlockConfig struct {
	KeyFile string `yaml:"key_file"`
	EnvVar  string `yaml:"env_var"`
}

type AuthConfig struct {
	APIKey string `yaml:"api_key"`
}

type PolicyConfig struct {
	EntryAllowlist []string `yaml:"entry_allowlist"`
}

type SecurityConfig struct {
	RateLimit RateLimitConfig `yaml:"rate_limit"`
}

type RateLimitConfig struct {
	RequestsPerMinute   int    `yaml:"requests_per_minute"`
	AuthFailuresMax     int    `yaml:"auth_failures_max"`
	LockoutDuration     string `yaml:"lockout_duration"`
}

// Load loads configuration from file with environment variable expansion
func Load(path string) (*Config, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read config: %w", err)
	}

	// Expand environment variables
	expanded := os.ExpandEnv(string(data))

	var cfg Config
	if err := yaml.Unmarshal([]byte(expanded), &cfg); err != nil {
		return nil, fmt.Errorf("parse config: %w", err)
	}

	// Expand home directory
	cfg.Vault.Path = expandPath(cfg.Vault.Path)
	if cfg.Vault.Unlock.KeyFile != "" {
		cfg.Vault.Unlock.KeyFile = expandPath(cfg.Vault.Unlock.KeyFile)
	}

	// Validate
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	return &cfg, nil
}

func expandPath(path string) string {
	if strings.HasPrefix(path, "~/") {
		home, _ := os.UserHomeDir()
		return filepath.Join(home, path[2:])
	}
	return path
}

func (c *Config) Validate() error {
	// Validate bind address (allow 0.0.0.0 for Docker/Podman environments)
	if !strings.HasPrefix(c.Server.Bind, "127.0.0.1:") &&
	   !strings.HasPrefix(c.Server.Bind, "localhost:") &&
	   !strings.HasPrefix(c.Server.Bind, "0.0.0.0:") {
		return fmt.Errorf("server.bind must be localhost, 127.0.0.1, or 0.0.0.0, got: %s", c.Server.Bind)
	}

	// Validate vault backend
	if c.Vault.Backend != "kdbx" {
		return fmt.Errorf("only 'kdbx' backend is supported, got: %s", c.Vault.Backend)
	}

	// Validate unlock config
	if c.Vault.Unlock.KeyFile == "" && c.Vault.Unlock.EnvVar == "" {
		return fmt.Errorf("vault.unlock requires either key_file or env_var")
	}

	// Validate API key
	if c.Auth.APIKey == "" {
		return fmt.Errorf("auth.api_key is required")
	}

	// Validate allowlist
	if len(c.Policy.EntryAllowlist) == 0 {
		return fmt.Errorf("policy.entry_allowlist cannot be empty (this prevents full database exposure)")
	}

	return nil
}

// GetMasterPassword retrieves the master password from configured sources
func (c *Config) GetMasterPassword() (string, error) {
	// Try environment variable first
	if c.Vault.Unlock.EnvVar != "" {
		if password := os.Getenv(c.Vault.Unlock.EnvVar); password != "" {
			return password, nil
		}
	}

	// Try key file
	if c.Vault.Unlock.KeyFile != "" {
		data, err := os.ReadFile(c.Vault.Unlock.KeyFile)
		if err != nil {
			return "", fmt.Errorf("read key file: %w", err)
		}
		return strings.TrimSpace(string(data)), nil
	}

	return "", fmt.Errorf("no master password found in env_var or key_file")
}
