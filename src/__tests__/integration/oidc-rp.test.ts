import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execSync } from "child_process";

describe("OIDC RP Integration (via docker exec)", () => {
  let available = false;
  let containerName = "";

  function dockerExec(cmd: string): string {
    return execSync(`docker exec ${containerName} ${cmd}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "ignore"], // capture stdout, ignore stderr
    }).trim();
  }

  function dockerBash(script: string): string {
    return dockerExec(`bash -c '${script.replace(/'/g, "'\\''")}'`);
  }

  beforeAll(async () => {
    // Detect container name dynamically
    try {
      const output = execSync(
        `docker ps --filter ancestor=yadd/lemonldap-ng-full --format '{{.Names}}'`,
        { encoding: "utf-8" },
      );
      const name = output.trim().split("\n")[0];
      if (name) {
        containerName = name;
        available = true;
      }
    } catch {
      available = false;
    }

    if (!available) return;

    // Set up OIDC RP configuration
    try {
      // Add hosts entry for auth.example.com
      dockerBash("echo '127.0.0.1 auth.example.com' >> /etc/hosts");

      // Enable OIDC issuer
      dockerBash("lemonldap-ng-cli -yes 1 set issuerDBOpenIDConnectActivation 1 2>/dev/null");

      // Generate signing keys
      dockerBash("/usr/share/lemonldap-ng/bin/rotateOidcKeys 2>/dev/null");

      // Create RP via CLI merge
      const rpConfig = JSON.stringify({
        oidcRPMetaDataOptions: {
          "integ-test-rp": {
            oidcRPMetaDataOptionsClientID: "integ-test-client",
            oidcRPMetaDataOptionsRedirectUris: "http://localhost/callback",
            oidcRPMetaDataOptionsPublic: 1,
            oidcRPMetaDataOptionsBypassConsent: 1,
            oidcRPMetaDataOptionsIDTokenSignAlg: "RS256",
          },
        },
        oidcRPMetaDataExportedVars: {
          "integ-test-rp": {
            name: "cn",
            preferred_username: "uid",
            email: "mail",
          },
        },
      });
      dockerBash(
        `echo '${rpConfig.replace(/'/g, "'\\''")}' | lemonldap-ng-cli -yes 1 merge - 2>/dev/null`,
      );
    } catch (e: unknown) {
      console.log("OIDC setup failed:", e instanceof Error ? e.message : String(e));
      available = false;
    }
  });

  afterAll(async () => {
    if (!available) return;

    // Cleanup: remove RP configuration
    try {
      dockerBash("lemonldap-ng-cli -yes 1 delKey oidcRPMetaDataOptions integ-test-rp 2>/dev/null");
      dockerBash(
        "lemonldap-ng-cli -yes 1 delKey oidcRPMetaDataExportedVars integ-test-rp 2>/dev/null",
      );
    } catch (e: unknown) {
      console.log("OIDC cleanup failed:", e instanceof Error ? e.message : String(e));
    }
  });

  it("should detect Docker container availability", () => {
    if (!available) {
      console.log("LLNG container not available - skipping integration tests");
    }
    // Don't fail - just report availability
  });

  it("should add OIDC RP and verify config", async () => {
    if (!available) return;

    try {
      const output = dockerBash(
        "lemonldap-ng-cli -yes 1 get oidcRPMetaDataOptions/integ-test-rp 2>/dev/null",
      );

      // Verify the RP contains required fields
      expect(output).toContain("oidcRPMetaDataOptionsClientID");
      expect(output).toContain("oidcRPMetaDataOptionsIDTokenSignAlg");
    } catch (e: unknown) {
      console.log("OIDC RP verification failed:", e instanceof Error ? e.message : String(e));
      throw e;
    }
  });

  it("should complete full OIDC flow via llng CLI", async () => {
    if (!available) return;

    try {
      const flowScript = `
        rm -f /root/.cache/llng-cookies && mkdir -p /root/.cache && \
        llng --llng-url http://auth.example.com --login dwho --password dwho \
          --client-id integ-test-client --pkce --redirect-uri "http://localhost/callback" \
          user_info
      `;

      const output = dockerBash(flowScript);

      // Parse JSON output and verify user info
      const userInfo = JSON.parse(output);
      expect(userInfo.sub).toBe("dwho");
      expect(userInfo.email).toBe("dwho@badwolf.org");
      expect(userInfo.name).toBe("Doctor Who");
      expect(userInfo.preferred_username).toBe("dwho");
    } catch (e: unknown) {
      console.log("OIDC flow failed:", e instanceof Error ? e.message : String(e));
      throw e;
    }
  });
});
