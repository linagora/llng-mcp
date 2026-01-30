import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ILlngTransport } from "../transport/interface.js";

export function registerSecondFactorTools(server: McpServer, transport: ILlngTransport): void {
  server.tool("llng_2fa_list", "List user's 2FA devices", { user: z.string() }, async (params) => {
    try {
      const result = await transport.secondFactorsGet(params.user);
      return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  });

  server.tool(
    "llng_2fa_delete",
    "Delete specific 2FA device(s)",
    { user: z.string(), ids: z.array(z.string()) },
    async (params) => {
      try {
        const result = await transport.secondFactorsDelete(params.user, params.ids);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_2fa_delType",
    "Delete all 2FA devices of a given type",
    { user: z.string(), type: z.string() },
    async (params) => {
      try {
        const result = await transport.secondFactorsDelType(params.user, params.type);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );
}
