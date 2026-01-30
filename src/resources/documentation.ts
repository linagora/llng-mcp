import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";

/**
 * Register LLNG documentation resource template
 */
export function registerDocumentationResource(server: McpServer): void {
  const template = new ResourceTemplate("llng://documentation/{page}", {
    list: undefined, // No dynamic listing of documentation pages
  });

  server.resource(
    "llng-documentation",
    template,
    { description: "Fetch Lemonldap-NG documentation page" },
    async (uri, variables) => {
      const page = variables.page as string;
      const url = `https://lemonldap-ng.org/documentation/latest/${page}`;

      try {
        const resp = await fetch(url);
        if (!resp.ok) {
          throw new Error(`HTTP ${resp.status}: ${resp.statusText}`);
        }

        const html = await resp.text();

        // Strip HTML tags for simple text extraction
        const text = html
          .replace(/<head[^>]*>[\s\S]*?<\/head>/gi, "")
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<[^>]*>/g, " ")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/&nbsp;/g, " ")
          .replace(/\s+/g, " ")
          .trim();

        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text,
            },
          ],
        };
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: "text/plain",
              text: `Error fetching documentation: ${errorMessage}`,
            },
          ],
        };
      }
    },
  );
}
