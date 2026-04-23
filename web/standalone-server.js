#!/usr/bin/env node
/**
 * Standalone Web UI Server for Claw Credential Manager
 * Acts as a proxy to the Go HTTP API server
 */

const express = require('express');
const path = require('path');
const axios = require('axios');

const app = express();
const PORT = process.env.WEB_PORT || 8080;
const API_BASE = process.env.API_BASE || 'http://127.0.0.1:8765';
const API_KEY = process.env.CLAW_API_KEY || 'claw_1776839434829992000';

// Middleware
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// CORS
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// UI Route
app.get('/', (req, res) => {
  res.render('index', { title: 'Claw Credential Manager' });
});

// Proxy API routes
app.get('/api/entries', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE}/entries`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error('List entries error:', err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.error || err.message
    });
  }
});

app.get('/api/entries/:id', async (req, res) => {
  try {
    const response = await axios.get(`${API_BASE}/entries/${req.params.id}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    res.json(response.data);
  } catch (err) {
    console.error('Get entry error:', err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data?.error || err.message
    });
  }
});

app.post('/api/entries', async (req, res) => {
  try {
    const response = await axios.post(`${API_BASE}/entries`, req.body, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.status(201).json(response.data);
  } catch (err) {
    console.error('Create entry error:', err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

app.put('/api/entries/:id', async (req, res) => {
  try {
    const response = await axios.put(`${API_BASE}/entries/${req.params.id}`, req.body, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    res.json(response.data);
  } catch (err) {
    console.error('Update entry error:', err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

app.delete('/api/entries/:id', async (req, res) => {
  try {
    await axios.delete(`${API_BASE}/entries/${req.params.id}`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    res.status(204).send();
  } catch (err) {
    console.error('Delete entry error:', err.message);
    res.status(err.response?.status || 500).json({
      error: err.response?.data || err.message
    });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    // Try to list entries as health check (health endpoint requires auth)
    const response = await axios.get(`${API_BASE}/entries`, {
      headers: { 'Authorization': `Bearer ${API_KEY}` }
    });
    res.json({
      status: 'ok',
      backend: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    res.status(503).json({
      status: 'error',
      error: 'Backend API is not available',
      timestamp: new Date().toISOString()
    });
  }
});

// Export cookies from Chrome Debug
app.post('/api/export-cookies', async (req, res) => {
  const { exec } = require('child_process');
  const util = require('util');
  const execPromise = util.promisify(exec);

  try {
    const scriptsDir = path.join(__dirname, '..', 'scripts');
    const exportScript = path.join(scriptsDir, 'export-all-cookies.sh');

    // 检查脚本是否存在
    if (!require('fs').existsSync(exportScript)) {
      return res.status(404).json({
        error: 'Export script not found',
        path: exportScript
      });
    }

    // 执行导出脚本
    const { stdout, stderr } = await execPromise(exportScript, {
      cwd: scriptsDir,
      env: { ...process.env, CLAW_API_KEY: API_KEY }
    });

    // 解析输出
    const output = stdout + stderr;
    const successMatch = output.match(/✅ 成功: (\d+)/);
    const failMatch = output.match(/❌ 失败: (\d+)/);
    const skipMatch = output.match(/⏭️  跳过: (\d+)/);

    res.json({
      success: true,
      message: 'Cookies exported successfully',
      stats: {
        success: successMatch ? parseInt(successMatch[1]) : 0,
        failed: failMatch ? parseInt(failMatch[1]) : 0,
        skipped: skipMatch ? parseInt(skipMatch[1]) : 0
      },
      output: output
    });
  } catch (err) {
    console.error('Export cookies error:', err);
    res.status(500).json({
      error: 'Failed to export cookies',
      message: err.message,
      details: err.stderr || err.stdout
    });
  }
});

// Start server
app.listen(PORT, '127.0.0.1', () => {
  console.log(`
========================================
Claw Credential Manager - Web UI
========================================
Web UI:     http://127.0.0.1:${PORT}
API Proxy:  ${API_BASE}
========================================
  `);
});

// Graceful shutdown
process.on('SIGINT', () => {
  console.log('\nShutting down Web UI...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\nShutting down Web UI...');
  process.exit(0);
});
