import { readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

export interface SshConfig {
  host?: string;
  user?: string;
  port?: number;
  sudo?: string;
  cliPath: string;
  sessionsPath: string;
  configEditorPath: string;
}

export interface ApiConfig {
  baseUrl: string;
  basicAuth?: { username: string; password: string };
  verifySsl?: boolean;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret?: string;
  redirectUri: string;
  scope: string;
}

export interface LlngConfig {
  mode: "ssh" | "api";
  ssh?: SshConfig;
  api?: ApiConfig;
  oidc?: OidcConfig;
}

export function loadConfig(): LlngConfig {
  // Start with defaults
  const config: LlngConfig = {
    mode: "ssh",
    ssh: {
      cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
      sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
      configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
    },
  };

  // Try to load config file from ~/.llng-mcp.json
  const configPath = join(homedir(), ".llng-mcp.json");
  try {
    // Check file permissions - warn if too open
    try {
      const stats = statSync(configPath);
      const mode = stats.mode & 0o777;
      if (mode & 0o077) {
        console.error(
          `WARNING: ${configPath} has permissions ${mode.toString(8)}. It may contain credentials and should be restricted to owner only (chmod 600).`,
        );
      }
    } catch {
      // stat failed, file may not exist - continue
    }
    const fileContent = readFileSync(configPath, "utf-8");
    const fileConfig = JSON.parse(fileContent);

    // Merge file config with defaults
    if (fileConfig.mode) config.mode = fileConfig.mode;
    if (fileConfig.ssh) {
      config.ssh = { ...config.ssh, ...fileConfig.ssh };
    }
    if (fileConfig.api) {
      config.api = fileConfig.api;
    }
    if (fileConfig.oidc) {
      config.oidc = fileConfig.oidc;
    }
  } catch {
    // File doesn't exist or invalid JSON - continue with defaults
  }

  // Overlay environment variables
  if (process.env.LLNG_MODE) {
    config.mode = process.env.LLNG_MODE as "ssh" | "api";
  }

  // SSH config
  if (process.env.LLNG_SSH_HOST) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.host = process.env.LLNG_SSH_HOST;
  }
  if (process.env.LLNG_SSH_USER) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.user = process.env.LLNG_SSH_USER;
  }
  if (process.env.LLNG_SSH_PORT) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.port = parseInt(process.env.LLNG_SSH_PORT, 10);
  }
  if (process.env.LLNG_SSH_SUDO) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.sudo = process.env.LLNG_SSH_SUDO;
  }
  if (process.env.LLNG_SSH_CLI_PATH) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.cliPath = process.env.LLNG_SSH_CLI_PATH;
  }
  if (process.env.LLNG_SSH_SESSIONS_PATH) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.sessionsPath = process.env.LLNG_SSH_SESSIONS_PATH;
  }
  if (process.env.LLNG_SSH_CONFIG_EDITOR_PATH) {
    config.ssh = config.ssh || { cliPath: "", sessionsPath: "", configEditorPath: "" };
    config.ssh.configEditorPath = process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
  }

  // API config
  if (process.env.LLNG_API_URL) {
    config.api = config.api || { baseUrl: process.env.LLNG_API_URL };
    config.api.baseUrl = process.env.LLNG_API_URL;
  }
  if (process.env.LLNG_API_BASIC_USER || process.env.LLNG_API_BASIC_PASSWORD) {
    config.api = config.api || { baseUrl: "" };
    config.api.basicAuth = {
      username: process.env.LLNG_API_BASIC_USER || "",
      password: process.env.LLNG_API_BASIC_PASSWORD || "",
    };
  }
  if (process.env.LLNG_API_VERIFY_SSL) {
    config.api = config.api || { baseUrl: "" };
    config.api.verifySsl = process.env.LLNG_API_VERIFY_SSL !== "false";
  }

  // OIDC config
  if (process.env.LLNG_OIDC_ISSUER) {
    config.oidc = config.oidc || { issuer: "", clientId: "", redirectUri: "", scope: "" };
    config.oidc.issuer = process.env.LLNG_OIDC_ISSUER;
  }
  if (process.env.LLNG_OIDC_CLIENT_ID) {
    config.oidc = config.oidc || { issuer: "", clientId: "", redirectUri: "", scope: "" };
    config.oidc.clientId = process.env.LLNG_OIDC_CLIENT_ID;
  }
  if (process.env.LLNG_OIDC_CLIENT_SECRET) {
    config.oidc = config.oidc || { issuer: "", clientId: "", redirectUri: "", scope: "" };
    config.oidc.clientSecret = process.env.LLNG_OIDC_CLIENT_SECRET;
  }
  if (process.env.LLNG_OIDC_REDIRECT_URI) {
    config.oidc = config.oidc || { issuer: "", clientId: "", redirectUri: "", scope: "" };
    config.oidc.redirectUri = process.env.LLNG_OIDC_REDIRECT_URI;
  }
  if (process.env.LLNG_OIDC_SCOPE) {
    config.oidc = config.oidc || { issuer: "", clientId: "", redirectUri: "", scope: "" };
    config.oidc.scope = process.env.LLNG_OIDC_SCOPE;
  }

  // Ensure SSH defaults are applied
  if (config.ssh) {
    config.ssh.cliPath = config.ssh.cliPath || "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli";
    config.ssh.sessionsPath =
      config.ssh.sessionsPath || "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions";
    config.ssh.configEditorPath =
      config.ssh.configEditorPath || "/usr/share/lemonldap-ng/bin/lmConfigEditor";
  }

  return config;
}
