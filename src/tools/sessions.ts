import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionFilter } from "../transport/interface.js";
import { TransportRegistry } from "../transport/registry.js";

/**
 * Register LLNG session management tools
 */
export function registerSessionTools(server: McpServer, registry: TransportRegistry): void {
  // 1. llng_session_get - Get LLNG session by ID
  server.tool(
    "llng_session_get",
    "Get LLNG session by ID",
    {
      id: z.string().describe("The session ID to retrieve"),
      backend: z
        .string()
        .optional()
        .describe("Optional backend type (persistent, oidc, saml, cas)"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const result = await transport.sessionGet(args.id, args.backend);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 2. llng_session_search - Search LLNG sessions
  server.tool(
    "llng_session_search",
    "Search LLNG sessions",
    {
      where: z
        .record(z.string(), z.string())
        .optional()
        .describe("Field=value pairs for filtering"),
      select: z.array(z.string()).optional().describe("Fields to return in results"),
      backend: z.string().optional().describe("Backend type (persistent, oidc, saml, cas)"),
      count: z.boolean().optional().describe("Return only the count of matching sessions"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const filters: SessionFilter = {
          where: args.where,
          select: args.select,
          backend: args.backend,
          count: args.count,
        };
        const result = await transport.sessionSearch(filters);
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(result, null, 2),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 3. llng_session_delete - Delete LLNG session(s)
  server.tool(
    "llng_session_delete",
    "Delete LLNG session(s)",
    {
      ids: z.array(z.string()).describe("Array of session IDs to delete"),
      backend: z
        .string()
        .optional()
        .describe("Optional backend type (persistent, oidc, saml, cas)"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        await transport.sessionDelete(args.ids, args.backend);
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted ${args.ids.length} session(s)`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 4. llng_session_setKey - Set key(s) in an LLNG session
  server.tool(
    "llng_session_setKey",
    "Set key(s) in an LLNG session",
    {
      id: z.string().describe("The session ID to modify"),
      keys: z.record(z.string(), z.any()).describe("Key-value pairs to set in the session"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        await transport.sessionSetKey(args.id, args.keys);
        return {
          content: [
            {
              type: "text",
              text: `Successfully updated keys in session '${args.id}'`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 5. llng_session_delKey - Delete key(s) from an LLNG session
  server.tool(
    "llng_session_delKey",
    "Delete key(s) from an LLNG session",
    {
      id: z.string().describe("The session ID to modify"),
      keys: z.array(z.string()).describe("Array of keys to delete from the session"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        await transport.sessionDelKey(args.id, args.keys);
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted keys from session '${args.id}'`,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );

  // 6. llng_session_backup - Backup all LLNG sessions
  server.tool(
    "llng_session_backup",
    "Backup all LLNG sessions",
    {
      backend: z
        .string()
        .optional()
        .describe("Optional backend type to backup (persistent, oidc, saml, cas)"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const result = await transport.sessionBackup(args.backend);
        return {
          content: [
            {
              type: "text",
              text: result,
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: "text",
              text: `Error: ${error instanceof Error ? error.message : String(error)}`,
            },
          ],
          isError: true,
        };
      }
    },
  );
}
