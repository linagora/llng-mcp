import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { TransportRegistry } from "../transport/registry.js";

/**
 * Register LLNG configuration management tools
 */
export function registerConfigTools(server: McpServer, registry: TransportRegistry): void {
  // 1. llng_config_info - Get current LLNG config metadata
  server.tool(
    "llng_config_info",
    "Get current LLNG config metadata (number, author, date)",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        const result = await transport.configInfo();
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

  // 2. llng_config_get - Get LLNG config value(s) by key
  server.tool(
    "llng_config_get",
    "Get LLNG config value(s) by key",
    {
      keys: z.array(z.string()).describe("Array of config keys to retrieve"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        const result = await transport.configGet(args.keys);
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

  // 3. llng_config_set - Set LLNG config value(s)
  server.tool(
    "llng_config_set",
    "Set LLNG config value(s)",
    {
      keys: z.record(z.string(), z.any()).describe("Key-value pairs to set in config"),
      log: z.string().optional().describe("Optional log message for this change"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configSet(args.keys, args.log);
        return {
          content: [
            {
              type: "text",
              text: "Config values updated successfully",
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

  // 4. llng_config_addKey - Add subkey to a composite LLNG config parameter
  server.tool(
    "llng_config_addKey",
    "Add subkey to a composite LLNG config parameter",
    {
      key: z.string().describe("The composite config key"),
      subkey: z.string().describe("The subkey to add"),
      value: z.string().describe("The value for the subkey"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configAddKey(args.key, args.subkey, args.value);
        return {
          content: [
            {
              type: "text",
              text: `Subkey '${args.subkey}' added to '${args.key}' successfully`,
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

  // 5. llng_config_delKey - Delete subkey from a composite LLNG config parameter
  server.tool(
    "llng_config_delKey",
    "Delete subkey from a composite LLNG config parameter",
    {
      key: z.string().describe("The composite config key"),
      subkey: z.string().describe("The subkey to delete"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configDelKey(args.key, args.subkey);
        return {
          content: [
            {
              type: "text",
              text: `Subkey '${args.subkey}' deleted from '${args.key}' successfully`,
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

  // 6. llng_config_export - Export full LLNG config as JSON
  server.tool(
    "llng_config_export",
    "Export full LLNG config as JSON",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        const result = await transport.configSave();
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

  // 7. llng_config_import - Import LLNG config from JSON
  server.tool(
    "llng_config_import",
    "Import LLNG config from JSON",
    {
      json: z.string().describe("JSON string of the config to import"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configRestore(args.json);
        return {
          content: [
            {
              type: "text",
              text: "Config imported successfully",
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

  // 8. llng_config_merge - Merge JSON snippet into LLNG config
  server.tool(
    "llng_config_merge",
    "Merge JSON snippet into LLNG config",
    {
      json: z.string().describe("JSON string to merge into config"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configMerge(args.json);
        return {
          content: [
            {
              type: "text",
              text: "Config merged successfully",
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

  // 9. llng_config_rollback - Rollback LLNG config to previous version
  server.tool(
    "llng_config_rollback",
    "Rollback LLNG config to previous version",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configRollback();
        return {
          content: [
            {
              type: "text",
              text: "Config rolled back successfully",
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

  // 10. llng_config_update_cache - Force LLNG config cache update
  server.tool(
    "llng_config_update_cache",
    "Force LLNG config cache update",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configUpdateCache();
        return {
          content: [
            {
              type: "text",
              text: "Config cache updated successfully",
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

  // 11. llng_config_test_email - Send a test email to verify SMTP settings
  server.tool(
    "llng_config_test_email",
    "Send a test email to verify SMTP settings",
    {
      destination: z.string().describe("Email address to send the test email to"),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (args) => {
      try {
        const transport = registry.getTransport(args.instance, "manager");
        await transport.configTestEmail(args.destination);
        return {
          content: [
            {
              type: "text",
              text: `Test email sent successfully to ${args.destination}`,
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
