import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { randomBytes, createHash } from "crypto";
import { OidcConfig } from "../config.js";

// Cache for OIDC discovery document
let discoveryCache: { issuer: string; metadata: any } | null = null;

async function getDiscoveryMetadata(config: OidcConfig): Promise<any> {
  if (discoveryCache && discoveryCache.issuer === config.issuer) {
    return discoveryCache.metadata;
  }

  const url = `${config.issuer}/.well-known/openid-configuration`;
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(
      `Failed to fetch discovery metadata: ${response.status} ${response.statusText}`,
    );
  }

  const metadata = await response.json();
  discoveryCache = { issuer: config.issuer, metadata };
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

function base64UrlDecode(str: string): string {
  // Convert base64url to base64
  let base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Add padding if needed
  while (base64.length % 4 !== 0) {
    base64 += "=";
  }
  return Buffer.from(base64, "base64").toString("utf-8");
}

export function registerOidcTools(server: McpServer, config: OidcConfig | undefined): void {
  server.tool("llng_oidc_metadata", "Fetch OIDC discovery metadata", {}, async () => {
    try {
      if (!config) {
        return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
      }

      const metadata = await getDiscoveryMetadata(config);
      return { content: [{ type: "text", text: JSON.stringify(metadata, null, 2) }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
    }
  });

  server.tool(
    "llng_oidc_authorize",
    "Get authorization URL with PKCE",
    { scope: z.string().optional() },
    async (params) => {
      try {
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_tokens",
    "Exchange authorization code for tokens",
    { code: z.string(), code_verifier: z.string() },
    async (params) => {
      try {
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_userinfo",
    "Get user info from OIDC provider",
    { access_token: z.string() },
    async (params) => {
      try {
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_introspect",
    "Introspect an access token",
    { token: z.string() },
    async (params) => {
      try {
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_refresh",
    "Refresh an access token",
    { refresh_token: z.string() },
    async (params) => {
      try {
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_whoami",
    "Decode ID token to show identity",
    { id_token: z.string() },
    async (params) => {
      try {
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
        }

        const parts = params.id_token.split(".");
        if (parts.length !== 3) {
          return { content: [{ type: "text", text: "Error: Invalid JWT format" }], isError: true };
        }

        const payload = JSON.parse(base64UrlDecode(parts[1]));
        return { content: [{ type: "text", text: JSON.stringify(payload, null, 2) }] };
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );

  server.tool(
    "llng_oidc_check_auth",
    "Check if a URL requires authentication",
    { url: z.string(), access_token: z.string() },
    async (params) => {
      try {
        if (!config) {
          return { content: [{ type: "text", text: "Error: OIDC not configured" }], isError: true };
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
      } catch (e: any) {
        return { content: [{ type: "text", text: `Error: ${e.message}` }], isError: true };
      }
    },
  );
}
