package vault

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"

	"github.com/google/uuid"
	"github.com/jiangyi/claw-credential-manager/pkg/models"
	"github.com/tobischo/gokeepasslib/v3"
	w "github.com/tobischo/gokeepasslib/v3/wrappers"
)

// KDBXBackend implements Backend using KeePass .kdbx format
type KDBXBackend struct {
	mu       sync.RWMutex
	db       *gokeepasslib.Database
	filePath string
	password string
}

// NewKDBXBackend creates a new KeePass backend
func NewKDBXBackend(filePath string) *KDBXBackend {
	return &KDBXBackend{
		filePath: filePath,
	}
}

func (b *KDBXBackend) Open(password string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	b.password = password

	// Check if file exists
	if _, err := os.Stat(b.filePath); os.IsNotExist(err) {
		// Create new database
		return b.createNewDatabase()
	}

	return b.loadDatabaseLocked()
}

// loadDatabaseLocked reloads the database from disk (caller must hold lock)
func (b *KDBXBackend) loadDatabaseLocked() error {
	// Open existing database
	file, err := os.Open(b.filePath)
	if err != nil {
		return fmt.Errorf("open kdbx file: %w", err)
	}
	defer file.Close()

	db := gokeepasslib.NewDatabase()
	db.Credentials = gokeepasslib.NewPasswordCredentials(b.password)

	if err := gokeepasslib.NewDecoder(file).Decode(db); err != nil {
		return fmt.Errorf("decode kdbx: %w", err)
	}

	if err := db.UnlockProtectedEntries(); err != nil {
		return fmt.Errorf("unlock entries: %w", err)
	}

	b.db = db
	return nil
}

func (b *KDBXBackend) createNewDatabase() error {
	db := gokeepasslib.NewDatabase()
	db.Credentials = gokeepasslib.NewPasswordCredentials(b.password)

	// Create root group
	rootGroup := gokeepasslib.NewGroup()
	rootGroup.Name = "Claw Credentials"
	db.Content.Root = &gokeepasslib.RootData{
		Groups: []gokeepasslib.Group{rootGroup},
	}

	b.db = db
	return b.save()
}

func (b *KDBXBackend) Close() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.db = nil
	return nil
}

func (b *KDBXBackend) ListEntries() ([]*models.EntryListItem, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Reload database to get latest data
	if err := b.loadDatabaseLocked(); err != nil {
		return nil, fmt.Errorf("reload database: %w", err)
	}

	if b.db == nil {
		return nil, fmt.Errorf("database not opened")
	}

	var items []*models.EntryListItem
	for _, group := range b.db.Content.Root.Groups {
		for _, entry := range group.Entries {
			item, err := b.entryToListItem(&entry)
			if err != nil {
				continue // Skip malformed entries
			}
			items = append(items, item)
		}
	}

	return items, nil
}

func (b *KDBXBackend) GetEntry(id string) (*models.Entry, error) {
	b.mu.Lock()
	defer b.mu.Unlock()

	// Reload database to get latest data
	if err := b.loadDatabaseLocked(); err != nil {
		return nil, fmt.Errorf("reload database: %w", err)
	}

	if b.db == nil {
		return nil, fmt.Errorf("database not opened")
	}

	kdbxEntry, err := b.findEntryByID(id)
	if err != nil {
		return nil, err
	}

	return b.kdbxToEntry(kdbxEntry)
}

func (b *KDBXBackend) CreateEntry(entry *models.Entry) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.db == nil {
		return fmt.Errorf("database not opened")
	}

	// Generate ID if not provided
	if entry.ID == "" {
		entry.ID = uuid.New().String()
	}

	// Check for duplicate ID
	if _, err := b.findEntryByID(entry.ID); err == nil {
		return fmt.Errorf("entry with ID %s already exists", entry.ID)
	}

	kdbxEntry := b.entryToKDBX(entry)

	// Add to first group (or create one if none exists)
	if len(b.db.Content.Root.Groups) == 0 {
		rootGroup := gokeepasslib.NewGroup()
		rootGroup.Name = "Claw Credentials"
		b.db.Content.Root.Groups = []gokeepasslib.Group{rootGroup}
	}

	b.db.Content.Root.Groups[0].Entries = append(b.db.Content.Root.Groups[0].Entries, kdbxEntry)

	return b.save()
}

func (b *KDBXBackend) UpdateEntry(entry *models.Entry) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.db == nil {
		return fmt.Errorf("database not opened")
	}

	// Find and update entry
	for gi, group := range b.db.Content.Root.Groups {
		for ei, existing := range group.Entries {
			if b.getEntryID(&existing) == entry.ID {
				b.db.Content.Root.Groups[gi].Entries[ei] = b.entryToKDBX(entry)
				return b.save()
			}
		}
	}

	return fmt.Errorf("entry not found: %s", entry.ID)
}

func (b *KDBXBackend) DeleteEntry(id string) error {
	b.mu.Lock()
	defer b.mu.Unlock()

	if b.db == nil {
		return fmt.Errorf("database not opened")
	}

	for gi, group := range b.db.Content.Root.Groups {
		for ei, entry := range group.Entries {
			if b.getEntryID(&entry) == id {
				// Remove entry
				b.db.Content.Root.Groups[gi].Entries = append(
					group.Entries[:ei],
					group.Entries[ei+1:]...,
				)
				return b.save()
			}
		}
	}

	return fmt.Errorf("entry not found: %s", id)
}

func (b *KDBXBackend) Sync() error {
	b.mu.Lock()
	defer b.mu.Unlock()
	return b.save()
}

// Helper methods

func (b *KDBXBackend) save() error {
	if b.db == nil {
		return fmt.Errorf("database not opened")
	}

	b.db.LockProtectedEntries()

	// Write to temp file first (atomic write)
	tempPath := b.filePath + ".tmp"
	file, err := os.OpenFile(tempPath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("create temp file: %w", err)
	}

	encoder := gokeepasslib.NewEncoder(file)
	if err := encoder.Encode(b.db); err != nil {
		file.Close()
		os.Remove(tempPath)
		return fmt.Errorf("encode database: %w", err)
	}

	if err := file.Sync(); err != nil {
		file.Close()
		os.Remove(tempPath)
		return fmt.Errorf("sync file: %w", err)
	}

	file.Close()

	// Atomic rename
	if err := os.Rename(tempPath, b.filePath); err != nil {
		os.Remove(tempPath)
		return fmt.Errorf("rename temp file: %w", err)
	}

	// Unlock again for continued use
	return b.db.UnlockProtectedEntries()
}

func (b *KDBXBackend) findEntryByID(id string) (*gokeepasslib.Entry, error) {
	for _, group := range b.db.Content.Root.Groups {
		for i := range group.Entries {
			entry := &group.Entries[i]
			// Try UUID match first
			if b.getEntryID(entry) == id {
				return entry, nil
			}
			// Try custom ID field match
			customID := entry.GetContent("CustomID")
			if customID != "" && customID == id {
				return entry, nil
			}
		}
	}
	return nil, fmt.Errorf("entry not found: %s", id)
}

func (b *KDBXBackend) getEntryID(entry *gokeepasslib.Entry) string {
	// Check for custom ID first
	customID := entry.GetContent("CustomID")
	if customID != "" {
		return customID
	}
	// Fall back to UUID
	return uuid.UUID(entry.UUID).String()
}

func (b *KDBXBackend) kdbxToEntry(kdbxEntry *gokeepasslib.Entry) (*models.Entry, error) {
	// Prefer custom ID over UUID
	customID := kdbxEntry.GetContent("CustomID")
	entryID := customID
	if entryID == "" {
		entryID = uuid.UUID(kdbxEntry.UUID).String()
	}

	entry := &models.Entry{
		ID:       entryID,
		Name:     kdbxEntry.GetTitle(),
		Username: kdbxEntry.GetContent("UserName"),
		Password: kdbxEntry.GetPassword(),
		Notes:    kdbxEntry.GetContent("Notes"),
	}

	// Parse custom fields from CustomData
	customFieldsData := kdbxEntry.GetContent("CustomFields")
	if customFieldsData != "" {
		var customFields map[string]interface{}
		if err := json.Unmarshal([]byte(customFieldsData), &customFields); err == nil {
			entry.CustomFields = customFields
		}
	}

	// Parse metadata
	metadataData := kdbxEntry.GetContent("Metadata")
	if metadataData != "" {
		var metadata models.EntryMetadata
		if err := json.Unmarshal([]byte(metadataData), &metadata); err == nil {
			entry.Metadata = &metadata
		}
	}

	// Parse tags
	tagsData := kdbxEntry.GetContent("Tags")
	if tagsData != "" {
		var tags []string
		if err := json.Unmarshal([]byte(tagsData), &tags); err == nil {
			entry.Tags = tags
		}
	}

	// Parse type
	typeData := kdbxEntry.GetContent("Type")
	if typeData != "" {
		entry.Type = typeData
	} else {
		entry.Type = "password"
	}

	return entry, nil
}

func (b *KDBXBackend) entryToKDBX(entry *models.Entry) gokeepasslib.Entry {
	kdbxEntry := gokeepasslib.NewEntry()

	// Try to parse ID as UUID; if it's not a valid UUID, store it as CustomID
	if id, err := uuid.Parse(entry.ID); err == nil {
		kdbxEntry.UUID = gokeepasslib.UUID(id)
	} else {
		// Not a UUID, generate one and store custom ID separately
		kdbxEntry.UUID = gokeepasslib.UUID(uuid.New())
	}

	// Set basic fields
	kdbxEntry.Values = []gokeepasslib.ValueData{
		{Key: "Title", Value: gokeepasslib.V{Content: entry.Name}},
		{Key: "UserName", Value: gokeepasslib.V{Content: entry.Username}},
		{Key: "Password", Value: gokeepasslib.V{Content: entry.Password, Protected: w.NewBoolWrapper(true)}},
		{Key: "Notes", Value: gokeepasslib.V{Content: entry.Notes}},
		{Key: "Type", Value: gokeepasslib.V{Content: entry.Type}},
	}

	// Store custom ID if not a UUID
	if _, err := uuid.Parse(entry.ID); err != nil {
		kdbxEntry.Values = append(kdbxEntry.Values,
			gokeepasslib.ValueData{Key: "CustomID", Value: gokeepasslib.V{Content: entry.ID}})
	}

	// Serialize custom fields
	if entry.CustomFields != nil {
		if data, err := json.Marshal(entry.CustomFields); err == nil {
			kdbxEntry.Values = append(kdbxEntry.Values,
				gokeepasslib.ValueData{Key: "CustomFields", Value: gokeepasslib.V{Content: string(data)}})
		}
	}

	// Serialize metadata
	if entry.Metadata != nil {
		if data, err := json.Marshal(entry.Metadata); err == nil {
			kdbxEntry.Values = append(kdbxEntry.Values,
				gokeepasslib.ValueData{Key: "Metadata", Value: gokeepasslib.V{Content: string(data)}})
		}
	}

	// Serialize tags
	if entry.Tags != nil {
		if data, err := json.Marshal(entry.Tags); err == nil {
			kdbxEntry.Values = append(kdbxEntry.Values,
				gokeepasslib.ValueData{Key: "Tags", Value: gokeepasslib.V{Content: string(data)}})
		}
	}

	kdbxEntry.Times = gokeepasslib.NewTimeData()

	return kdbxEntry
}

func (b *KDBXBackend) entryToListItem(kdbxEntry *gokeepasslib.Entry) (*models.EntryListItem, error) {
	item := &models.EntryListItem{
		ID:       b.getEntryID(kdbxEntry),
		Name:     kdbxEntry.GetTitle(),
		Username: kdbxEntry.GetContent("UserName"),
	}

	// Parse type
	typeData := kdbxEntry.GetContent("Type")
	if typeData != "" {
		item.Type = typeData
	} else {
		item.Type = "password"
	}

	// Parse tags
	tagsData := kdbxEntry.GetContent("Tags")
	if tagsData != "" {
		var tags []string
		if err := json.Unmarshal([]byte(tagsData), &tags); err == nil {
			item.Tags = tags
		}
	}

	// Parse metadata
	metadataData := kdbxEntry.GetContent("Metadata")
	if metadataData != "" {
		var metadata models.EntryMetadata
		if err := json.Unmarshal([]byte(metadataData), &metadata); err == nil {
			item.Metadata = &metadata
		}
	}

	return item, nil
}
