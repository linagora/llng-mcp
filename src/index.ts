#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadMultiConfig } from "./config.js";
import { TransportRegistry } from "./transport/registry.js";
import { registerConfigTools } from "./tools/config.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerSecondFactorTools } from "./tools/secondfactors.js";
import { registerConsentTools } from "./tools/consents.js";
import { registerOidcTools } from "./tools/oidc.js";
import { registerInstanceTools } from "./tools/instances.js";
import { registerDocumentationResource } from "./resources/documentation.js";

async function main() {
  const multiConfig = loadMultiConfig();
  const registry = new TransportRegistry(multiConfig);

  // Create MCP server
  const server = new McpServer({
    name: "llng-mcp",
    version: "0.1.0",
  });

  // Register all tools
  registerConfigTools(server, registry);
  registerSessionTools(server, registry);
  registerSecondFactorTools(server, registry);
  registerConsentTools(server, registry);
  registerOidcTools(server, registry);
  registerInstanceTools(server, registry);

  // Register resources
  registerDocumentationResource(server);

  // Start server
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error));
  process.exit(1);
});
