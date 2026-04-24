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
	s.mux.HandleFunc("/mcp", s.handleMCP) // MCP over HTTP endpoint
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

// handleMCP handles MCP protocol requests over HTTP
func (s *Server) handleMCP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		JSONRPC string          `json:"jsonrpc"`
		ID      interface{}     `json:"id,omitempty"`
		Method  string          `json:"method"`
		Params  json.RawMessage `json:"params,omitempty"`
	}

	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, fmt.Sprintf("parse request: %v", err), http.StatusBadRequest)
		return
	}

	var resp interface{}
	var mcpError *struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
	}

	switch req.Method {
	case "initialize":
		resp = map[string]interface{}{
			"protocolVersion": "2024-11-05",
			"capabilities": map[string]interface{}{
				"tools": map[string]bool{},
			},
			"serverInfo": map[string]interface{}{
				"name":    "claw-credential-manager",
				"version": "1.0.0",
			},
		}

	case "tools/list":
		resp = map[string]interface{}{
			"tools": []interface{}{
				map[string]interface{}{
					"name":        "list_credentials",
					"description": "List all available credential entries (without sensitive fields)",
					"inputSchema": map[string]interface{}{
						"type":       "object",
						"properties": map[string]interface{}{},
					},
				},
				map[string]interface{}{
					"name":        "get_credential",
					"description": "Get a specific credential entry by ID (includes sensitive fields)",
					"inputSchema": map[string]interface{}{
						"type": "object",
						"properties": map[string]interface{}{
							"id": map[string]interface{}{
								"type":        "string",
								"description": "The credential entry ID",
							},
						},
						"required": []string{"id"},
					},
				},
			},
		}

	case "tools/call":
		var params struct {
			Name      string          `json:"name"`
			Arguments json.RawMessage `json:"arguments"`
		}
		if err := json.Unmarshal(req.Params, &params); err != nil {
			mcpError = &struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			}{Code: -32602, Message: "invalid params"}
			break
		}

		switch params.Name {
		case "list_credentials":
			entries, err := s.service.ListEntries()
			if err != nil {
				s.audit.LogAccess("mcp-http", "list", "*", false)
				mcpError = &struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				}{Code: -32603, Message: err.Error()}
			} else {
				s.audit.LogAccess("mcp-http", "list", "*", true)
				resp = map[string]interface{}{
					"content": []interface{}{
						map[string]interface{}{
							"type": "text",
							"text": fmt.Sprintf("Found %d credential entries", len(entries)),
						},
					},
				}
			}

		case "get_credential":
			var args struct {
				ID string `json:"id"`
			}
			if err := json.Unmarshal(params.Arguments, &args); err != nil {
				mcpError = &struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				}{Code: -32602, Message: "invalid arguments"}
				break
			}

			entry, err := s.service.GetEntry(args.ID)
			if err != nil {
				s.audit.LogAccess("mcp-http", "get", args.ID, false)
				mcpError = &struct {
					Code    int    `json:"code"`
					Message string `json:"message"`
				}{Code: -32603, Message: err.Error()}
			} else {
				s.audit.LogAccess("mcp-http", "get", args.ID, true)
				// Return the entry data as JSON string in content
				entryJSON, _ := json.Marshal(entry)
				resp = map[string]interface{}{
					"content": []interface{}{
						map[string]interface{}{
							"type": "text",
							"text": string(entryJSON),
						},
					},
				}
			}

		default:
			mcpError = &struct {
				Code    int    `json:"code"`
				Message string `json:"message"`
			}{Code: -32601, Message: fmt.Sprintf("unknown tool: %s", params.Name)}
		}

	default:
		mcpError = &struct {
			Code    int    `json:"code"`
			Message string `json:"message"`
		}{Code: -32601, Message: fmt.Sprintf("method not found: %s", req.Method)}
	}

	w.Header().Set("Content-Type", "application/json")
	result := map[string]interface{}{
		"jsonrpc": "2.0",
		"id":      req.ID,
	}

	if mcpError != nil {
		result["error"] = mcpError
	} else {
		result["result"] = resp
	}

	json.NewEncoder(w).Encode(result)
}
