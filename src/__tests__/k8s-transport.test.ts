import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { K8sTransport } from "../transport/k8s.js";
import { K8sConfig } from "../config.js";
import * as child_process from "child_process";
import { EventEmitter } from "events";

vi.mock("child_process");

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

describe("K8sTransport", () => {
  const defaultConfig: K8sConfig = {
    context: "my-cluster",
    namespace: "auth",
    deployment: "lemonldap-ng",
  };

  let spawnCalls: Array<{ cmd: string; args: string[] }> = [];
  let spawnCallIndex = 0;

  const setupSpawnMock = (...responses: Array<{ stdout: string; exitCode?: number }>) => {
    spawnCallIndex = 0;
    vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
      spawnCalls.push({ cmd, args: args ? [...args] : [] });
      const resp = responses[spawnCallIndex] || responses[responses.length - 1];
      spawnCallIndex++;
      return mockSpawn(resp.stdout, "", resp.exitCode ?? 0) as any;
    });
  };

  beforeEach(() => {
    vi.resetAllMocks();
    spawnCalls = [];
    spawnCallIndex = 0;
  });

  afterEach(() => {
    spawnCalls = [];
  });

  describe("Pod resolution", () => {
    it("resolves pod name using default label selector", async () => {
      setupSpawnMock(
        { stdout: "lemonldap-ng-abc123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(defaultConfig);
      await transport.configInfo();

      // First call: get pods
      expect(spawnCalls[0].cmd).toBe("kubectl");
      expect(spawnCalls[0].args).toEqual([
        "-n",
        "auth",
        "--context",
        "my-cluster",
        "get",
        "pods",
        "-l",
        "app.kubernetes.io/name=lemonldap-ng",
        "-o",
        "jsonpath={.items[0].metadata.name}",
      ]);

      // Second call: exec
      expect(spawnCalls[1].cmd).toBe("kubectl");
      expect(spawnCalls[1].args).toContain("exec");
      expect(spawnCalls[1].args).toContain("lemonldap-ng-abc123");
    });

    it("caches pod name across calls", async () => {
      setupSpawnMock(
        { stdout: "lemonldap-ng-abc123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
        { stdout: "domain = example.com" },
      );

      const transport = new K8sTransport(defaultConfig);
      await transport.configInfo();
      await transport.configGet(["domain"]);

      // Pod resolution should only happen once (first call)
      const getPodsCalls = spawnCalls.filter(
        (c) => c.args.includes("get") && c.args.includes("pods"),
      );
      expect(getPodsCalls).toHaveLength(1);
    });

    it("uses custom podSelector", async () => {
      const config: K8sConfig = {
        ...defaultConfig,
        podSelector: "app=llng,tier=auth",
      };

      setupSpawnMock(
        { stdout: "llng-pod-xyz" },
        { stdout: "Num      : 1\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(config);
      await transport.configInfo();

      expect(spawnCalls[0].args).toContain("app=llng,tier=auth");
    });

    it("throws when no pod found", async () => {
      setupSpawnMock({ stdout: "" });

      const transport = new K8sTransport(defaultConfig);
      await expect(transport.configInfo()).rejects.toThrow("No pod found for selector");
    });
  });

  describe("Command execution", () => {
    it("builds correct exec command with context, namespace, and container", async () => {
      const config: K8sConfig = {
        ...defaultConfig,
        container: "sso",
      };

      setupSpawnMock(
        { stdout: "llng-pod-123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(config);
      await transport.configInfo();

      const execCall = spawnCalls[1];
      expect(execCall.args).toEqual([
        "--context",
        "my-cluster",
        "-n",
        "auth",
        "exec",
        "llng-pod-123",
        "-c",
        "sso",
        "--",
        "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        "info",
      ]);
    });

    it("exec without container omits -c flag", async () => {
      setupSpawnMock(
        { stdout: "llng-pod-123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(defaultConfig);
      await transport.configInfo();

      const execCall = spawnCalls[1];
      expect(execCall.args).not.toContain("-c");
    });

    it("works without context", async () => {
      const config: K8sConfig = {
        namespace: "auth",
        deployment: "lemonldap-ng",
      };

      setupSpawnMock(
        { stdout: "llng-pod-123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(config);
      await transport.configInfo();

      expect(spawnCalls[0].args).not.toContain("--context");
      expect(spawnCalls[1].args).not.toContain("--context");
    });
  });

  describe("binPrefix", () => {
    it("custom binPrefix resolves paths", async () => {
      const config: K8sConfig = {
        ...defaultConfig,
        binPrefix: "/opt/llng/bin",
      };

      setupSpawnMock(
        { stdout: "llng-pod-123" },
        { stdout: "Num      : 42\nAuthor   : admin\nDate     : 2025-01-30" },
      );

      const transport = new K8sTransport(config);
      await transport.configInfo();

      const execCall = spawnCalls[1];
      expect(execCall.args).toContain("/opt/llng/bin/lemonldap-ng-cli");
    });
  });

  describe("CLI methods", () => {
    it("configGet passes keys", async () => {
      setupSpawnMock(
        { stdout: "llng-pod-123" },
        { stdout: "domain = example.com\nportal = https://portal.example.com" },
      );

      const transport = new K8sTransport(defaultConfig);
      const result = await transport.configGet(["domain", "portal"]);

      expect(result).toEqual({ domain: "example.com", portal: "https://portal.example.com" });
    });

    it("configSet passes key-value pairs", async () => {
      setupSpawnMock({ stdout: "llng-pod-123" }, { stdout: "" });

      const transport = new K8sTransport(defaultConfig);
      await transport.configSet({ domain: "example.com" }, "Update");

      const execCall = spawnCalls[1];
      expect(execCall.args).toContain("set");
      expect(execCall.args).toContain("-yes");
      expect(execCall.args).toContain("domain");
      expect(execCall.args).toContain("example.com");
      expect(execCall.args).toContain("-log");
      expect(execCall.args).toContain("Update");
    });

    it("sessionSearch builds correct args", async () => {
      setupSpawnMock({ stdout: "llng-pod-123" }, { stdout: '[{"id": "s1"}]' });

      const transport = new K8sTransport(defaultConfig);
      const result = await transport.sessionSearch({ where: { uid: "john" } });

      expect(result).toEqual([{ id: "s1" }]);
    });

    it("unsupported methods throw", async () => {
      const transport = new K8sTransport(defaultConfig);
      await expect(transport.sessionSetKey("id", {})).rejects.toThrow("Use API mode");
      await expect(transport.sessionDelKey("id", [])).rejects.toThrow("Use API mode");
      await expect(transport.secondFactorsGet("user")).rejects.toThrow("Use API mode");
      await expect(transport.consentsGet("user")).rejects.toThrow("Use API mode");
    });
  });

  describe("stdin methods", () => {
    it("configRestore passes JSON via stdin", async () => {
      let stdinContent = "";
      let callIdx = 0;
      vi.mocked(child_process.spawn).mockImplementation((cmd: string, args?: readonly string[]) => {
        spawnCalls.push({ cmd, args: args ? [...args] : [] });
        const proc = new MockChildProcess();
        if (callIdx === 1) {
          proc.stdin.write = vi.fn((data: any) => {
            stdinContent += data;
            return true;
          });
        }
        callIdx++;
        process.nextTick(() => {
          if (callIdx === 1) {
            proc.stdout.emit("data", Buffer.from("llng-pod-123"));
          }
          proc.emit("close", 0);
        });
        return proc as any;
      });

      const transport = new K8sTransport(defaultConfig);
      const json = '{"domain": "example.com"}';
      await transport.configRestore(json);

      expect(stdinContent).toBe(json);
      // The exec call should include -i flag for stdin
      const execCall = spawnCalls[1];
      expect(execCall.args).toContain("-i");
      expect(execCall.args).toContain("restore");
    });
  });
});
