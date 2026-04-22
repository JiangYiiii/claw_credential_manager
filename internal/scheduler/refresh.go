package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"

	"github.com/jiangyi/claw-credential-manager/internal/audit"
	"github.com/jiangyi/claw-credential-manager/internal/vault"
	"github.com/jiangyi/claw-credential-manager/pkg/models"
)

// Scheduler manages token refresh scripts
type Scheduler struct {
	service       *vault.Service
	audit         *audit.Logger
	scriptsDir    string
	allowedScripts map[string]bool
}

// NewScheduler creates a new refresh scheduler
func NewScheduler(service *vault.Service, auditLogger *audit.Logger, scriptsDir string) *Scheduler {
	return &Scheduler{
		service:        service,
		audit:          auditLogger,
		scriptsDir:     scriptsDir,
		allowedScripts: make(map[string]bool),
	}
}

// RefreshResult contains the result of a refresh operation
type RefreshResult struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expires_at,omitempty"`
}

// RefreshEntry executes the refresh script for an entry and updates its token
func (s *Scheduler) RefreshEntry(entryID string) error {
	// Get entry
	entry, err := s.service.GetEntry(entryID)
	if err != nil {
		s.audit.LogRefresh(entryID, false, fmt.Sprintf("get entry: %v", err))
		return fmt.Errorf("get entry: %w", err)
	}

	// Check if refresh script is configured
	if entry.Metadata == nil || entry.Metadata.RefreshScriptPath == "" {
		err := fmt.Errorf("no refresh script configured")
		s.audit.LogRefresh(entryID, false, err.Error())
		return err
	}

	scriptPath := entry.Metadata.RefreshScriptPath

	// Validate script is in allowed directory
	if !s.isScriptAllowed(scriptPath) {
		err := fmt.Errorf("script not in allowed directory: %s", scriptPath)
		s.audit.LogRefresh(entryID, false, err.Error())
		return err
	}

	// Execute script with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	result, err := s.executeScript(ctx, scriptPath, entry)
	if err != nil {
		s.audit.LogRefresh(entryID, false, fmt.Sprintf("execute script: %v", err))

		// Update entry with error
		if entry.Metadata != nil {
			entry.Metadata.LastRefreshError = err.Error()
			s.service.UpdateEntry(entry)
		}

		return fmt.Errorf("execute script: %w", err)
	}

	// Update entry with new token
	if entry.Metadata == nil {
		entry.Metadata = &models.EntryMetadata{}
	}

	// Store token in custom fields or password depending on entry type
	if entry.Type == "token" {
		if entry.CustomFields == nil {
			entry.CustomFields = make(map[string]interface{})
		}
		entry.CustomFields["access_token"] = result.Token
	} else {
		entry.Password = result.Token
	}

	now := time.Now()
	entry.Metadata.LastRefreshedAt = &now
	entry.Metadata.LastRefreshError = ""
	if !result.ExpiresAt.IsZero() {
		entry.Metadata.TokenExpiresAt = &result.ExpiresAt
	}

	if err := s.service.UpdateEntry(entry); err != nil {
		s.audit.LogRefresh(entryID, false, fmt.Sprintf("update entry: %v", err))
		return fmt.Errorf("update entry: %w", err)
	}

	s.audit.LogRefresh(entryID, true, "")
	return nil
}

// executeScript runs the refresh script in a sandboxed environment
func (s *Scheduler) executeScript(ctx context.Context, scriptPath string, entry *models.Entry) (*RefreshResult, error) {
	// Prepare environment with entry data (but not sensitive fields by default)
	env := os.Environ()
	env = append(env,
		fmt.Sprintf("ENTRY_ID=%s", entry.ID),
		fmt.Sprintf("ENTRY_NAME=%s", entry.Name),
		fmt.Sprintf("ENTRY_USERNAME=%s", entry.Username),
	)

	// Only pass password if explicitly needed (script should document this)
	if entry.Password != "" {
		env = append(env, fmt.Sprintf("ENTRY_PASSWORD=%s", entry.Password))
	}

	// Execute script
	cmd := exec.CommandContext(ctx, scriptPath)
	cmd.Env = env

	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("script failed: %v, stderr: %s", err, stderr.String())
	}

	// Parse output (expect JSON)
	var result RefreshResult
	if err := json.Unmarshal(stdout.Bytes(), &result); err != nil {
		// Try plain text (just token)
		token := strings.TrimSpace(stdout.String())
		if token == "" {
			return nil, fmt.Errorf("empty output from script")
		}
		result.Token = token
	}

	if result.Token == "" {
		return nil, fmt.Errorf("no token in script output")
	}

	return &result, nil
}

// isScriptAllowed checks if a script path is in the allowed directory
func (s *Scheduler) isScriptAllowed(scriptPath string) bool {
	// Resolve to absolute path
	absPath, err := filepath.Abs(scriptPath)
	if err != nil {
		return false
	}

	// Check if it's in the scripts directory
	absScriptsDir, err := filepath.Abs(s.scriptsDir)
	if err != nil {
		return false
	}

	// Must be within scripts directory
	rel, err := filepath.Rel(absScriptsDir, absPath)
	if err != nil {
		return false
	}

	// Prevent path traversal
	if strings.HasPrefix(rel, "..") {
		return false
	}

	// Check if file exists and is executable
	info, err := os.Stat(absPath)
	if err != nil {
		return false
	}

	// Must be a regular file with execute permissions
	if !info.Mode().IsRegular() {
		return false
	}

	return true
}

// StartScheduler starts a background goroutine that periodically checks for entries needing refresh
func (s *Scheduler) StartScheduler(ctx context.Context) {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.checkAndRefresh()
		}
	}
}

func (s *Scheduler) checkAndRefresh() {
	entries, err := s.service.ListEntries()
	if err != nil {
		return
	}

	for _, entry := range entries {
		// Check if entry needs refresh
		if entry.Metadata == nil || entry.Metadata.RefreshScriptPath == "" {
			continue
		}

		// Check if token is expired or near expiry
		if entry.Metadata.TokenExpiresAt != nil {
			// Refresh if expires within next 10 minutes
			if time.Until(*entry.Metadata.TokenExpiresAt) < 10*time.Minute {
				go s.RefreshEntry(entry.ID)
			}
		}

		// Check if refresh interval is configured
		if entry.Metadata.RefreshIntervalSec > 0 && entry.Metadata.LastRefreshedAt != nil {
			nextRefresh := entry.Metadata.LastRefreshedAt.Add(time.Duration(entry.Metadata.RefreshIntervalSec) * time.Second)
			if time.Now().After(nextRefresh) {
				go s.RefreshEntry(entry.ID)
			}
		}
	}
}
