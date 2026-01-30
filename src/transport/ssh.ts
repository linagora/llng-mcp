import { spawn } from "child_process";
import { SshConfig, resolvePaths } from "../config.js";
import { ILlngTransport, SessionFilter, ConfigInfo, SessionGetOptions, SessionDeleteOptions } from "./interface.js";

export class SshTransport implements ILlngTransport {
  private paths: { cliPath: string; sessionsPath: string; configEditorPath: string };

  constructor(private config: SshConfig) {
    this.paths = resolvePaths(
      config.binPrefix,
      config.cliPath,
      config.sessionsPath,
      config.configEditorPath,
    );
  }

  private async exec(args: string[], env?: Record<string, string>): Promise<string> {
    return new Promise((resolve, reject) => {
      let cmd: string;
      let cmdArgs: string[];

      if (this.config.host) {
        // SSH mode
        cmd = "ssh";
        cmdArgs = [];

        if (this.config.port) {
          cmdArgs.push("-p", this.config.port.toString());
        }

        const hostSpec = this.config.user
          ? `${this.config.user}@${this.config.host}`
          : this.config.host;
        cmdArgs.push(hostSpec);

        // Build the remote command
        let remoteCmd = args.map((arg) => this.shellQuote(arg)).join(" ");

        // If env vars are provided, prefix with env command
        if (env) {
          const envPrefix = Object.entries(env)
            .map(([k, v]) => `${k}=${this.shellQuote(v)}`)
            .join(" ");
          remoteCmd = `env ${envPrefix} ${remoteCmd}`;
        }

        // Insert remoteCommand between sudo and the LLNG command
        if (this.config.remoteCommand) {
          remoteCmd = `${this.config.remoteCommand} ${remoteCmd}`;
        }

        if (this.config.sudo) {
          remoteCmd = `sudo -u ${this.shellQuote(this.config.sudo)} ${remoteCmd}`;
        }

        cmdArgs.push(remoteCmd);
      } else {
        // Local mode
        if (this.config.sudo) {
          cmd = "sudo";
          cmdArgs = ["-u", this.config.sudo];
          if (this.config.remoteCommand) {
            cmdArgs.push(...this.config.remoteCommand.split(" "), ...args);
          } else {
            cmdArgs.push(...args);
          }
        } else if (this.config.remoteCommand) {
          const parts = this.config.remoteCommand.split(" ");
          cmd = parts[0];
          cmdArgs = [...parts.slice(1), ...args];
        } else {
          cmd = args[0];
          cmdArgs = args.slice(1);
        }
      }

      const spawnOpts = env ? { env: { ...process.env, ...env } } : undefined;
      const proc = spawn(cmd, cmdArgs, spawnOpts);
      let stdout = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", () => {
        // stderr is consumed but not exposed to clients for security
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with exit code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on("error", () => {
        reject(new Error("Command execution failed"));
      });
    });
  }

  private async execWithStdin(args: string[], input: string): Promise<string> {
    return new Promise((resolve, reject) => {
      let cmd: string;
      let cmdArgs: string[];

      if (this.config.host) {
        // SSH mode
        cmd = "ssh";
        cmdArgs = [];

        if (this.config.port) {
          cmdArgs.push("-p", this.config.port.toString());
        }

        const hostSpec = this.config.user
          ? `${this.config.user}@${this.config.host}`
          : this.config.host;
        cmdArgs.push(hostSpec);

        // Build the remote command
        let remoteCmd = args.map((arg) => this.shellQuote(arg)).join(" ");

        if (this.config.remoteCommand) {
          remoteCmd = `${this.config.remoteCommand} ${remoteCmd}`;
        }

        if (this.config.sudo) {
          remoteCmd = `sudo -u ${this.shellQuote(this.config.sudo)} ${remoteCmd}`;
        }

        cmdArgs.push(remoteCmd);
      } else {
        // Local mode
        if (this.config.sudo) {
          cmd = "sudo";
          cmdArgs = ["-u", this.config.sudo];
          if (this.config.remoteCommand) {
            cmdArgs.push(...this.config.remoteCommand.split(" "), ...args);
          } else {
            cmdArgs.push(...args);
          }
        } else if (this.config.remoteCommand) {
          const parts = this.config.remoteCommand.split(" ");
          cmd = parts[0];
          cmdArgs = [...parts.slice(1), ...args];
        } else {
          cmd = args[0];
          cmdArgs = args.slice(1);
        }
      }

      const proc = spawn(cmd, cmdArgs);
      let stdout = "";

      proc.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      proc.stderr.on("data", () => {
        // stderr is consumed but not exposed to clients for security
      });

      proc.on("close", (code) => {
        if (code !== 0) {
          reject(new Error(`Command failed with exit code ${code}`));
        } else {
          resolve(stdout);
        }
      });

      proc.on("error", () => {
        reject(new Error("Command execution failed"));
      });

      // Write input to stdin
      proc.stdin.write(input);
      proc.stdin.end();
    });
  }

  private shellQuote(arg: string): string {
    // Simple shell quoting - escape single quotes and wrap in single quotes
    return `'${arg.replace(/'/g, "'\\''")}'`;
  }

  private async execCli(subArgs: string[]): Promise<string> {
    return this.exec([this.paths.cliPath, ...subArgs]);
  }

  private async execSessions(subArgs: string[]): Promise<string> {
    return this.exec([this.paths.sessionsPath, ...subArgs]);
  }

  private async execConfigEditor(subArgs: string[]): Promise<string> {
    return this.exec([this.paths.configEditorPath, ...subArgs], { EDITOR: "cat" });
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
    // Parse text output like "Num      : 1\nAuthor   : The LemonLDAP::NG team\n..."
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
    // Parse text output like "portal = http://auth.example.com/\ndomain = example.com"
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
      const deleteScriptPath =
        this.config.deleteSessionPath ||
        this.paths.cliPath.replace("lemonldap-ng-cli", "llngDeleteSession");
      for (const id of ids) {
        const args = [deleteScriptPath, id];
        this.pushSessionGetOptions(args, options);
        await this.exec(args);
      }
    }
  }

  async sessionSetKey(id: string, pairs: Record<string, any>, options?: SessionGetOptions): Promise<void> {
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

  async sessionBackup(backend?: string, refreshTokens?: boolean, persistent?: boolean): Promise<string> {
    // Return all sessions as JSON via search with no filters
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
