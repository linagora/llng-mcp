#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { SshTransport } from "./transport/ssh.js";
import { ApiTransport } from "./transport/api.js";
import { ILlngTransport } from "./transport/interface.js";
import { registerConfigTools } from "./tools/config.js";
import { registerSessionTools } from "./tools/sessions.js";
import { registerSecondFactorTools } from "./tools/secondfactors.js";
import { registerConsentTools } from "./tools/consents.js";
import { registerOidcTools } from "./tools/oidc.js";
import { registerDocumentationResource } from "./resources/documentation.js";

async function main() {
  const config = loadConfig();

  // Create transport based on mode
  let transport: ILlngTransport;
  if (config.mode === "api") {
    if (!config.api) {
      throw new Error("API mode requires 'api' configuration");
    }
    transport = new ApiTransport(config.api);
  } else {
    transport = new SshTransport(
      config.ssh ?? {
        cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
        configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
      },
    );
  }

  // Create MCP server
  const server = new McpServer({
    name: "llng-mcp",
    version: "0.1.0",
  });

  // Register all tools
  registerConfigTools(server, transport);
  registerSessionTools(server, transport);
  registerSecondFactorTools(server, transport);
  registerConsentTools(server, transport);
  registerOidcTools(server, config.oidc);

  // Register resources
  registerDocumentationResource(server);

  // Start server
  const stdioTransport = new StdioServerTransport();
  await server.connect(stdioTransport);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
