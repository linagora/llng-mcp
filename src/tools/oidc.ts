import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { OidcConfig } from "../config.js";
import { TransportRegistry } from "../transport/registry.js";

// Cache for OIDC discovery documents, keyed by issuer with TTL
const discoveryCache = new Map<string, { metadata: any; fetchedAt: number }>();
const DISCOVERY_CACHE_TTL_MS = 3600_000; // 1 hour

async function getDiscoveryMetadata(config: OidcConfig): Promise<any> {
  const cached = discoveryCache.get(config.issuer);
  if (cached && Date.now() - cached.fetchedAt < DISCOVERY_CACHE_TTL_MS) {
    return cached.metadata;
  }

  const url = `${config.issuer}/.well-known/openid-configuration`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch discovery metadata: ${response.status} ${response.statusText}`,
    );
  }

  const metadata = await response.json();
  discoveryCache.set(config.issuer, { metadata, fetchedAt: Date.now() });
  return metadata;
}

function generateCodeVerifier(): string {
  return randomBytes(32).toString("base64url");
}

function generateCodeChallenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

function generateState(): string {
  return randomBytes(16).toString("base64url");
}

function isUrlSafe(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return false;
    }
    const hostname = parsed.hostname;
    // Block private/link-local/loopback IPs
    if (
      hostname === "localhost" ||
      hostname.startsWith("127.") ||
      hostname === "[::1]" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      hostname.startsWith("169.254.") ||
      hostname.startsWith("0.") ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  base64 += "=".repeat((4 - (base64.length % 4)) % 4);
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function registerOidcTools(server: McpServer, registry: TransportRegistry): void {
  server.tool(
    "llng_oidc_metadata",
    "Fetch OIDC discovery metadata",
    {
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);
      return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
    } catch (e: unknown) {
      return {
        content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
        isError: true,
      };
    }
  });

  server.tool(
    "llng_oidc_authorize",
    "Get authorization URL with PKCE",
    {
      scope: z.string().optional(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);
        const codeVerifier = generateCodeVerifier();
        const codeChallenge = generateCodeChallenge(codeVerifier);
        const state = generateState();
        const scope = params.scope || config.scope;

        const authUrl = new URL(metadata.authorization_endpoint);
        authUrl.searchParams.set("response_type", "code");
        authUrl.searchParams.set("client_id", config.clientId);
        authUrl.searchParams.set("redirect_uri", config.redirectUri);
        authUrl.searchParams.set("scope", scope);
        authUrl.searchParams.set("code_challenge", codeChallenge);
        authUrl.searchParams.set("code_challenge_method", "S256");
        authUrl.searchParams.set("state", state);

        const result = {
          url: authUrl.toString(),
          code_verifier: codeVerifier,
          state: state,
        };

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
    "llng_oidc_tokens",
    "Exchange authorization code for tokens",
    {
      code: z.string(),
      code_verifier: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", params.code);
        body.set("redirect_uri", config.redirectUri);
        body.set("client_id", config.clientId);
        body.set("code_verifier", params.code_verifier);

        if (config.clientSecret) {
          body.set("client_secret", config.clientSecret);
        }

        const response = await fetch(metadata.token_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Error: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

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
    "llng_oidc_userinfo",
    "Get user info from OIDC provider",
    {
      access_token: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);
        const response = await fetch(metadata.userinfo_endpoint, {
          headers: {
            Authorization: `Bearer ${params.access_token}`,
          },
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Error: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

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
    "llng_oidc_introspect",
    "Introspect an access token",
    {
      token: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);

        if (!metadata.introspection_endpoint) {
          return {
            content: [{ type: "text", text: "Error: Introspection endpoint not supported" }],
            isError: true,
          };
        }

        const body = new URLSearchParams();
        body.set("token", params.token);
        body.set("client_id", config.clientId);

        if (config.clientSecret) {
          body.set("client_secret", config.clientSecret);
        }

        const response = await fetch(metadata.introspection_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Error: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

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
    "llng_oidc_refresh",
    "Refresh an access token",
    {
      refresh_token: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const metadata = await getDiscoveryMetadata(config);
        const body = new URLSearchParams();
        body.set("grant_type", "refresh_token");
        body.set("refresh_token", params.refresh_token);
        body.set("client_id", config.clientId);

        if (config.clientSecret) {
          body.set("client_secret", config.clientSecret);
        }

        const response = await fetch(metadata.token_endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: body.toString(),
        });

        const result = await response.json();

        if (!response.ok) {
          return {
            content: [{ type: "text", text: `Error: ${JSON.stringify(result)}` }],
            isError: true,
          };
        }

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
    "llng_oidc_whoami",
    "Decode ID token to show identity (WARNING: signature is NOT verified, for debugging only)",
    {
      id_token: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const parts = params.id_token.split(".");
        if (parts.length !== 3) {
          return { content: [{ type: "text", text: "Error: Invalid JWT format" }], isError: true };
        }

        const payload = JSON.parse(base64UrlDecode(parts[1]));
        const result = {
          _warning:
            "UNVERIFIED - JWT signature was NOT checked. Do not trust these claims for authorization decisions.",
          ...payload,
        };
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
    "llng_oidc_check_auth",
    "Check if a URL requires authentication (only public URLs allowed, private/internal IPs blocked)",
    {
      url: z.string().url(),
      access_token: z.string(),
      instance: z.string().optional().describe("LLNG instance name (uses default if omitted)"),
    },
    async (params) => {
      try {
        const config = registry.getOidcConfig(params.instance);
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        if (!isUrlSafe(params.url)) {
          return {
            content: [
              {
                type: "text",
                text: "Error: URL must be a public HTTP(S) URL. Private, loopback, and link-local addresses are blocked.",
              },
            ],
            isError: true,
          };
        }

        const response = await fetch(params.url, {
          headers: {
            Authorization: `Bearer ${params.access_token}`,
          },
          redirect: "manual",
        });

        const result = {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
        };

        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      } catch (e: unknown) {
        return {
          content: [{ type: "text", text: `Error: ${e instanceof Error ? e.message : String(e)}` }],
          isError: true,
        };
      }
    },
  );
}
