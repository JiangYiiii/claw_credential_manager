const express = require('express');
const path = require('path');

class WebUIServer {
  constructor(vaultService, config, logger) {
    this.service = vaultService;
    this.config = config;
    this.logger = logger;
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(express.json());
    this.app.use(express.static(path.join(__dirname, 'public')));
    this.app.set('view engine', 'ejs');
    this.app.set('views', path.join(__dirname, 'views'));

    // CORS
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
      res.header('Access-Control-Allow-Headers', 'Content-Type');
      next();
    });

    // Logging
    this.app.use((req, res, next) => {
      this.logger.info(`${req.method} ${req.path}`);
      next();
    });
  }

  setupRoutes() {
    // UI Routes
    this.app.get('/', (req, res) => {
      res.render('index', { title: 'Claw Credential Manager' });
    });

    // API Routes
    this.app.get('/api/entries', this.handleListEntries.bind(this));
    this.app.get('/api/entries/:id', this.handleGetEntry.bind(this));
    this.app.post('/api/entries', this.handleCreateEntry.bind(this));
    this.app.put('/api/entries/:id', this.handleUpdateEntry.bind(this));
    this.app.delete('/api/entries/:id', this.handleDeleteEntry.bind(this));

    // Health check
    this.app.get('/api/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });
  }

  async handleListEntries(req, res) {
    try {
      const entries = await this.service.ListEntries();
      res.json({ entries, count: entries.length });
    } catch (err) {
      this.logger.error(`List entries error: ${err.message}`);
      res.status(500).json({ error: err.message });
    }
  }

  async handleGetEntry(req, res) {
    try {
      const entry = await this.service.GetEntry(req.params.id);
      res.json(entry);
    } catch (err) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes('not in allowlist')) {
        res.status(403).json({ error: err.message });
      } else {
        this.logger.error(`Get entry error: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    }
  }

  async handleCreateEntry(req, res) {
    try {
      const entry = req.body;
      await this.service.CreateEntry(entry);
      res.status(201).json(entry);
    } catch (err) {
      if (err.message.includes('not in allowlist')) {
        res.status(403).json({ error: err.message });
      } else {
        this.logger.error(`Create entry error: ${err.message}`);
        res.status(400).json({ error: err.message });
      }
    }
  }

  async handleUpdateEntry(req, res) {
    try {
      const entry = { ...req.body, id: req.params.id };
      await this.service.UpdateEntry(entry);
      res.json(entry);
    } catch (err) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes('not in allowlist')) {
        res.status(403).json({ error: err.message });
      } else {
        this.logger.error(`Update entry error: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    }
  }

  async handleDeleteEntry(req, res) {
    try {
      await this.service.DeleteEntry(req.params.id);
      res.status(204).send();
    } catch (err) {
      if (err.message.includes('not found')) {
        res.status(404).json({ error: err.message });
      } else if (err.message.includes('not in allowlist')) {
        res.status(403).json({ error: err.message });
      } else {
        this.logger.error(`Delete entry error: ${err.message}`);
        res.status(500).json({ error: err.message });
      }
    }
  }

  start(port = 8080) {
    this.server = this.app.listen(port, '127.0.0.1', () => {
      this.logger.info(`Web UI started on http://127.0.0.1:${port}`);
    });
  }

  stop() {
    if (this.server) {
      this.server.close();
      this.logger.info('Web UI stopped');
    }
  }
}

module.exports = WebUIServer;
