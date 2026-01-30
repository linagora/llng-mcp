import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ILlngTransport } from "../transport/interface.js";

export function registerConsentTools(server: McpServer, transport: ILlngTransport): void {
  server.tool(
    "llng_consent_list",
    "List user's OIDC consents",
    { user: z.string() },
    async (params) => {
      try {
        const result = await transport.consentsGet(params.user);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_consent_delete",
    "Delete user's OIDC consent(s)",
    { user: z.string(), ids: z.array(z.string()) },
    async (params) => {
      try {
        const result = await transport.consentsDelete(params.user, params.ids);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );
}
