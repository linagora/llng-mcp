import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { SessionFilter, SessionGetOptions, SessionDeleteOptions } from "../transport/interface.js";
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
      refreshTokens: z
        .boolean()
        .optional()
        .describe("Filter for refresh token (offline) sessions only"),
      persistent: z
        .boolean()
        .optional()
        .describe("Shortcut for --backend persistent; also hashes UID for persistent session ID"),
      hash: z
        .boolean()
        .optional()
        .describe(
          "Indicates the given session ID is the original cookie value (for hashed session storage)",
        ),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const options: SessionGetOptions = {
          backend: args.backend,
          refreshTokens: args.refreshTokens,
          persistent: args.persistent,
          hash: args.hash,
        };
        const result = await transport.sessionGet(args.id, options);
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
      refreshTokens: z
        .boolean()
        .optional()
        .describe("Filter for refresh token (offline) sessions only"),
      persistent: z.boolean().optional().describe("Shortcut for --backend persistent"),
      hash: z.boolean().optional().describe("Indicates session IDs are original cookie values"),
      idOnly: z.boolean().optional().describe("Only return session IDs"),
      kind: z
        .string()
        .optional()
        .describe(
          "Filter by session kind: SSO, SAML, CAS, OIDC, Persistent. " +
            "This is a shortcut that adds _session_kind to the where filter",
        ),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const where = { ...args.where };
        if (args.kind) {
          where._session_kind = args.kind;
        }
        const filters: SessionFilter = {
          where: Object.keys(where).length > 0 ? where : undefined,
          select: args.select,
          backend: args.backend,
          count: args.count,
          refreshTokens: args.refreshTokens,
          persistent: args.persistent,
          hash: args.hash,
          idOnly: args.idOnly,
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
      ids: z
        .array(z.string())
        .optional()
        .describe("Array of session IDs to delete (not needed when using where)"),
      backend: z
        .string()
        .optional()
        .describe("Optional backend type (persistent, oidc, saml, cas)"),
      refreshTokens: z
        .boolean()
        .optional()
        .describe("Filter for refresh token (offline) sessions only"),
      persistent: z.boolean().optional().describe("Shortcut for --backend persistent"),
      hash: z.boolean().optional().describe("Indicates session IDs are original cookie values"),
      where: z
        .record(z.string(), z.string())
        .optional()
        .describe("Delete sessions matching filter instead of by ID"),
      kind: z
        .string()
        .optional()
        .describe(
          "Filter by session kind: SSO, SAML, CAS, OIDC, Persistent. " +
            "This is a shortcut that adds _session_kind to the where filter",
        ),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const where = { ...args.where };
        if (args.kind) {
          where._session_kind = args.kind;
        }
        const options: SessionDeleteOptions = {
          backend: args.backend,
          refreshTokens: args.refreshTokens,
          persistent: args.persistent,
          hash: args.hash,
          where: Object.keys(where).length > 0 ? where : undefined,
        };
        const ids = args.ids || [];
        await transport.sessionDelete(ids, options);
        const desc = args.where || args.kind ? "matching sessions" : `${ids.length} session(s)`;
        return {
          content: [
            {
              type: "text",
              text: `Successfully deleted ${desc}`,
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
      backend: z.string().optional().describe("Optional backend type"),
      refreshTokens: z.boolean().optional().describe("Target refresh token sessions"),
      persistent: z.boolean().optional().describe("Shortcut for --backend persistent"),
      hash: z.boolean().optional().describe("Session ID is original cookie value"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const options: SessionGetOptions = {
          backend: args.backend,
          refreshTokens: args.refreshTokens,
          persistent: args.persistent,
          hash: args.hash,
        };
        await transport.sessionSetKey(args.id, args.keys, options);
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
      backend: z.string().optional().describe("Optional backend type"),
      refreshTokens: z.boolean().optional().describe("Target refresh token sessions"),
      persistent: z.boolean().optional().describe("Shortcut for --backend persistent"),
      hash: z.boolean().optional().describe("Session ID is original cookie value"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const options: SessionGetOptions = {
          backend: args.backend,
          refreshTokens: args.refreshTokens,
          persistent: args.persistent,
          hash: args.hash,
        };
        await transport.sessionDelKey(args.id, args.keys, options);
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
      refreshTokens: z
        .boolean()
        .optional()
        .describe("Filter for refresh token (offline) sessions only"),
      persistent: z.boolean().optional().describe("Shortcut for --backend persistent"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance);
        const result = await transport.sessionBackup(
          args.backend,
          args.refreshTokens,
          args.persistent,
        );
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
