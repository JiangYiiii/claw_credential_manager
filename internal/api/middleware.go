package api

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

// AuthMiddleware validates API key
type AuthMiddleware struct {
	apiKey string
}

func NewAuthMiddleware(apiKey string) *AuthMiddleware {
	return &AuthMiddleware{apiKey: apiKey}
}

func (m *AuthMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Skip authentication for health check endpoint
		if r.URL.Path == "/health" {
			next.ServeHTTP(w, r)
			return
		}

		auth := r.Header.Get("Authorization")
		if auth == "" {
			http.Error(w, "missing authorization header", http.StatusUnauthorized)
			return
		}

		// Expect "Bearer <api-key>"
		parts := strings.SplitN(auth, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			http.Error(w, "invalid authorization format", http.StatusUnauthorized)
			return
		}

		if parts[1] != m.apiKey {
			http.Error(w, "invalid api key", http.StatusUnauthorized)
			return
		}

		next.ServeHTTP(w, r)
	})
}

// RateLimitMiddleware implements rate limiting and failure lockout
type RateLimitMiddleware struct {
	mu                sync.RWMutex
	limiter           *rate.Limiter
	authFailures      map[string]int
	lockouts          map[string]time.Time
	maxFailures       int
	lockoutDuration   time.Duration
}

func NewRateLimitMiddleware(requestsPerMinute, maxFailures int, lockoutDuration time.Duration) *RateLimitMiddleware {
	return &RateLimitMiddleware{
		limiter:         rate.NewLimiter(rate.Every(time.Minute/time.Duration(requestsPerMinute)), requestsPerMinute),
		authFailures:    make(map[string]int),
		lockouts:        make(map[string]time.Time),
		maxFailures:     maxFailures,
		lockoutDuration: lockoutDuration,
	}
}

func (m *RateLimitMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clientIP := getClientIP(r)

		// Check if locked out
		if m.isLockedOut(clientIP) {
			http.Error(w, "too many authentication failures, locked out", http.StatusTooManyRequests)
			return
		}

		// Check rate limit
		if !m.limiter.Allow() {
			http.Error(w, "rate limit exceeded", http.StatusTooManyRequests)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func (m *RateLimitMiddleware) RecordAuthFailure(clientIP string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	m.authFailures[clientIP]++
	if m.authFailures[clientIP] >= m.maxFailures {
		m.lockouts[clientIP] = time.Now().Add(m.lockoutDuration)
	}
}

func (m *RateLimitMiddleware) ResetAuthFailures(clientIP string) {
	m.mu.Lock()
	defer m.mu.Unlock()

	delete(m.authFailures, clientIP)
	delete(m.lockouts, clientIP)
}

func (m *RateLimitMiddleware) isLockedOut(clientIP string) bool {
	m.mu.RLock()
	defer m.mu.RUnlock()

	lockoutUntil, exists := m.lockouts[clientIP]
	if !exists {
		return false
	}

	if time.Now().After(lockoutUntil) {
		// Lockout expired
		m.mu.RUnlock()
		m.mu.Lock()
		delete(m.lockouts, clientIP)
		delete(m.authFailures, clientIP)
		m.mu.Unlock()
		m.mu.RLock()
		return false
	}

	return true
}

func getClientIP(r *http.Request) string {
	// For localhost, use a fixed identifier
	if strings.HasPrefix(r.RemoteAddr, "127.0.0.1:") || strings.HasPrefix(r.RemoteAddr, "[::1]:") {
		return "localhost"
	}
	return strings.Split(r.RemoteAddr, ":")[0]
}

// LoggingMiddleware logs requests without exposing sensitive data
type LoggingMiddleware struct {
	logger func(format string, args ...interface{})
}

func NewLoggingMiddleware(logger func(format string, args ...interface{})) *LoggingMiddleware {
	return &LoggingMiddleware{logger: logger}
}

func (m *LoggingMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()

		// Create response writer wrapper to capture status code
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		next.ServeHTTP(wrapped, r)

		// Log without authorization header
		m.logger("method=%s path=%s status=%d duration=%v",
			r.Method,
			sanitizePath(r.URL.Path),
			wrapped.statusCode,
			time.Since(start),
		)
	})
}

func sanitizePath(path string) string {
	// Don't log full IDs or sensitive params
	if strings.Contains(path, "/entries/") {
		return "/entries/:id"
	}
	return path
}

type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// CORSMiddleware handles CORS (even for localhost, some clients need it)
type CORSMiddleware struct{}

func NewCORSMiddleware() *CORSMiddleware {
	return &CORSMiddleware{}
}

func (m *CORSMiddleware) Handler(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")

		// Allow local development and Chrome extensions
		if origin != "" {
			if strings.HasPrefix(origin, "http://localhost:") ||
			   strings.HasPrefix(origin, "http://127.0.0.1:") ||
			   strings.HasPrefix(origin, "chrome-extension://") ||
			   strings.HasPrefix(origin, "moz-extension://") {
				w.Header().Set("Access-Control-Allow-Origin", origin)
			}
		} else {
			// If no Origin header, allow localhost (for curl/direct API calls)
			w.Header().Set("Access-Control-Allow-Origin", "http://127.0.0.1:*")
		}

		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")

		if r.Method == "OPTIONS" {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}
