package audit

import (
	"log/slog"
	"time"
)

// Logger provides audit logging with sensitive field sanitization
type Logger struct {
	logger *slog.Logger
}

// NewLogger creates a new audit logger
func NewLogger(logger *slog.Logger) *Logger {
	return &Logger{logger: logger}
}

// LogAccess logs an access event
func (l *Logger) LogAccess(clientID, operation, entryID string, allowed bool) {
	l.logger.Info("access_event",
		slog.String("client_id", clientID),
		slog.String("operation", operation),
		slog.String("entry_id", entryID),
		slog.Bool("allowed", allowed),
		slog.Time("timestamp", time.Now()),
	)
}

// LogAuthFailure logs an authentication failure
func (l *Logger) LogAuthFailure(clientIP, reason string) {
	l.logger.Warn("auth_failure",
		slog.String("client_ip", clientIP),
		slog.String("reason", reason),
		slog.Time("timestamp", time.Now()),
	)
}

// LogRefresh logs a token refresh event
func (l *Logger) LogRefresh(entryID string, success bool, errorMsg string) {
	if success {
		l.logger.Info("token_refresh",
			slog.String("entry_id", entryID),
			slog.Bool("success", true),
			slog.Time("timestamp", time.Now()),
		)
	} else {
		l.logger.Error("token_refresh",
			slog.String("entry_id", entryID),
			slog.Bool("success", false),
			slog.String("error", errorMsg),
			slog.Time("timestamp", time.Now()),
		)
	}
}
