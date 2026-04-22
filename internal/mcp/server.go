package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os"

	"github.com/jiangyi/claw-credential-manager/internal/audit"
	"github.com/jiangyi/claw-credential-manager/internal/vault"
	"github.com/jiangyi/claw-credential-manager/pkg/models"
)

// Server implements MCP protocol over stdio
type Server struct {
	service *vault.Service
	audit   *audit.Logger
	stdin   io.Reader
	stdout  io.Writer
}

// NewServer creates a new MCP server
func NewServer(service *vault.Service, auditLogger *audit.Logger) *Server {
	return &Server{
		service: service,
		audit:   auditLogger,
		stdin:   os.Stdin,
		stdout:  os.Stdout,
	}
}

// MCPRequest represents an MCP request
type MCPRequest struct {
	Method string          `json:"method"`
	Params json.RawMessage `json:"params,omitempty"`
	ID     interface{}     `json:"id,omitempty"`
}

// MCPResponse represents an MCP response
type MCPResponse struct {
	Result interface{} `json:"result,omitempty"`
	Error  *MCPError   `json:"error,omitempty"`
	ID     interface{} `json:"id,omitempty"`
}

// MCPError represents an MCP error
type MCPError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

// Run starts the MCP server loop
func (s *Server) Run(ctx context.Context) error {
	decoder := json.NewDecoder(s.stdin)
	encoder := json.NewEncoder(s.stdout)

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		var req MCPRequest
		if err := decoder.Decode(&req); err != nil {
			if err == io.EOF {
				return nil
			}
			return fmt.Errorf("decode request: %w", err)
		}

		resp := s.handleRequest(&req)
		if err := encoder.Encode(resp); err != nil {
			return fmt.Errorf("encode response: %w", err)
		}
	}
}

func (s *Server) handleRequest(req *MCPRequest) *MCPResponse {
	resp := &MCPResponse{ID: req.ID}

	switch req.Method {
	case "initialize":
		resp.Result = s.handleInitialize()
	case "tools/list":
		resp.Result = s.handleToolsList()
	case "tools/call":
		result, err := s.handleToolCall(req.Params)
		if err != nil {
			resp.Error = &MCPError{Code: -32603, Message: err.Error()}
		} else {
			resp.Result = result
		}
	default:
		resp.Error = &MCPError{Code: -32601, Message: fmt.Sprintf("method not found: %s", req.Method)}
	}

	return resp
}

func (s *Server) handleInitialize() interface{} {
	return map[string]interface{}{
		"protocolVersion": "2024-11-05",
		"capabilities": map[string]interface{}{
			"tools": map[string]bool{},
		},
		"serverInfo": map[string]interface{}{
			"name":    "claw-credential-manager",
			"version": "1.0.0",
		},
	}
}

func (s *Server) handleToolsList() interface{} {
	return map[string]interface{}{
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
			map[string]interface{}{
				"name":        "update_credential",
				"description": "Update an existing credential entry",
				"inputSchema": map[string]interface{}{
					"type": "object",
					"properties": map[string]interface{}{
						"id": map[string]interface{}{
							"type":        "string",
							"description": "The credential entry ID",
						},
						"entry": map[string]interface{}{
							"type":        "object",
							"description": "The updated entry data",
						},
					},
					"required": []string{"id", "entry"},
				},
			},
		},
	}
}

func (s *Server) handleToolCall(params json.RawMessage) (interface{}, error) {
	var callReq struct {
		Name      string          `json:"name"`
		Arguments json.RawMessage `json:"arguments"`
	}

	if err := json.Unmarshal(params, &callReq); err != nil {
		return nil, fmt.Errorf("parse tool call: %w", err)
	}

	switch callReq.Name {
	case "list_credentials":
		return s.toolListCredentials()
	case "get_credential":
		var args struct {
			ID string `json:"id"`
		}
		if err := json.Unmarshal(callReq.Arguments, &args); err != nil {
			return nil, fmt.Errorf("parse arguments: %w", err)
		}
		return s.toolGetCredential(args.ID)
	case "update_credential":
		var args struct {
			ID    string        `json:"id"`
			Entry *models.Entry `json:"entry"`
		}
		if err := json.Unmarshal(callReq.Arguments, &args); err != nil {
			return nil, fmt.Errorf("parse arguments: %w", err)
		}
		return s.toolUpdateCredential(args.ID, args.Entry)
	default:
		return nil, fmt.Errorf("unknown tool: %s", callReq.Name)
	}
}

func (s *Server) toolListCredentials() (interface{}, error) {
	entries, err := s.service.ListEntries()
	if err != nil {
		s.audit.LogAccess("mcp", "list", "*", false)
		return nil, err
	}

	s.audit.LogAccess("mcp", "list", "*", true)

	return map[string]interface{}{
		"content": []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": fmt.Sprintf("Found %d credential entries", len(entries)),
			},
		},
		"entries": entries,
	}, nil
}

func (s *Server) toolGetCredential(id string) (interface{}, error) {
	entry, err := s.service.GetEntry(id)
	if err != nil {
		s.audit.LogAccess("mcp", "get", id, false)
		return nil, err
	}

	s.audit.LogAccess("mcp", "get", id, true)

	// Sanitize password for text output
	sanitized := fmt.Sprintf("Credential: %s (type: %s, username: %s)", entry.Name, entry.Type, entry.Username)

	return map[string]interface{}{
		"content": []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": sanitized,
			},
		},
		"entry": entry,
	}, nil
}

func (s *Server) toolUpdateCredential(id string, entry *models.Entry) (interface{}, error) {
	entry.ID = id

	if err := s.service.UpdateEntry(entry); err != nil {
		s.audit.LogAccess("mcp", "update", id, false)
		return nil, err
	}

	s.audit.LogAccess("mcp", "update", id, true)

	return map[string]interface{}{
		"content": []interface{}{
			map[string]interface{}{
				"type": "text",
				"text": fmt.Sprintf("Updated credential: %s", entry.Name),
			},
		},
	}, nil
}
