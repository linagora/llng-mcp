import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TransportRegistry } from "../transport/registry.js";

export function registerInstanceTools(server: McpServer, registry: TransportRegistry): void {
  server.tool(
    "llng_instances",
    "List available LLNG instances and their transport mode",
    {},
    async () => {
      const instances = registry.listInstances();
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(instances, null, 2),
          },
        ],
      };
    },
  );
}
