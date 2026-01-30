import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TransportRegistry } from "../transport/registry.js";

export function registerConsentTools(server: McpServer, registry: TransportRegistry): void {
  server.tool(
    "llng_consent_list",
    "List user's OIDC consents",
    {
      user: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const result = await transport.consentsGet(params.user);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "llng_consent_delete",
    "Delete user's OIDC consent(s)",
    {
      user: z.string(),
      ids: z.array(z.string()),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        await transport.consentsDelete(params.user, params.ids);
        return {
          content: [{ type: "text", text: `Successfully deleted ${params.ids.length} consent(s)` }],
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );
}
