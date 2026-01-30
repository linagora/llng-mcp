import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TransportRegistry } from "../transport/registry.js";

const RP_CONFIG_KEYS = [
  "oidcRPMetaDataOptions",
  "oidcRPMetaDataExportedVars",
  "oidcRPMetaDataMacros",
  "oidcRPMetaDataScopeRules",
  "oidcRPMetaDataOptionsExtraClaims",
] as const;

/**
 * Register OIDC Relying Party management tools
 */
export function registerOidcRpTools(server: McpServer, registry: TransportRegistry): void {
  // 1. llng_oidc_rp_list - List OIDC Relying Parties
  server.tool(
    "llng_oidc_rp_list",
    "List configured OIDC Relying Parties with their clientID and displayName",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        const data = await transport.configGet(["oidcRPMetaDataOptions"]);
        const options = data["oidcRPMetaDataOptions"];

        if (!options || typeof options !== "object") {
          return {
            content: [{ type: "text", text: JSON.stringify([], null, 2) }],
          };
        }

        const list = Object.entries(options).map(([confKey, opts]: [string, any]) => ({
          confKey,
          clientID: opts?.oidcRPMetaDataOptionsClientID || "",
          displayName: opts?.oidcRPMetaDataOptionsDisplayName || "",
        }));

        return {
          content: [{ type: "text", text: JSON.stringify(list, null, 2) }],
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

  // 2. llng_oidc_rp_get - Get details of an OIDC RP
  server.tool(
    "llng_oidc_rp_get",
    "Get full details of an OIDC Relying Party by confKey",
    {
      confKey: z.string().describe("The RP configuration key (internal identifier)"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        const data = await transport.configGet([...RP_CONFIG_KEYS]);

        const result: Record<string, any> = {};
        for (const key of RP_CONFIG_KEYS) {
          const container = data[key];
          if (container && typeof container === "object" && args.confKey in container) {
            result[key] = (container as Record<string, unknown>)[args.confKey];
          }
        }

        return {
          content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
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

  // 3. llng_oidc_rp_add - Add a new OIDC RP
  server.tool(
    "llng_oidc_rp_add",
    "Add a new OIDC Relying Party",
    {
      confKey: z.string().describe("Internal identifier for the RP"),
      clientId: z.string().describe("OAuth2 client ID"),
      redirectUris: z.string().describe("Redirect URIs (space or newline separated)"),
      clientSecret: z.string().optional().describe("OAuth2 client secret"),
      displayName: z.string().optional().describe("Display name for the RP"),
      exportedVars: z
        .record(z.string(), z.string())
        .optional()
        .describe(
          'Claim-to-attribute mappings (default: {"name":"cn","preferred_username":"uid","email":"mail"})',
        ),
      extraClaims: z.record(z.string(), z.string()).optional().describe("Extra claims mappings"),
      options: z
        .record(z.string(), z.union([z.string(), z.number(), z.boolean()]))
        .optional()
        .describe("Additional raw OIDC RP options"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");

        const rpOptions: Record<string, string | number | boolean> = {
          oidcRPMetaDataOptionsClientID: args.clientId,
          oidcRPMetaDataOptionsRedirectUris: args.redirectUris,
          ...(args.options || {}),
        };

        if (args.clientSecret) {
          rpOptions.oidcRPMetaDataOptionsClientSecret = args.clientSecret;
        }
        if (args.displayName) {
          rpOptions.oidcRPMetaDataOptionsDisplayName = args.displayName;
        }

        const exportedVars = args.exportedVars || {
          name: "cn",
          preferred_username: "uid",
          email: "mail",
        };

        const mergeData: Record<string, any> = {
          oidcRPMetaDataOptions: {
            [args.confKey]: rpOptions,
          },
          oidcRPMetaDataExportedVars: {
            [args.confKey]: exportedVars,
          },
        };

        if (args.extraClaims) {
          mergeData.oidcRPMetaDataOptionsExtraClaims = {
            [args.confKey]: args.extraClaims,
          };
        }

        await transport.configMerge(JSON.stringify(mergeData));

        return {
          content: [
            {
              type: "text",
              text: `OIDC RP '${args.confKey}' added successfully with clientId '${args.clientId}'.`,
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

  // 4. llng_oidc_rp_delete - Delete an OIDC RP
  server.tool(
    "llng_oidc_rp_delete",
    "Delete an OIDC Relying Party by confKey",
    {
      confKey: z.string().describe("The RP configuration key to delete"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");

        for (const key of RP_CONFIG_KEYS) {
          await transport.configDelKey(key, args.confKey);
        }

        return {
          content: [
            {
              type: "text",
              text: `OIDC RP '${args.confKey}' deleted successfully.`,
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
