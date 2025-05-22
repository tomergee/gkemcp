#!/usr/bin/env node

/*
Copyright 2025 Google LLC

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

    https://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
// Support SSE for backward compatibility
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// Support stdio, as it is easier to use locally
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { registerTools, registerToolsRemote } from './tools.js';
import { checkGCP } from './lib/gcp-metadata.js';

const app = express();
const port = process.env.PORT || 8080;

app.use(express.json());

// Register tools based on environment
const gcpInfo = await checkGCP();
if (gcpInfo) {
  console.log('Running in GCP environment, registering remote tools...');
  await registerToolsRemote(app);
} else {
  console.log('Running locally, registering local tools...');
  registerTools(app);
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});

// Start server
app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});

// Handle server shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  process.exit(0);
});