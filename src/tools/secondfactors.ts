import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TransportRegistry } from "../transport/registry.js";

export function registerSecondFactorTools(server: McpServer, registry: TransportRegistry): void {
  server.tool(
    "llng_2fa_list",
    "List user's 2FA devices",
    {
      user: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const result = await transport.secondFactorsGet(params.user);
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
    "llng_2fa_delete",
    "Delete specific 2FA device(s)",
    {
      user: z.string(),
      ids: z.array(z.string()),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        await transport.secondFactorsDelete(params.user, params.ids);
        return {
          content: [
            { type: "text", text: `Successfully deleted ${params.ids.length} 2FA device(s)` },
          ],
        };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  server.tool(
    "llng_2fa_delType",
    "Delete all 2FA devices of a given type",
    {
      user: z.string(),
      type: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        await transport.secondFactorsDelType(params.user, params.type);
        return {
          content: [
            { type: "text", text: `Successfully deleted all '${params.type}' 2FA devices` },
          ],
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
