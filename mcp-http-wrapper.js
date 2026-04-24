#!/usr/bin/env node
/**
 * MCP HTTP Wrapper for CLAW Credential Manager
 *
 * 将容器的 HTTP API 适配为 MCP stdio 协议
 * 这样 OpenClaw 可以通过标准 MCP 协议访问容器中的凭证
 */

const axios = require('axios');
const readline = require('readline');

// 配置
const API_BASE = process.env.CLAW_API_BASE || 'http://localhost:8002';
const API_KEY = process.env.CLAW_API_KEY || 'd59df52d3a8b6e9843c2632e9a8440aa59d68b649018cf30fb64112c323d7124';

// MCP 协议处理
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: false
});

// 日志到 stderr（不影响 stdio MCP 通信）
function log(message) {
  console.error(`[MCP Wrapper] ${message}`);
}

// 发送 MCP 响应
function sendResponse(id, result) {
  const response = {
    jsonrpc: '2.0',
    id: id,
    result: result
  };
  console.log(JSON.stringify(response));
}

// 发送 MCP 错误
function sendError(id, code, message) {
  const response = {
    jsonrpc: '2.0',
    id: id,
    error: {
      code: code,
      message: message
    }
  };
  console.log(JSON.stringify(response));
}

// 从 HTTP API 获取凭证
async function getCredential(entryId) {
  try {
    const response = await axios.get(`${API_BASE}/entries/${entryId}`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to get credential: ${error.message}`);
  }
}

// 列出所有凭证
async function listCredentials() {
  try {
    const response = await axios.get(`${API_BASE}/entries`, {
      headers: {
        'Authorization': `Bearer ${API_KEY}`
      }
    });
    return response.data;
  } catch (error) {
    throw new Error(`Failed to list credentials: ${error.message}`);
  }
}

// 处理 MCP 请求
async function handleRequest(request) {
  const { id, method, params } = request;

  try {
    switch (method) {
      case 'initialize':
        log('Initializing MCP wrapper...');
        sendResponse(id, {
          protocolVersion: '2024-11-05',
          capabilities: {
            tools: {}
          },
          serverInfo: {
            name: 'claw-credential-manager-wrapper',
            version: '1.0.0'
          }
        });
        break;

      case 'tools/list':
        log('Listing tools...');
        sendResponse(id, {
          tools: [
            {
              name: 'get_credential',
              description: 'Get a credential entry from the vault',
              inputSchema: {
                type: 'object',
                properties: {
                  id: {
                    type: 'string',
                    description: 'The ID of the credential entry'
                  }
                },
                required: ['id']
              }
            },
            {
              name: 'list_credentials',
              description: 'List all credential entries in the vault',
              inputSchema: {
                type: 'object',
                properties: {}
              }
            }
          ]
        });
        break;

      case 'tools/call':
        const { name, arguments: args } = params;
        log(`Calling tool: ${name}`);

        if (name === 'get_credential') {
          const credential = await getCredential(args.id);
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(credential, null, 2)
              }
            ]
          });
        } else if (name === 'list_credentials') {
          const credentials = await listCredentials();
          sendResponse(id, {
            content: [
              {
                type: 'text',
                text: JSON.stringify(credentials, null, 2)
              }
            ]
          });
        } else {
          sendError(id, -32601, `Unknown tool: ${name}`);
        }
        break;

      default:
        log(`Unknown method: ${method}`);
        sendError(id, -32601, `Method not found: ${method}`);
    }
  } catch (error) {
    log(`Error: ${error.message}`);
    sendError(id, -32603, error.message);
  }
}

// 主程序
log('MCP HTTP Wrapper starting...');
log(`API Base: ${API_BASE}`);

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    await handleRequest(request);
  } catch (error) {
    log(`Parse error: ${error.message}`);
  }
});

rl.on('close', () => {
  log('MCP Wrapper shutting down...');
  process.exit(0);
});
