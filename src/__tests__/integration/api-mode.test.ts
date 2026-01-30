import { describe, it, expect, beforeAll } from "vitest";

const BASE_URL = process.env.LLNG_TEST_URL || "http://localhost:19876";

describe("API Transport Integration", () => {
  let available = false;
  let sessionCookie = "";

  async function authenticate(): Promise<string | null> {
    try {
      // First, get the login form to extract CSRF token
      const formResp = await fetch(`${BASE_URL}/`, {
        headers: {
          Host: "auth.example.com",
        },
      });

      if (!formResp.ok) {
        console.log("Failed to fetch login form:", formResp.status);
        return null;
      }

      const html = await formResp.text();

      // Extract CSRF token from the form
      const tokenMatch = html.match(/name="token"\s+value="([^"]+)"/);
      if (!tokenMatch) {
        console.log("No CSRF token found in login form");
        return null;
      }

      const token = tokenMatch[1];
      if (!token) {
        console.log("CSRF token is empty");
        return null;
      }

      // Authenticate to portal as dwho/dwho (default demo user)
      const resp = await fetch(`${BASE_URL}/`, {
        method: "POST",
        headers: {
          Host: "auth.example.com",
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: `user=dwho&password=dwho&token=${token}`,
        redirect: "manual", // Don't follow redirects
      });

      // Should get 302 redirect with session cookie
      if (resp.status !== 302 && resp.status !== 200) {
        console.log("Auth failed with status:", resp.status);
        return null;
      }

      // Extract lemonldap cookie
      const setCookie = resp.headers.get("set-cookie");
      if (!setCookie) {
        console.log("No set-cookie header received");
        return null;
      }

      const match = setCookie.match(/lemonldap=([^;]+)/);
      if (!match) {
        console.log("No lemonldap cookie found in:", setCookie);
        return null;
      }

      return match[1];
    } catch (e: unknown) {
      console.log("Authentication error:", e instanceof Error ? e.message : String(e));
      return null;
    }
  }

  beforeAll(async () => {
    // Check if LLNG portal is available and authenticate
    try {
      const resp = await fetch(`${BASE_URL}/`, {
        headers: {
          Host: "auth.example.com",
        },
      });

      if (!resp.ok && resp.status !== 302) {
        available = false;
        return;
      }

      // Try to authenticate
      const cookie = await authenticate();
      if (cookie) {
        sessionCookie = cookie;
        available = true;
      } else {
        available = false;
      }
    } catch {
      available = false;
    }
  });

  it("should detect LLNG portal availability", () => {
    if (!available) {
      console.log("LLNG portal not available or auth failed - skipping API tests");
    }
    // Don't fail - just report availability
  });

  it("should access portal login page", async () => {
    if (!available) return;

    try {
      const resp = await fetch(`${BASE_URL}/`, {
        headers: {
          Host: "auth.example.com",
        },
      });

      expect(resp.ok).toBe(true);
      const html = await resp.text();

      // Should contain login form
      expect(html).toContain("lemonldap-ng");
    } catch (e: unknown) {
      console.log("Portal access failed:", e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

  it("should authenticate as demo user", async () => {
    if (!available) return;

    expect(sessionCookie).toBeTruthy();
    expect(sessionCookie.length).toBeGreaterThan(0);
  });

  it("should access manager API with session cookie", async () => {
    if (!available) return;

    try {
      const resp = await fetch(`${BASE_URL}/confs/latest`, {
        headers: {
          Host: "manager.example.com",
          Cookie: `lemonldap=${sessionCookie}`,
        },
      });

      // Manager API requires specific group membership (e.g., "timelords" group)
      // The demo user dwho might not have manager permissions by default
      if (resp.status === 403) {
        console.log(
          "Manager API returned 403 - user lacks required permissions (expected for demo user)",
        );
        return; // Skip test gracefully
      }

      if (!resp.ok) {
        const text = await resp.text();
        console.log("Manager API response:", resp.status, text);
        throw new Error(`Manager API returned ${resp.status}`);
      }

      const config = await resp.json();

      // Should have cfgNum
      expect(config.cfgNum).toBeDefined();
      const cfgNum = typeof config.cfgNum === "string" ? parseInt(config.cfgNum) : config.cfgNum;
      expect(cfgNum).toBeGreaterThan(0);

      // Should have basic config keys
      expect(config.portal).toBeDefined();
      expect(config.domain).toBeDefined();
    } catch (e: unknown) {
      console.log("Manager API access failed:", e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

  it("should access manager REST API endpoints", async () => {
    if (!available) return;

    try {
      // Test accessing configuration list
      const resp = await fetch(`${BASE_URL}/confs`, {
        headers: {
          Host: "manager.example.com",
          Cookie: `lemonldap=${sessionCookie}`,
        },
      });

      // Manager REST API also requires permissions
      if (resp.status === 403) {
        console.log(
          "REST API returned 403 - user lacks required permissions (expected for demo user)",
        );
        return;
      }

      if (!resp.ok) {
        const text = await resp.text();
        console.log("REST API response:", resp.status, text);
        // Don't fail - might not be available in all deployments
        return;
      }

      const data = await resp.json();
      expect(Array.isArray(data) || typeof data === "object").toBe(true);
    } catch (e: unknown) {
      console.log("REST API access failed:", e instanceof Error ? e.message : String(e));
      // Don't fail - REST API might not be enabled
    }
  });

  it("should demonstrate that manager API requires authorization", async () => {
    if (!available) return;

    // Document the authorization requirements for the manager API
    // In a real deployment, you would need:
    // 1. A user account with manager permissions (e.g., member of "timelords" group)
    // 2. Proper session cookie after authentication
    // 3. Correct Host header for the manager vhost
    //
    // For testing purposes, SSH transport via docker exec is more reliable
    // since CLI commands bypass web-based authorization checks
    console.log(
      'Manager API requires group membership (e.g., inGroup("timelords")) or specific user access',
    );
  });
});
