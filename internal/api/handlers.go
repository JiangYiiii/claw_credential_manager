package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/jiangyi/claw-credential-manager/internal/audit"
	"github.com/jiangyi/claw-credential-manager/internal/vault"
	"github.com/jiangyi/claw-credential-manager/pkg/models"
)

type Server struct {
	service *vault.Service
	audit   *audit.Logger
	mux     *http.ServeMux
}

func NewServer(service *vault.Service, auditLogger *audit.Logger) *Server {
	s := &Server{
		service: service,
		audit:   auditLogger,
		mux:     http.NewServeMux(),
	}

	s.setupRoutes()
	return s
}

func (s *Server) setupRoutes() {
	s.mux.HandleFunc("/health", s.handleHealth)
	s.mux.HandleFunc("/entries", s.handleEntries)
	s.mux.HandleFunc("/entries/", s.handleEntry)
}

func (s *Server) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	s.mux.ServeHTTP(w, r)
}

func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"status": "ok"})
}

func (s *Server) handleEntries(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		s.listEntries(w, r)
	case http.MethodPost:
		s.createEntry(w, r)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) handleEntry(w http.ResponseWriter, r *http.Request) {
	// Extract ID from path /entries/{id}
	path := strings.TrimPrefix(r.URL.Path, "/entries/")
	if path == "" {
		http.Error(w, "entry id required", http.StatusBadRequest)
		return
	}

	switch r.Method {
	case http.MethodGet:
		s.getEntry(w, r, path)
	case http.MethodPut:
		s.updateEntry(w, r, path)
	case http.MethodDelete:
		s.deleteEntry(w, r, path)
	default:
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
	}
}

func (s *Server) listEntries(w http.ResponseWriter, r *http.Request) {
	entries, err := s.service.ListEntries()
	if err != nil {
		s.audit.LogAccess("api", "list", "*", false)
		http.Error(w, fmt.Sprintf("list entries: %v", err), http.StatusInternalServerError)
		return
	}

	s.audit.LogAccess("api", "list", "*", true)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"entries": entries,
		"count":   len(entries),
	})
}

func (s *Server) getEntry(w http.ResponseWriter, r *http.Request, id string) {
	entry, err := s.service.GetEntry(id)
	if err != nil {
		s.audit.LogAccess("api", "get", id, false)
		if strings.Contains(err.Error(), "not in allowlist") {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("get entry: %v", err), http.StatusInternalServerError)
		}
		return
	}

	s.audit.LogAccess("api", "get", id, true)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}

func (s *Server) createEntry(w http.ResponseWriter, r *http.Request) {
	var entry models.Entry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, fmt.Sprintf("decode request: %v", err), http.StatusBadRequest)
		return
	}

	if err := s.service.CreateEntry(&entry); err != nil {
		s.audit.LogAccess("api", "create", entry.ID, false)
		if strings.Contains(err.Error(), "not in allowlist") {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else {
			http.Error(w, fmt.Sprintf("create entry: %v", err), http.StatusInternalServerError)
		}
		return
	}

	s.audit.LogAccess("api", "create", entry.ID, true)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(entry)
}

func (s *Server) updateEntry(w http.ResponseWriter, r *http.Request, id string) {
	var entry models.Entry
	if err := json.NewDecoder(r.Body).Decode(&entry); err != nil {
		http.Error(w, fmt.Sprintf("decode request: %v", err), http.StatusBadRequest)
		return
	}

	// Ensure ID matches
	entry.ID = id

	if err := s.service.UpdateEntry(&entry); err != nil {
		s.audit.LogAccess("api", "update", id, false)
		if strings.Contains(err.Error(), "not in allowlist") {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("update entry: %v", err), http.StatusInternalServerError)
		}
		return
	}

	s.audit.LogAccess("api", "update", id, true)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(entry)
}

func (s *Server) deleteEntry(w http.ResponseWriter, r *http.Request, id string) {
	if err := s.service.DeleteEntry(id); err != nil {
		s.audit.LogAccess("api", "delete", id, false)
		if strings.Contains(err.Error(), "not in allowlist") {
			http.Error(w, err.Error(), http.StatusForbidden)
		} else if strings.Contains(err.Error(), "not found") {
			http.Error(w, err.Error(), http.StatusNotFound)
		} else {
			http.Error(w, fmt.Sprintf("delete entry: %v", err), http.StatusInternalServerError)
		}
		return
	}

	s.audit.LogAccess("api", "delete", id, true)

	w.WriteHeader(http.StatusNoContent)
}
