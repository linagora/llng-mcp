import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TransportRegistry } from "../transport/registry.js";

export function registerCliUtilityTools(server: McpServer, registry: TransportRegistry): void {
  // llng_download_saml_metadata
  server.tool(
    "llng_download_saml_metadata",
    "Download SAML metadata from a remote IdP",
    {
      url: z.string().describe("URL of the remote SAML metadata"),
      outputFile: z.string().optional().describe("Output file path for downloaded metadata"),
      noCheck: z.boolean().optional().describe("Disable SSL certificate verification"),
      verbose: z.boolean().optional().describe("Enable verbose output"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = ["--url", params.url];
        if (params.outputFile) args.push("--output-file", params.outputFile);
        if (params.noCheck) args.push("--no-check");
        if (params.verbose) args.push("--verbose");
        const result = await transport.execScript("downloadSamlMetadata", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_import_metadata
  server.tool(
    "llng_import_metadata",
    "Import a SAML federation into LLNG config",
    {
      url: z.string().describe("URL of the SAML federation metadata"),
      spPrefix: z.string().optional().describe("Prefix for SP entity IDs"),
      idpPrefix: z.string().optional().describe("Prefix for IdP entity IDs"),
      ignoreSp: z.array(z.string()).optional().describe("SP entity IDs to ignore"),
      ignoreIdp: z.array(z.string()).optional().describe("IdP entity IDs to ignore"),
      remove: z.boolean().optional().describe("Remove entities not in metadata"),
      noCheck: z.boolean().optional().describe("Disable SSL certificate verification"),
      verbose: z.boolean().optional().describe("Enable verbose output"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = ["--url", params.url];
        if (params.spPrefix) args.push("--sp-prefix", params.spPrefix);
        if (params.idpPrefix) args.push("--idp-prefix", params.idpPrefix);
        if (params.ignoreSp) {
          for (const sp of params.ignoreSp) {
            args.push("--ignore-sp", sp);
          }
        }
        if (params.ignoreIdp) {
          for (const idp of params.ignoreIdp) {
            args.push("--ignore-idp", idp);
          }
        }
        if (params.remove) args.push("--remove");
        if (params.noCheck) args.push("--no-check");
        if (params.verbose) args.push("--verbose");
        const result = await transport.execScript("importMetadata", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_delete_session
  server.tool(
    "llng_delete_session",
    "Delete user sessions by UID pattern",
    {
      uid: z.string().describe("UID pattern to match for session deletion"),
      force: z.boolean().optional().describe("Force deletion without confirmation"),
      debug: z.boolean().optional().describe("Enable debug output"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = ["--uid", params.uid];
        if (params.force) args.push("--force");
        if (params.debug) args.push("--debug");
        const result = await transport.execScript("llngDeleteSession", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_user_attributes
  server.tool(
    "llng_user_attributes",
    "Look up user attributes",
    {
      username: z.string().describe("Username to look up"),
      field: z.string().optional().describe("Specific field to return"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = ["--username", params.username];
        if (params.field) args.push("--field", params.field);
        const result = await transport.execScript("llngUserAttributes", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_purge_central_cache
  server.tool(
    "llng_purge_central_cache",
    "Purge expired sessions from central cache",
    {
      debug: z.boolean().optional().describe("Enable debug output"),
      force: z.boolean().optional().describe("Force purge without confirmation"),
      json: z.boolean().optional().describe("Output in JSON format"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = [];
        if (params.debug) args.push("--debug");
        if (params.force) args.push("--force");
        if (params.json) args.push("--json");
        const result = await transport.execScript("purgeCentralCache", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_purge_local_cache
  server.tool(
    "llng_purge_local_cache",
    "Purge local handler cache",
    {
      debug: z.boolean().optional().describe("Enable debug output"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = [];
        if (params.debug) args.push("--debug");
        const result = await transport.execScript("purgeLocalCache", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );

  // llng_rotate_oidc_keys
  server.tool(
    "llng_rotate_oidc_keys",
    "Rotate OIDC signing keys",
    {
      debug: z.boolean().optional().describe("Enable debug output"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const transport = registry.getTransport(params.instance);
        const args: string[] = [];
        if (params.debug) args.push("--debug");
        const result = await transport.execScript("rotateOidcKeys", args);
        return { content: [{ type: "text", text: result }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );
}
