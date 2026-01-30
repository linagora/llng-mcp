import { readFileSync, statSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const DEFAULT_BIN_PREFIX = "/usr/share/lemonldap-ng/bin";

export interface SshConfig {
  host?: string;
  user?: string;
  port?: number;
  sudo?: string;
  remoteCommand?: string;
  binPrefix?: string;
  cliPath?: string;
  sessionsPath?: string;
  configEditorPath?: string;
  deleteSessionPath?: string;
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

export interface K8sConfig {
  context?: string;
  namespace: string;
  deployment: string;
  container?: string;
  podSelector?: string;
  binPrefix?: string;
}

export interface LlngConfig {
  mode: "ssh" | "api" | "k8s";
  ssh?: SshConfig;
  api?: ApiConfig;
  k8s?: K8sConfig;
  oidc?: OidcConfig;
}

export interface ResolvedPaths {
  cliPath: string;
  sessionsPath: string;
  configEditorPath: string;
}

export function resolvePaths(
  binPrefix?: string,
  cliPath?: string,
  sessionsPath?: string,
  configEditorPath?: string,
): ResolvedPaths {
  const prefix = binPrefix || DEFAULT_BIN_PREFIX;
  return {
    cliPath: cliPath || `${prefix}/lemonldap-ng-cli`,
    sessionsPath: sessionsPath || `${prefix}/lemonldap-ng-sessions`,
    configEditorPath: configEditorPath || `${prefix}/lmConfigEditor`,
  };
}

export function loadConfig(): LlngConfig {
  // Start with defaults
  const config: LlngConfig = {
    mode: "ssh",
    ssh: {},
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
    if (fileConfig.k8s) {
      config.k8s = fileConfig.k8s;
    }
    if (fileConfig.oidc) {
      config.oidc = fileConfig.oidc;
    }
  } catch {
    // File doesn't exist or invalid JSON - continue with defaults
  }

  // Overlay environment variables
  if (process.env.LLNG_MODE) {
    config.mode = process.env.LLNG_MODE as "ssh" | "api" | "k8s";
  }

  // SSH config - helper to ensure ssh config exists
  const ensureSshConfig = () => {
    if (!config.ssh) {
      config.ssh = {};
    }
    return config.ssh;
  };

  if (process.env.LLNG_SSH_HOST) {
    ensureSshConfig().host = process.env.LLNG_SSH_HOST;
  }
  if (process.env.LLNG_SSH_USER) {
    ensureSshConfig().user = process.env.LLNG_SSH_USER;
  }
  if (process.env.LLNG_SSH_PORT) {
    ensureSshConfig().port = parseInt(process.env.LLNG_SSH_PORT, 10);
  }
  if (process.env.LLNG_SSH_SUDO) {
    ensureSshConfig().sudo = process.env.LLNG_SSH_SUDO;
  }
  if (process.env.LLNG_SSH_REMOTE_COMMAND) {
    ensureSshConfig().remoteCommand = process.env.LLNG_SSH_REMOTE_COMMAND;
  }
  if (process.env.LLNG_SSH_BIN_PREFIX) {
    ensureSshConfig().binPrefix = process.env.LLNG_SSH_BIN_PREFIX;
  }
  if (process.env.LLNG_SSH_CLI_PATH) {
    ensureSshConfig().cliPath = process.env.LLNG_SSH_CLI_PATH;
  }
  if (process.env.LLNG_SSH_SESSIONS_PATH) {
    ensureSshConfig().sessionsPath = process.env.LLNG_SSH_SESSIONS_PATH;
  }
  if (process.env.LLNG_SSH_CONFIG_EDITOR_PATH) {
    ensureSshConfig().configEditorPath = process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
  }
  if (process.env.LLNG_SSH_DELETE_SESSION_PATH) {
    ensureSshConfig().deleteSessionPath = process.env.LLNG_SSH_DELETE_SESSION_PATH;
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

  // K8s config
  const ensureK8sConfig = () => {
    if (!config.k8s) {
      config.k8s = { namespace: "", deployment: "" };
    }
    return config.k8s;
  };

  if (process.env.LLNG_K8S_CONTEXT) {
    ensureK8sConfig().context = process.env.LLNG_K8S_CONTEXT;
  }
  if (process.env.LLNG_K8S_NAMESPACE) {
    ensureK8sConfig().namespace = process.env.LLNG_K8S_NAMESPACE;
  }
  if (process.env.LLNG_K8S_DEPLOYMENT) {
    ensureK8sConfig().deployment = process.env.LLNG_K8S_DEPLOYMENT;
  }
  if (process.env.LLNG_K8S_CONTAINER) {
    ensureK8sConfig().container = process.env.LLNG_K8S_CONTAINER;
  }
  if (process.env.LLNG_K8S_POD_SELECTOR) {
    ensureK8sConfig().podSelector = process.env.LLNG_K8S_POD_SELECTOR;
  }
  if (process.env.LLNG_K8S_BIN_PREFIX) {
    ensureK8sConfig().binPrefix = process.env.LLNG_K8S_BIN_PREFIX;
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

  return config;
}

// Multi-instance support
export type LlngInstanceConfig = LlngConfig;

export interface LlngMultiConfig {
  instances: Record<string, LlngInstanceConfig>;
  default: string;
}

function applyInstanceDefaults(partial: Partial<LlngConfig>): LlngConfig {
  const config: LlngConfig = {
    mode: partial.mode || "ssh",
  };
  if (partial.ssh) config.ssh = { ...partial.ssh };
  if (partial.api) config.api = partial.api;
  if (partial.k8s) config.k8s = partial.k8s;
  if (partial.oidc) config.oidc = partial.oidc;

  // For ssh mode without explicit ssh config, provide empty object
  if (config.mode === "ssh" && !config.ssh) {
    config.ssh = {};
  }

  return config;
}

function applyEnvOverrides(config: LlngConfig): void {
  if (process.env.LLNG_MODE) {
    config.mode = process.env.LLNG_MODE as "ssh" | "api" | "k8s";
  }

  const ensureSsh = () => {
    if (!config.ssh) {
      config.ssh = {};
    }
    return config.ssh;
  };

  if (process.env.LLNG_SSH_HOST) ensureSsh().host = process.env.LLNG_SSH_HOST;
  if (process.env.LLNG_SSH_USER) ensureSsh().user = process.env.LLNG_SSH_USER;
  if (process.env.LLNG_SSH_PORT) ensureSsh().port = parseInt(process.env.LLNG_SSH_PORT, 10);
  if (process.env.LLNG_SSH_SUDO) ensureSsh().sudo = process.env.LLNG_SSH_SUDO;
  if (process.env.LLNG_SSH_REMOTE_COMMAND) ensureSsh().remoteCommand = process.env.LLNG_SSH_REMOTE_COMMAND;
  if (process.env.LLNG_SSH_BIN_PREFIX) ensureSsh().binPrefix = process.env.LLNG_SSH_BIN_PREFIX;
  if (process.env.LLNG_SSH_CLI_PATH) ensureSsh().cliPath = process.env.LLNG_SSH_CLI_PATH;
  if (process.env.LLNG_SSH_SESSIONS_PATH)
    ensureSsh().sessionsPath = process.env.LLNG_SSH_SESSIONS_PATH;
  if (process.env.LLNG_SSH_CONFIG_EDITOR_PATH)
    ensureSsh().configEditorPath = process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
  if (process.env.LLNG_SSH_DELETE_SESSION_PATH)
    ensureSsh().deleteSessionPath = process.env.LLNG_SSH_DELETE_SESSION_PATH;

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

  // K8s env overrides
  const ensureK8s = () => {
    if (!config.k8s) {
      config.k8s = { namespace: "", deployment: "" };
    }
    return config.k8s;
  };

  if (process.env.LLNG_K8S_CONTEXT) ensureK8s().context = process.env.LLNG_K8S_CONTEXT;
  if (process.env.LLNG_K8S_NAMESPACE) ensureK8s().namespace = process.env.LLNG_K8S_NAMESPACE;
  if (process.env.LLNG_K8S_DEPLOYMENT) ensureK8s().deployment = process.env.LLNG_K8S_DEPLOYMENT;
  if (process.env.LLNG_K8S_CONTAINER) ensureK8s().container = process.env.LLNG_K8S_CONTAINER;
  if (process.env.LLNG_K8S_POD_SELECTOR) ensureK8s().podSelector = process.env.LLNG_K8S_POD_SELECTOR;
  if (process.env.LLNG_K8S_BIN_PREFIX) ensureK8s().binPrefix = process.env.LLNG_K8S_BIN_PREFIX;

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
}

export function loadMultiConfig(): LlngMultiConfig {
  const configPath = join(homedir(), ".llng-mcp.json");
  let fileConfig: any = null;

  // Check file permissions
  try {
    const stats = statSync(configPath);
    const mode = stats.mode & 0o777;
    if (mode & 0o077) {
      console.error(
        `WARNING: ${configPath} has permissions ${mode.toString(8)}. It may contain credentials and should be restricted to owner only (chmod 600).`,
      );
    }
  } catch {
    // stat failed, file may not exist
  }

  try {
    const fileContent = readFileSync(configPath, "utf-8");
    fileConfig = JSON.parse(fileContent);
  } catch {
    // File doesn't exist or invalid JSON
  }

  // Detect multi-instance format
  if (fileConfig && fileConfig.instances) {
    const instances: Record<string, LlngConfig> = {};
    for (const [name, instanceConfig] of Object.entries(fileConfig.instances)) {
      instances[name] = applyInstanceDefaults(instanceConfig as Partial<LlngConfig>);
    }
    const instanceNames = Object.keys(instances);
    let defaultName: string | undefined = fileConfig.default;
    if (!defaultName || !instances[defaultName]) {
      defaultName = instanceNames[0] || "default";
    }
    const multi: LlngMultiConfig = {
      instances,
      default: defaultName,
    };
    // Apply env vars to the default instance, if it exists
    if (multi.instances[multi.default]) {
      applyEnvOverrides(multi.instances[multi.default]);
    }
    return multi;
  }

  // Legacy flat format: wrap as single "default" instance
  const singleConfig = loadConfig();
  return {
    instances: { default: singleConfig },
    default: "default",
  };
}
