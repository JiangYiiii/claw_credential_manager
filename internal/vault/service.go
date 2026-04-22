package vault

import (
	"fmt"
	"path/filepath"
	"strings"

	"github.com/jiangyi/claw-credential-manager/pkg/models"
)

// Service provides high-level credential management operations
type Service struct {
	backend   Backend
	allowlist []string
}

// NewService creates a new credential service
func NewService(backend Backend, allowlist []string) *Service {
	return &Service{
		backend:   backend,
		allowlist: allowlist,
	}
}

// ListEntries returns all entries (without sensitive fields) that match the allowlist
func (s *Service) ListEntries() ([]*models.EntryListItem, error) {
	allEntries, err := s.backend.ListEntries()
	if err != nil {
		return nil, err
	}

	var filtered []*models.EntryListItem
	for _, entry := range allEntries {
		if s.isAllowed(entry.ID) {
			filtered = append(filtered, entry)
		}
	}

	return filtered, nil
}

// GetEntry retrieves a single entry by ID (with sensitive fields) if allowed
func (s *Service) GetEntry(id string) (*models.Entry, error) {
	if !s.isAllowed(id) {
		return nil, fmt.Errorf("entry %s not in allowlist", id)
	}

	return s.backend.GetEntry(id)
}

// CreateEntry creates a new entry if allowed
func (s *Service) CreateEntry(entry *models.Entry) error {
	if !s.isAllowed(entry.ID) && entry.ID != "" {
		return fmt.Errorf("entry %s not in allowlist", entry.ID)
	}

	return s.backend.CreateEntry(entry)
}

// UpdateEntry updates an existing entry if allowed
func (s *Service) UpdateEntry(entry *models.Entry) error {
	if !s.isAllowed(entry.ID) {
		return fmt.Errorf("entry %s not in allowlist", entry.ID)
	}

	return s.backend.UpdateEntry(entry)
}

// DeleteEntry deletes an entry if allowed
func (s *Service) DeleteEntry(id string) error {
	if !s.isAllowed(id) {
		return fmt.Errorf("entry %s not in allowlist", id)
	}

	return s.backend.DeleteEntry(id)
}

// isAllowed checks if an entry ID matches any pattern in the allowlist
func (s *Service) isAllowed(id string) bool {
	for _, pattern := range s.allowlist {
		matched, _ := filepath.Match(pattern, id)
		if matched {
			return true
		}

		// Also support simple prefix matching for patterns like "github-*"
		if strings.HasSuffix(pattern, "*") {
			prefix := strings.TrimSuffix(pattern, "*")
			if strings.HasPrefix(id, prefix) {
				return true
			}
		}

		// Exact match
		if pattern == id {
			return true
		}
	}

	return false
}
