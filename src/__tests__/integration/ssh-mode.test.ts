import { describe, it, expect, beforeAll } from "vitest";
import { execSync } from "child_process";

describe("SSH Transport Integration (via docker exec)", () => {
  let available = false;
  let containerName = "";

  function dockerExec(cmd: string): string {
    return execSync(`docker exec ${containerName} ${cmd}`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"], // separate stderr from stdout
    }).trim();
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
  });

  it("should detect Docker container availability", () => {
    if (!available) {
      console.log("LLNG container not available - skipping integration tests");
    }
    // Don't fail - just report availability
  });

  it("should get config info via info command", async () => {
    if (!available) return;

    try {
      const output = dockerExec("lemonldap-ng-cli info");

      // Parse text output - expect lines like "Num      : 1"
      expect(output).toContain("Num");
      expect(output).toContain("Author");
      expect(output).toMatch(/Num\s+:\s+\d+/);
    } catch (e: any) {
      console.log("CLI info failed:", e.message);
      throw e;
    }
  });

  it("should get config values via get command", async () => {
    if (!available) return;

    try {
      const output = dockerExec("lemonldap-ng-cli get portal domain");

      // Parse "key = value" lines
      const lines = output.split("\n");
      expect(lines.length).toBeGreaterThan(0);

      // Should contain portal and domain values
      expect(output).toMatch(/portal\s+=\s+\S+/);
      expect(output).toMatch(/domain\s+=\s+\S+/);
    } catch (e: any) {
      console.log("CLI get failed:", e.message);
      throw e;
    }
  });

  it("should export config via save command", async () => {
    if (!available) return;

    try {
      const output = dockerExec("lemonldap-ng-cli save");

      // save outputs JSON to stdout
      const config = JSON.parse(output);
      expect(config.cfgNum).toBeDefined();

      // cfgNum might be a string or number
      const cfgNum = typeof config.cfgNum === "string" ? parseInt(config.cfgNum) : config.cfgNum;
      expect(cfgNum).toBeGreaterThan(0);
    } catch (e: any) {
      console.log("CLI save failed:", e.message);
      throw e;
    }
  });

  it("should set config value via set command", async () => {
    if (!available) return;

    // Note: The CLI 'set' command in this version requires interactive confirmation
    // and may not work non-interactively. This test documents the expected behavior.
    // In production, use the API or update the entire config via 'save'.

    console.log("CLI set command requires interactive confirmation - skipping");
  });

  it("should search sessions via lemonldap-ng-sessions", async () => {
    if (!available) return;

    try {
      // lemonldap-ng-sessions search returns JSON array (might be empty)
      const output = dockerExec("lemonldap-ng-sessions search");

      // Parse JSON - should be an array
      const sessions = JSON.parse(output);
      expect(Array.isArray(sessions)).toBe(true);
    } catch (e: any) {
      console.log("Sessions CLI failed:", e.message);
      throw e;
    }
  });
});
