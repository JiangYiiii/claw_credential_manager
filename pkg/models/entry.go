package models

import "time"

// Entry represents a credential entry
type Entry struct {
	ID           string                 `json:"id"`
	Name         string                 `json:"name"`
	Type         string                 `json:"type"` // password, token, mixed
	Username     string                 `json:"username,omitempty"`
	Password     string                 `json:"password,omitempty"`
	CustomFields map[string]interface{} `json:"custom_fields,omitempty"`
	Tags         []string               `json:"tags,omitempty"`
	Notes        string                 `json:"notes,omitempty"`
	Metadata     *EntryMetadata         `json:"metadata,omitempty"`
}

// EntryMetadata contains token refresh and expiry information
type EntryMetadata struct {
	TokenExpiresAt     *time.Time `json:"token_expires_at,omitempty"`
	RefreshScriptPath  string     `json:"refresh_script_path,omitempty"`
	LastRefreshedAt    *time.Time `json:"last_refreshed_at,omitempty"`
	LastRefreshError   string     `json:"last_refresh_error,omitempty"`
	RefreshIntervalSec int        `json:"refresh_interval_sec,omitempty"`
}

// EntryListItem is a sanitized entry for list operations (no sensitive fields)
type EntryListItem struct {
	ID       string         `json:"id"`
	Name     string         `json:"name"`
	Type     string         `json:"type"`
	Username string         `json:"username,omitempty"`
	Tags     []string       `json:"tags,omitempty"`
	Metadata *EntryMetadata `json:"metadata,omitempty"`
}

// ToListItem converts Entry to EntryListItem (removes sensitive data)
func (e *Entry) ToListItem() *EntryListItem {
	return &EntryListItem{
		ID:       e.ID,
		Name:     e.Name,
		Type:     e.Type,
		Username: e.Username,
		Tags:     e.Tags,
		Metadata: e.Metadata,
	}
}
