import { spawn } from "child_process";
import { K8sConfig, resolvePaths } from "../config.js";
import {
  ILlngTransport,
  SessionFilter,
  ConfigInfo,
  SessionGetOptions,
  SessionDeleteOptions,
} from "./interface.js";

export class K8sTransport implements ILlngTransport {
  private paths: { cliPath: string; sessionsPath: string; configEditorPath: string };
  private cachedPodName: string | null = null;

  constructor(private config: K8sConfig) {
    this.paths = resolvePaths(config.binPrefix);
  }

  private async resolvePod(): Promise<string> {
    if (this.cachedPodName) {
      return this.cachedPodName;
    }

    if (!this.config.namespace) {
      throw new Error("K8s namespace is required but not configured");
    }
    if (!this.config.deployment && !this.config.podSelector) {
      throw new Error("K8s deployment or podSelector is required but not configured");
    }
    const selector = this.config.podSelector || `app.kubernetes.io/name=${this.config.deployment}`;
    const args = ["get", "pods", "-l", selector, "-o", "jsonpath={.items[0].metadata.name}"];

    if (this.config.context) {
      args.unshift("--context", this.config.context);
    }
    args.unshift("-n", this.config.namespace!);

    const podName = await this.kubectl(args);
    if (!podName || podName === "{}" || podName.trim() === "") {
      throw new Error(
        `No pod found for selector '${selector}' in namespace '${this.config.namespace}'`,
      );
    }

    this.cachedPodName = podName.trim();
    return this.cachedPodName;
  }

  private async kubectl(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("kubectl", args);
      let stdout = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", () => {
        // stderr consumed for security
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`kubectl command failed with exit code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on("error", () => {
        reject(new Error("kubectl command execution failed"));
      });
    });
  }

  private async kubectlWithStdin(args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const proc = spawn("kubectl", args);
      let stdout = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", () => {
        // stderr consumed for security
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`kubectl command failed with exit code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on("error", () => {
        reject(new Error("kubectl command execution failed"));
      });

      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  private buildExecArgs(podName: string, command: string[]): string[] {
    const args: string[] = [];

    if (this.config.context) {
      args.push("--context", this.config.context);
    }
    args.push("-n", this.config.namespace!);
    args.push("exec", podName);

    if (this.config.container) {
      args.push("-c", this.config.container);
    }

    args.push("--", ...command);
    return args;
  }

  private buildExecStdinArgs(podName: string, command: string[]): string[] {
    const args: string[] = [];

    if (this.config.context) {
      args.push("--context", this.config.context);
    }
    args.push("-n", this.config.namespace!);
    args.push("exec", "-i", podName);

    if (this.config.container) {
      args.push("-c", this.config.container);
    }

    args.push("--", ...command);
    return args;
  }

  private async exec(command: string[]): Promise<string> {
    const podName = await this.resolvePod();
    const args = this.buildExecArgs(podName, command);
    return this.kubectl(args);
  }

  private async execWithStdin(command: string[], input: string): Promise<string> {
    const podName = await this.resolvePod();
    const args = this.buildExecStdinArgs(podName, command);
    return this.kubectlWithStdin(args, input);
  }

  private async execCli(subArgs: string[]): Promise<string> {
    return this.exec([this.paths.cliPath, ...subArgs]);
  }

  private async execSessions(subArgs: string[]): Promise<string> {
    return this.exec([this.paths.sessionsPath, ...subArgs]);
  }

  private pushSessionGetOptions(args: string[], options?: SessionGetOptions): void {
    if (!options) return;
    if (options.persistent) {
      args.push("--persistent");
    }
    if (options.hash) {
      args.push("--hash");
    }
    if (options.refreshTokens) {
      args.push("--refresh-tokens");
    }
    if (options.backend) {
      args.push("--backend", options.backend);
    }
  }

  // Config methods
  async configInfo(): Promise<ConfigInfo> {
    const output = await this.execCli(["info"]);
    const lines = output.trim().split("\n");
    const data: Record<string, string> = {};
    for (const line of lines) {
      const match = line.match(/^(\S+)\s*:\s*(.*)$/);
      if (match) {
        data[match[1]] = match[2];
      }
    }
    return {
      cfgNum: parseInt(data["Num"] || "0", 10),
      cfgAuthor: data["Author"] || "",
      cfgDate: data["Date"] || "",
      cfgLog: data["Log"],
    };
  }

  async configGet(keys: string[]): Promise<Record<string, any>> {
    const output = await this.execCli(["get", ...keys]);
    const result: Record<string, any> = {};
    const lines = output.trim().split("\n");
    for (const line of lines) {
      const match = line.match(/^(\S+)\s+=\s+(.*)$/);
      if (match) {
        result[match[1]] = match[2];
      }
    }
    return result;
  }

  async configSet(pairs: Record<string, any>, log?: string): Promise<void> {
    const args: string[] = ["set", "-yes", "1"];
    for (const [key, value] of Object.entries(pairs)) {
      args.push(key, String(value));
    }
    if (log) {
      args.push("-log", log);
    }
    await this.execCli(args);
  }

  async configAddKey(key: string, subkey: string, value: string): Promise<void> {
    await this.execCli(["addKey", key, subkey, value]);
  }

  async configDelKey(key: string, subkey: string): Promise<void> {
    await this.execCli(["delKey", key, subkey]);
  }

  async configSave(): Promise<string> {
    return await this.execCli(["save"]);
  }

  async configRestore(json: string): Promise<void> {
    await this.execWithStdin([this.paths.cliPath, "restore", "-yes", "1", "-"], json);
  }

  async configMerge(json: string): Promise<void> {
    await this.execWithStdin([this.paths.cliPath, "merge", "-yes", "1", "-"], json);
  }

  async configRollback(): Promise<void> {
    await this.execCli(["rollback", "-yes", "1"]);
  }

  async configUpdateCache(): Promise<void> {
    await this.execCli(["update-cache"]);
  }

  async configTestEmail(destination: string): Promise<void> {
    await this.execCli(["test-email", destination]);
  }

  // Session methods
  async sessionGet(id: string, options?: SessionGetOptions): Promise<Record<string, any>> {
    const args = ["get", id];
    this.pushSessionGetOptions(args, options);
    const output = await this.execSessions(args);
    return JSON.parse(output);
  }

  async sessionSearch(filters: SessionFilter): Promise<any[]> {
    const args: string[] = ["search"];
    if (filters.where) {
      for (const [field, value] of Object.entries(filters.where)) {
        args.push("--where", `${field}=${value}`);
      }
    }
    if (filters.select && filters.select.length > 0) {
      args.push("--select", filters.select.join(","));
    }
    if (filters.backend) {
      args.push("--backend", filters.backend);
    }
    if (filters.count) {
      args.push("--count");
    }
    if (filters.refreshTokens) {
      args.push("--refresh-tokens");
    }
    if (filters.persistent) {
      args.push("--persistent");
    }
    if (filters.hash) {
      args.push("--hash");
    }
    if (filters.idOnly) {
      args.push("--id-only");
    }
    const output = await this.execSessions(args);
    return JSON.parse(output);
  }

  async sessionDelete(ids: string[], options?: SessionDeleteOptions): Promise<void> {
    if (options?.where) {
      // Where-based deletion uses lemonldap-ng-sessions delete
      const args: string[] = ["delete"];
      for (const [field, value] of Object.entries(options.where)) {
        args.push("--where", `${field}=${value}`);
      }
      this.pushSessionGetOptions(args, options);
      await this.execSessions(args);
    } else {
      // ID-based deletion uses llngDeleteSession
      const deleteScriptPath = this.paths.cliPath.replace("lemonldap-ng-cli", "llngDeleteSession");
      for (const id of ids) {
        const args = [deleteScriptPath, id];
        this.pushSessionGetOptions(args, options);
        await this.exec(args);
      }
    }
  }

  async sessionSetKey(
    id: string,
    pairs: Record<string, any>,
    options?: SessionGetOptions,
  ): Promise<void> {
    const args: string[] = ["setKey", id];
    for (const [key, value] of Object.entries(pairs)) {
      args.push(key, String(value));
    }
    this.pushSessionGetOptions(args, options);
    await this.execSessions(args);
  }

  async sessionDelKey(id: string, keys: string[], options?: SessionGetOptions): Promise<void> {
    const args: string[] = ["delKey", id, ...keys];
    this.pushSessionGetOptions(args, options);
    await this.execSessions(args);
  }

  async sessionBackup(
    backend?: string,
    refreshTokens?: boolean,
    persistent?: boolean,
  ): Promise<string> {
    const args = ["search"];
    if (backend) {
      args.push("--backend", backend);
    }
    if (refreshTokens) {
      args.push("--refresh-tokens");
    }
    if (persistent) {
      args.push("--persistent");
    }
    const output = await this.execSessions(args);
    return output;
  }

  // 2FA methods
  async secondFactorsGet(_user: string): Promise<any[]> {
    throw new Error("secondFactorsGet is not supported via CLI. Use API mode.");
  }

  async secondFactorsDelete(_user: string, _ids: string[]): Promise<void> {
    throw new Error("secondFactorsDelete is not supported via CLI. Use API mode.");
  }

  async secondFactorsDelType(_user: string, _type: string): Promise<void> {
    throw new Error("secondFactorsDelType is not supported via CLI. Use API mode.");
  }

  // Consents methods
  async consentsGet(_user: string): Promise<any[]> {
    throw new Error("consentsGet is not supported via CLI. Use API mode.");
  }

  async consentsDelete(_user: string, _ids: string[]): Promise<void> {
    throw new Error("consentsDelete is not supported via CLI. Use API mode.");
  }
}
