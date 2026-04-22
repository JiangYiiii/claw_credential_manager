.PHONY: build install test clean init

# Build the server
build:
	go build -o claw-vault-server ./cmd/server

# Build with version info
build-release:
	go build -ldflags="-s -w" -o claw-vault-server ./cmd/server

# Install to ~/bin
install: build
	mkdir -p ~/bin
	cp claw-vault-server ~/bin/
	@echo "Installed to ~/bin/claw-vault-server"
	@echo "Make sure ~/bin is in your PATH"

# Run tests
test:
	go test -v ./...

# Clean build artifacts
clean:
	rm -f claw-vault-server
	rm -f claw-vault-server-*

# Initialize vault (interactive)
init: build
	./claw-vault-server -init

# Run in HTTP mode
run: build
	./claw-vault-server

# Run in MCP mode
run-mcp: build
	./claw-vault-server -mcp

# Cross-compile for multiple platforms
build-all:
	GOOS=linux GOARCH=amd64 go build -o claw-vault-server-linux-amd64 ./cmd/server
	GOOS=linux GOARCH=arm64 go build -o claw-vault-server-linux-arm64 ./cmd/server
	GOOS=darwin GOARCH=amd64 go build -o claw-vault-server-darwin-amd64 ./cmd/server
	GOOS=darwin GOARCH=arm64 go build -o claw-vault-server-darwin-arm64 ./cmd/server
	GOOS=windows GOARCH=amd64 go build -o claw-vault-server-windows-amd64.exe ./cmd/server

# Format code
fmt:
	go fmt ./...

# Run linter
lint:
	golangci-lint run

# Update dependencies
deps:
	go mod tidy
	go mod verify
