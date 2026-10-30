#!/usr/bin/env node
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { createServer } from './server.js';

const config = loadConfig(process.argv[2]);
const server = createServer(config);
await server.connect(new StdioServerTransport());
// stdout is the MCP channel, so log to stderr only.
console.error(`test-automation-mcp-server ready with ${config.suites.length} suite(s)`);
