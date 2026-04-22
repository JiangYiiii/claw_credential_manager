package vault

import "github.com/jiangyi/claw-credential-manager/pkg/models"

// Backend defines the interface for credential storage backends
type Backend interface {
	// Open opens/unlocks the vault with the provided credentials
	Open(password string) error

	// Close closes the vault
	Close() error

	// ListEntries returns all entries without sensitive fields
	ListEntries() ([]*models.EntryListItem, error)

	// GetEntry retrieves a single entry by ID (with sensitive fields)
	GetEntry(id string) (*models.Entry, error)

	// CreateEntry creates a new entry
	CreateEntry(entry *models.Entry) error

	// UpdateEntry updates an existing entry
	UpdateEntry(entry *models.Entry) error

	// DeleteEntry deletes an entry by ID
	DeleteEntry(id string) error

	// Sync forces a write to disk
	Sync() error
}
