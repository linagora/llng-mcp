import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHash } from "crypto";
import { registerOidcTools } from "../tools/oidc.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OidcConfig } from "../config.js";

describe("OIDC Tools", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("PKCE generation", () => {
    it("should generate code_verifier with 43+ chars in base64url", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const metadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(metadata),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_authorize") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const authorizeHandler = toolResults.find((t) => t.name === "llng_oidc_authorize")?.handler;
      const result = await authorizeHandler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.code_verifier).toMatch(/^[A-Za-z0-9_-]{43,}$/);
      expect(parsed.code_verifier.length).toBeGreaterThanOrEqual(43);
    });

    it("should generate code_challenge as SHA256 of verifier in base64url", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const metadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(metadata),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_authorize") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const authorizeHandler = toolResults.find((t) => t.name === "llng_oidc_authorize")?.handler;
      const result = await authorizeHandler({});

      const parsed = JSON.parse(result.content[0].text);
      const verifier = parsed.code_verifier;
      const challenge = parsed.url.match(/code_challenge=([^&]+)/)?.[1];

      // Compute expected challenge
      const expectedChallenge = createHash("sha256").update(verifier).digest("base64url");

      expect(decodeURIComponent(challenge!)).toBe(expectedChallenge);
    });
  });

  describe("JWT decode (whoami)", () => {
    function makeJwt(payload: object): string {
      const header = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString(
        "base64url",
      );
      const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = "fakesignature";
      return `${header}.${body}.${sig}`;
    }

    it("should decode a valid JWT payload", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_whoami") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const whoamiHandler = toolResults.find((t) => t.name === "llng_oidc_whoami")?.handler;

      const payload = {
        sub: "user123",
        name: "John Doe",
        email: "john@example.com",
        iat: 1234567890,
        exp: 1234571490,
      };

      const jwt = makeJwt(payload);
      const result = await whoamiHandler({ id_token: jwt });

      expect(result.isError).toBeUndefined();
      const decoded = JSON.parse(result.content[0].text);
      expect(decoded).toEqual(payload);
    });

    it("should return error for invalid JWT format", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_whoami") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const whoamiHandler = toolResults.find((t) => t.name === "llng_oidc_whoami")?.handler;

      const result = await whoamiHandler({ id_token: "not.a.valid.jwt.token" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Invalid JWT format");
    });

    it("should handle JWT with special characters in payload", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_whoami") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const whoamiHandler = toolResults.find((t) => t.name === "llng_oidc_whoami")?.handler;

      const payload = {
        sub: "user@example.com",
        name: "José García",
        groups: ["admin", "users"],
      };

      const jwt = makeJwt(payload);
      const result = await whoamiHandler({ id_token: jwt });

      const decoded = JSON.parse(result.content[0].text);
      expect(decoded.name).toBe("José García");
      expect(decoded.groups).toEqual(["admin", "users"]);
    });
  });

  describe("OIDC not configured", () => {
    it("should return error when config is undefined", async () => {
      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          toolResults.push({ name, handler });
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, undefined);

      // Test each tool
      for (const tool of toolResults) {
        const result = await tool.handler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Error: OIDC not configured");
      }
    });
  });

  describe("Discovery metadata caching", () => {
    it("should fetch discovery metadata successfully", async () => {
      // Note: Discovery metadata caching is an implementation detail that uses
      // module-scoped state. This test verifies that the discovery endpoint
      // can be fetched successfully. Cache behavior is implicitly tested by
      // the fact that subsequent tool calls don't fail.

      const config: OidcConfig = {
        issuer: "https://cache-test.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const metadata = {
        issuer: "https://cache-test.example.com",
        authorization_endpoint: "https://cache-test.example.com/authorize",
        token_endpoint: "https://cache-test.example.com/token",
        userinfo_endpoint: "https://cache-test.example.com/userinfo",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(metadata),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          toolResults.push({ name, handler });
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const metadataHandler = toolResults.find((t) => t.name === "llng_oidc_metadata")?.handler;
      expect(metadataHandler).toBeDefined();

      const result = await metadataHandler!({});

      expect(result.isError).toBeUndefined();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.issuer).toBe("https://cache-test.example.com");
      expect(parsed.authorization_endpoint).toBe("https://cache-test.example.com/authorize");
    });
  });

  describe("Tool registration", () => {
    it("should register 8 OIDC tools", () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const toolNames: string[] = [];
      const mockServer = {
        tool: vi.fn((name: string) => {
          toolNames.push(name);
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      expect(toolNames).toEqual([
        "llng_oidc_metadata",
        "llng_oidc_authorize",
        "llng_oidc_tokens",
        "llng_oidc_userinfo",
        "llng_oidc_introspect",
        "llng_oidc_refresh",
        "llng_oidc_whoami",
        "llng_oidc_check_auth",
      ]);
    });
  });

  describe("Authorization URL generation", () => {
    it("should include all required PKCE parameters", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile email",
      };

      const metadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(metadata),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_authorize") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const authorizeHandler = toolResults.find((t) => t.name === "llng_oidc_authorize")?.handler;
      const result = await authorizeHandler({});

      const parsed = JSON.parse(result.content[0].text);
      const url = new URL(parsed.url);

      expect(url.searchParams.get("response_type")).toBe("code");
      expect(url.searchParams.get("client_id")).toBe("test-client");
      expect(url.searchParams.get("redirect_uri")).toBe("http://localhost:3000/callback");
      expect(url.searchParams.get("scope")).toBe("openid profile email");
      expect(url.searchParams.get("code_challenge")).toBeTruthy();
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("state")).toBeTruthy();
    });

    it("should use custom scope when provided", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const metadata = {
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(metadata),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_authorize") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const authorizeHandler = toolResults.find((t) => t.name === "llng_oidc_authorize")?.handler;
      const result = await authorizeHandler({ scope: "openid email offline_access" });

      const parsed = JSON.parse(result.content[0].text);
      const url = new URL(parsed.url);

      expect(url.searchParams.get("scope")).toBe("openid email offline_access");
    });
  });

  describe("Token exchange", () => {
    it("should send correct parameters in token request", async () => {
      const config: OidcConfig = {
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
        clientSecret: "secret123",
      };

      const metadata = {
        token_endpoint: "https://auth.example.com/token",
      };

      const tokenResponse = {
        access_token: "access123",
        id_token: "id123",
        token_type: "Bearer",
        expires_in: 3600,
      };

      const fetchCalls: any[] = [];
      const mockFetch = vi.fn().mockImplementation((url: string, options: any) => {
        fetchCalls.push({ url, options });
        // First call is discovery, second is token
        if (url.includes(".well-known")) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(metadata),
          });
        } else {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve(tokenResponse),
          });
        }
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          if (name === "llng_oidc_tokens") {
            toolResults.push({ name, handler });
          }
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const tokensHandler = toolResults.find((t) => t.name === "llng_oidc_tokens")?.handler;
      await tokensHandler({ code: "auth_code_123", code_verifier: "verifier123" });

      // Find the token endpoint call
      const tokenCall = fetchCalls.find((call) => call.url === "https://auth.example.com/token");
      expect(tokenCall).toBeDefined();
      expect(tokenCall.options.method).toBe("POST");

      const body = new URLSearchParams(tokenCall.options.body);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("auth_code_123");
      expect(body.get("code_verifier")).toBe("verifier123");
      expect(body.get("client_id")).toBe("test-client");
      expect(body.get("client_secret")).toBe("secret123");
      expect(body.get("redirect_uri")).toBe("http://localhost:3000/callback");
    });
  });

  describe("Error handling", () => {
    it("should handle fetch errors gracefully", async () => {
      // Use a unique issuer to avoid cache collision
      const config: OidcConfig = {
        issuer: "https://error-test-1.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const mockFetch = vi.fn().mockRejectedValue(new Error("Network error"));
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          toolResults.push({ name, handler });
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const metadataHandler = toolResults.find((t) => t.name === "llng_oidc_metadata")?.handler;
      expect(metadataHandler).toBeDefined();

      if (metadataHandler) {
        const result = await metadataHandler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("Network error");
      }
    });

    it("should handle HTTP error responses", async () => {
      // Use a unique issuer to avoid cache collision
      const config: OidcConfig = {
        issuer: "https://error-test-2.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      };

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: () => Promise.resolve({ error: "not_found" }),
      });
      global.fetch = mockFetch as any;

      const toolResults: any[] = [];
      const mockServer = {
        tool: vi.fn((name: string, desc: string, schema: any, handler: any) => {
          toolResults.push({ name, handler });
        }),
      } as unknown as McpServer;

      registerOidcTools(mockServer, config);

      const metadataHandler = toolResults.find((t) => t.name === "llng_oidc_metadata")?.handler;
      expect(metadataHandler).toBeDefined();

      if (metadataHandler) {
        const result = await metadataHandler({});
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toContain("404");
      }
    });
  });
});
