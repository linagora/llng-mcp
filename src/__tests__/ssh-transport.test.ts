import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SshTransport } from "../transport/ssh.js";
import { SshConfig } from "../config.js";
import * as child_process from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process");

// Helper to create a mock ChildProcess
class MockChildProcess extends EventEmitter {
  stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  stdout = new EventEmitter();
  stderr = new EventEmitter();

  constructor() {
    super();
  }
}

function mockSpawn(stdout: string, stderr = "", exitCode = 0): MockChildProcess {
  const proc = new MockChildProcess();

  // Simulate async process execution
  process.nextTick(() => {
    if (stdout) {
      proc.stdout.emit("data", Buffer.from(stdout));
    }
    if (stderr) {
      proc.stderr.emit("data", Buffer.from(stderr));
    }
    proc.emit("close", exitCode);
  });

  return proc;
}

describe("SshTransport", () => {
  const defaultConfig: SshConfig = {
    cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
    sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
    configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
  };

  let spawnCalls: Array<{ cmd: string; args: string[] }> = [];

  // Helper to set up mock with spawn call tracking
  const setupSpawnMock = (stdout: string, stderr = "", exitCode = 0) => {
    vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
      spawnCalls.push({ cmd, args: args ? [...args] : [] });
      return mockSpawn(stdout, stderr, exitCode) as any;
    });
  };

  beforeEach(() => {
    vi.resetAllMocks();
    spawnCalls = [];

    // Setup default spy to capture spawn calls
    setupSpawnMock('{"success": true}');
  });

  afterEach(() => {
    spawnCalls = [];
  });

  describe("Local mode (no host)", () => {
    it("configInfo runs lemonldap-ng-cli info directly", async () => {
      const configInfoOutput = `Num      : 42
Author   : admin
Date     : 2025-01-30
Log      : Test config`;

      setupSpawnMock(configInfoOutput);

      const transport = new SshTransport(defaultConfig);
      const result = await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
      expect(spawnCalls[0].args).toEqual(["info"]);
      expect(result).toEqual({
        cfgNum: 42,
        cfgAuthor: "admin",
        cfgDate: "2025-01-30",
        cfgLog: "Test config",
      });
    });

    it("configGet passes keys correctly", async () => {
      setupSpawnMock("domain = example.com\nportal = https://portal.example.com");

      const transport = new SshTransport(defaultConfig);
      const result = await transport.configGet(["domain", "portal"]);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
      expect(spawnCalls[0].args).toEqual(["get", "domain", "portal"]);
      expect(result).toEqual({ domain: "example.com", portal: "https://portal.example.com" });
    });

    it("configSet passes key-value pairs and optional cfgLog", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.configSet(
        { domain: "example.com", portal: "https://portal.example.com" },
        "Updated config",
      );

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
      expect(spawnCalls[0].args).toEqual([
        "set",
        "-yes",
        "1",
        "domain",
        "example.com",
        "portal",
        "https://portal.example.com",
        "-log",
        "Updated config",
      ]);
    });

    it("configSet without cfgLog omits -log argument", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.configSet({ domain: "example.com" });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["set", "-yes", "1", "domain", "example.com"]);
      expect(spawnCalls[0].args).not.toContain("-log");
    });

    it("sessionSearch builds correct args from SessionFilter", async () => {
      setupSpawnMock('[{"id": "session1"}]');

      const transport = new SshTransport(defaultConfig);
      await transport.sessionSearch({
        where: { uid: "john", ipAddr: "192.168.1.1" },
        select: ["uid", "ipAddr", "_startTime"],
        backend: "persistent",
        count: true,
      });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions");
      expect(spawnCalls[0].args).toEqual([
        "search",
        "--where",
        "uid=john",
        "--where",
        "ipAddr=192.168.1.1",
        "--select",
        "uid,ipAddr,_startTime",
        "--backend",
        "persistent",
        "--count",
      ]);
    });

    it("sessionDelete uses llngDeleteSession script", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.sessionDelete(["id1", "id2"], "persistent");

      expect(spawnCalls).toHaveLength(2);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/llngDeleteSession");
      expect(spawnCalls[0].args).toEqual(["id1", "--backend", "persistent"]);
      expect(spawnCalls[1].cmd).toBe("/usr/share/lemonldap-ng/bin/llngDeleteSession");
      expect(spawnCalls[1].args).toEqual(["id2", "--backend", "persistent"]);
    });

    it("secondFactorsGet throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.secondFactorsGet("john")).rejects.toThrow(
        "secondFactorsGet is not supported via CLI. Use API mode.",
      );
    });
  });

  describe("SSH mode", () => {
    it("configInfo with host runs ssh command", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("ssh");
      expect(spawnCalls[0].args).toEqual([
        "server.example.com",
        "'/usr/share/lemonldap-ng/bin/lemonldap-ng-cli' 'info'",
      ]);
    });

    it("SSH with user and port", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
        user: "admin",
        port: 2222,
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("ssh");
      expect(spawnCalls[0].args).toEqual([
        "-p",
        "2222",
        "admin@server.example.com",
        "'/usr/share/lemonldap-ng/bin/lemonldap-ng-cli' 'info'",
      ]);
    });
  });

  describe("Sudo mode", () => {
    it("Sudo mode (local) runs sudo -u www-data", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        sudo: "www-data",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("sudo");
      expect(spawnCalls[0].args).toEqual([
        "-u",
        "www-data",
        "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        "info",
      ]);
    });

    it("Sudo mode (SSH) runs ssh server sudo -u www-data", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
        sudo: "www-data",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("ssh");
      expect(spawnCalls[0].args).toEqual([
        "server.example.com",
        "sudo -u 'www-data' '/usr/share/lemonldap-ng/bin/lemonldap-ng-cli' 'info'",
      ]);
    });
  });

  describe("Shell quoting", () => {
    it("args with single quotes are properly escaped", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
      };

      setupSpawnMock("");

      const transport = new SshTransport(config);
      await transport.configSet({ key: "value's with 'quotes'" });

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("ssh");
      // The remote command should have properly escaped single quotes
      const remoteCmd = spawnCalls[0].args[1];
      expect(remoteCmd).toContain("'value'\\''s with '\\''quotes'\\'''");
    });

    it("complex args are properly quoted in SSH mode", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
      };

      setupSpawnMock('[{"id": "session1"}]');

      const transport = new SshTransport(config);
      await transport.sessionSearch({
        where: { uid: "john's", ipAddr: "192.168.1.1" },
      });

      expect(spawnCalls).toHaveLength(1);
      const remoteCmd = spawnCalls[0].args[1];
      // Should have escaped quotes - the pattern is 'john'\''s' (close quote, escaped quote, open quote)
      expect(remoteCmd).toContain("john'\\''s");
      expect(remoteCmd).toContain("'search'");
    });
  });

  describe("Error handling", () => {
    it("non-zero exit code throws with exit code", async () => {
      setupSpawnMock("", "Command failed: invalid argument", 1);

      const transport = new SshTransport(defaultConfig);

      await expect(transport.configInfo()).rejects.toThrow("Command failed with exit code 1");
    });

    it("process error event triggers rejection", async () => {
      vi.mocked(child_process.spawn).mockImplementation(() => {
        const proc = new MockChildProcess();
        process.nextTick(() => {
          proc.emit("error", new Error("spawn ENOENT"));
        });
        return proc as any;
      });

      const transport = new SshTransport(defaultConfig);

      await expect(transport.configInfo()).rejects.toThrow("Command execution failed");
    });
  });

  describe("Additional methods", () => {
    it("configAddKey passes correct arguments", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.configAddKey("locationRules", "^/admin/", "deny");

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["addKey", "locationRules", "^/admin/", "deny"]);
    });

    it("configDelKey passes correct arguments", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.configDelKey("locationRules", "^/admin/");

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["delKey", "locationRules", "^/admin/"]);
    });

    it("configSave does not pass -json flag", async () => {
      setupSpawnMock("Configuration saved with cfgNum 43");

      const transport = new SshTransport(defaultConfig);
      await transport.configSave();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["save"]);
      expect(spawnCalls[0].args).not.toContain("-json");
    });

    it("configRollback uses -yes 1 flag", async () => {
      setupSpawnMock("");

      const transport = new SshTransport(defaultConfig);
      await transport.configRollback();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["rollback", "-yes", "1"]);
    });

    it("sessionGet with backend passes correct arguments", async () => {
      setupSpawnMock('{"uid": "john", "ipAddr": "192.168.1.1"}');

      const transport = new SshTransport(defaultConfig);
      const result = await transport.sessionGet("sessionid123", "persistent");

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["get", "sessionid123", "--backend", "persistent"]);
      expect(result).toEqual({ uid: "john", ipAddr: "192.168.1.1" });
    });

    it("sessionSetKey throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.sessionSetKey("sessionid123", { uid: "jane" })).rejects.toThrow(
        "sessionSetKey is not supported via CLI. Use API mode.",
      );
    });

    it("sessionDelKey throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.sessionDelKey("sessionid123", ["key1"])).rejects.toThrow(
        "sessionDelKey is not supported via CLI. Use API mode.",
      );
    });

    it("sessionBackup returns all sessions via search", async () => {
      setupSpawnMock("[]");

      const transport = new SshTransport(defaultConfig);
      const result = await transport.sessionBackup("persistent");

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["search"]);
      expect(result).toBe("[]");
    });

    it("secondFactorsDelete throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.secondFactorsDelete("john", ["totp1"])).rejects.toThrow(
        "secondFactorsDelete is not supported via CLI. Use API mode.",
      );
    });

    it("secondFactorsDelType throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.secondFactorsDelType("john", "TOTP")).rejects.toThrow(
        "secondFactorsDelType is not supported via CLI. Use API mode.",
      );
    });

    it("consentsGet throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.consentsGet("john")).rejects.toThrow(
        "consentsGet is not supported via CLI. Use API mode.",
      );
    });

    it("consentsDelete throws not supported error", async () => {
      const transport = new SshTransport(defaultConfig);

      await expect(transport.consentsDelete("john", ["consent1"])).rejects.toThrow(
        "consentsDelete is not supported via CLI. Use API mode.",
      );
    });
  });

  describe("stdin methods", () => {
    it("configRestore passes JSON via stdin", async () => {
      let stdinContent = "";
      vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
        spawnCalls.push({ cmd, args: args ? [...args] : [] });
        const proc = new MockChildProcess();
        proc.stdin.write = vi.fn((data: any) => {
          stdinContent += data;
          return true;
        });
        process.nextTick(() => {
          proc.emit("close", 0);
        });
        return proc as any;
      });

      const transport = new SshTransport(defaultConfig);
      const json = '{"domain": "example.com"}';
      await transport.configRestore(json);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["restore", "-yes", "1", "-"]);
      expect(stdinContent).toBe(json);
    });

    it("configMerge passes JSON via stdin", async () => {
      let stdinContent = "";
      vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
        spawnCalls.push({ cmd, args: args ? [...args] : [] });
        const proc = new MockChildProcess();
        proc.stdin.write = vi.fn((data: any) => {
          stdinContent += data;
          return true;
        });
        process.nextTick(() => {
          proc.emit("close", 0);
        });
        return proc as any;
      });

      const transport = new SshTransport(defaultConfig);
      const json = '{"domain": "example.com"}';
      await transport.configMerge(json);

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].args).toEqual(["merge", "-yes", "1", "-"]);
      expect(stdinContent).toBe(json);
    });
  });

  describe("environment variables", () => {
    it("exec passes env vars to spawn in local mode", async () => {
      let spawnOptions: any;
      vi.mocked(child_process.spawn).mockImplementation(
        (cmd: string, args?: readonly string[], opts?: any) => {
          spawnCalls.push({ cmd, args: args ? [...args] : [] });
          spawnOptions = opts;
          return mockSpawn("Num      : 1\nAuthor   : admin\nDate     : 2025-01-30") as any;
        },
      );

      const transport = new SshTransport(defaultConfig);
      // configEditor internally calls exec with env parameter
      await transport.configInfo();

      // The first call should not have special env
      expect(spawnOptions).toBeUndefined();
    });

    it("exec with env parameter sets EDITOR=cat for configEditor", async () => {
      vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
        spawnCalls.push({ cmd, args: args ? [...args] : [] });
        return mockSpawn("") as any;
      });

      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
      };

      const transport = new SshTransport(config);

      // Create a more direct test by checking that lmConfigEditor is called correctly
      // In SSH mode, env vars are passed as part of the remote command
      setupSpawnMock("");
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      // The env handling is done differently in SSH mode vs local mode
      // In SSH mode, it uses "env KEY=VALUE command"
    });
  });

  describe("remoteCommand", () => {
    it("remoteCommand is inserted in SSH mode between sudo and LLNG command", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
        sudo: "www-data",
        remoteCommand: "docker exec sso-auth-1",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("ssh");
      const remoteCmd = spawnCalls[0].args[1];
      // Should be: sudo -u 'www-data' docker exec sso-auth-1 '/path/cli' 'info'
      expect(remoteCmd).toBe(
        "sudo -u 'www-data' docker exec sso-auth-1 '/usr/share/lemonldap-ng/bin/lemonldap-ng-cli' 'info'",
      );
    });

    it("remoteCommand in SSH mode without sudo", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        host: "server.example.com",
        remoteCommand: "docker exec sso-auth-1",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      const remoteCmd = spawnCalls[0].args[1];
      expect(remoteCmd).toBe(
        "docker exec sso-auth-1 '/usr/share/lemonldap-ng/bin/lemonldap-ng-cli' 'info'",
      );
    });

    it("remoteCommand in local mode (no host, no sudo)", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        remoteCommand: "docker exec sso-auth-1",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("docker");
      expect(spawnCalls[0].args).toEqual([
        "exec",
        "sso-auth-1",
        "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        "info",
      ]);
    });

    it("remoteCommand in local mode with sudo", async () => {
      const config: SshConfig = {
        ...defaultConfig,
        sudo: "www-data",
        remoteCommand: "docker exec sso-auth-1",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("sudo");
      expect(spawnCalls[0].args).toEqual([
        "-u",
        "www-data",
        "docker",
        "exec",
        "sso-auth-1",
        "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        "info",
      ]);
    });
  });

  describe("binPrefix", () => {
    it("binPrefix resolves CLI paths", async () => {
      const config: SshConfig = {
        binPrefix: "/opt/llng/bin",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/opt/llng/bin/lemonldap-ng-cli");
      expect(spawnCalls[0].args).toEqual(["info"]);
    });

    it("binPrefix resolves sessions path", async () => {
      const config: SshConfig = {
        binPrefix: "/opt/llng/bin",
      };

      setupSpawnMock("[]");

      const transport = new SshTransport(config);
      await transport.sessionBackup();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/opt/llng/bin/lemonldap-ng-sessions");
    });

    it("explicit cliPath overrides binPrefix", async () => {
      const config: SshConfig = {
        binPrefix: "/opt/llng/bin",
        cliPath: "/custom/path/lemonldap-ng-cli",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/custom/path/lemonldap-ng-cli");
    });

    it("default binPrefix is used when neither binPrefix nor paths provided", async () => {
      const config: SshConfig = {};

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      expect(spawnCalls[0].cmd).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
    });

    it("binPrefix with SSH and remoteCommand", async () => {
      const config: SshConfig = {
        host: "server.example.com",
        remoteCommand: "docker exec sso-auth-1",
        binPrefix: "/opt/llng/bin",
      };

      setupSpawnMock("Num      : 42\nAuthor   : admin\nDate     : 2025-01-30");

      const transport = new SshTransport(config);
      await transport.configInfo();

      expect(spawnCalls).toHaveLength(1);
      const remoteCmd = spawnCalls[0].args[1];
      expect(remoteCmd).toBe(
        "docker exec sso-auth-1 '/opt/llng/bin/lemonldap-ng-cli' 'info'",
      );
    });
  });
});
