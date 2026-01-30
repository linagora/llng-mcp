import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, loadMultiConfig, resolvePaths } from "../config.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("fs");
vi.mock("os");
vi.mock("path");

const allEnvVars = [
  "LLNG_MODE",
  "LLNG_SSH_HOST",
  "LLNG_SSH_USER",
  "LLNG_SSH_PORT",
  "LLNG_SSH_SUDO",
  "LLNG_SSH_REMOTE_COMMAND",
  "LLNG_SSH_BIN_PREFIX",
  "LLNG_SSH_CLI_PATH",
  "LLNG_SSH_SESSIONS_PATH",
  "LLNG_SSH_CONFIG_EDITOR_PATH",
  "LLNG_SSH_DELETE_SESSION_PATH",
  "LLNG_API_URL",
  "LLNG_API_BASIC_USER",
  "LLNG_API_BASIC_PASSWORD",
  "LLNG_API_VERIFY_SSL",
  "LLNG_OIDC_ISSUER",
  "LLNG_OIDC_CLIENT_ID",
  "LLNG_OIDC_CLIENT_SECRET",
  "LLNG_OIDC_REDIRECT_URI",
  "LLNG_OIDC_SCOPE",
  "LLNG_K8S_CONTEXT",
  "LLNG_K8S_NAMESPACE",
  "LLNG_K8S_DEPLOYMENT",
  "LLNG_K8S_CONTAINER",
  "LLNG_K8S_POD_SELECTOR",
  "LLNG_K8S_BIN_PREFIX",
];

function clearEnvVars() {
  for (const v of allEnvVars) {
    delete process.env[v];
  }
}

describe("resolvePaths", () => {
  it("uses default binPrefix when nothing provided", () => {
    const paths = resolvePaths();
    expect(paths.cliPath).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
    expect(paths.sessionsPath).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions");
    expect(paths.configEditorPath).toBe("/usr/share/lemonldap-ng/bin/lmConfigEditor");
  });

  it("uses custom binPrefix", () => {
    const paths = resolvePaths("/opt/llng/bin");
    expect(paths.cliPath).toBe("/opt/llng/bin/lemonldap-ng-cli");
    expect(paths.sessionsPath).toBe("/opt/llng/bin/lemonldap-ng-sessions");
    expect(paths.configEditorPath).toBe("/opt/llng/bin/lmConfigEditor");
  });

  it("explicit paths override binPrefix", () => {
    const paths = resolvePaths("/opt/llng/bin", "/custom/cli", undefined, "/custom/editor");
    expect(paths.cliPath).toBe("/custom/cli");
    expect(paths.sessionsPath).toBe("/opt/llng/bin/lemonldap-ng-sessions");
    expect(paths.configEditorPath).toBe("/custom/editor");
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
    vi.mocked(path.join).mockImplementation((...args) => args.join("/"));
    clearEnvVars();
  });

  afterEach(() => {
    clearEnvVars();
  });

  it("returns defaults when no file and no env vars", () => {
    const error: any = new Error("ENOENT: no such file or directory");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    const config = loadConfig();

    expect(config.mode).toBe("ssh");
    expect(config.ssh).toBeDefined();
  });

  it("loads config from file", () => {
    const fileConfig = {
      mode: "api",
      ssh: {
        host: "server.example.com",
        user: "admin",
        port: 2222,
        cliPath: "/custom/path/cli",
        sessionsPath: "/custom/path/sessions",
      },
      api: {
        baseUrl: "https://api.example.com",
        basicAuth: {
          username: "user",
          password: "pass",
        },
        verifySsl: false,
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const config = loadConfig();

    expect(config.mode).toBe("api");
    expect(config.ssh?.host).toBe("server.example.com");
    expect(config.ssh?.user).toBe("admin");
    expect(config.ssh?.port).toBe(2222);
    expect(config.ssh?.cliPath).toBe("/custom/path/cli");
    expect(config.ssh?.sessionsPath).toBe("/custom/path/sessions");
    expect(config.api).toEqual({
      baseUrl: "https://api.example.com",
      basicAuth: {
        username: "user",
        password: "pass",
      },
      verifySsl: false,
    });
  });

  it("env vars override file values", () => {
    const fileConfig = {
      mode: "api",
      ssh: {
        host: "file-server.example.com",
        port: 2222,
        cliPath: "/file/path/cli",
        sessionsPath: "/file/path/sessions",
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    // Set env vars to override
    process.env.LLNG_MODE = "ssh";
    process.env.LLNG_SSH_HOST = "env-server.example.com";
    process.env.LLNG_SSH_PORT = "3333";

    const config = loadConfig();

    expect(config.mode).toBe("ssh");
    expect(config.ssh?.host).toBe("env-server.example.com");
    expect(config.ssh?.port).toBe(3333);
    // File values should still be present for non-overridden fields
    expect(config.ssh?.cliPath).toBe("/file/path/cli");
  });

  it("LLNG_MODE env var sets mode", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_MODE = "api";

    const config = loadConfig();

    expect(config.mode).toBe("api");
  });

  it("LLNG_SSH_PORT is parsed as integer", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_SSH_PORT = "2222";

    const config = loadConfig();

    expect(config.ssh?.port).toBe(2222);
    expect(typeof config.ssh?.port).toBe("number");
  });

  it('LLNG_API_VERIFY_SSL "false" sets verifySsl to false', () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_API_URL = "https://api.example.com";
    process.env.LLNG_API_VERIFY_SSL = "false";

    const config = loadConfig();

    expect(config.api?.verifySsl).toBe(false);
  });

  it("LLNG_API_VERIFY_SSL with any other value sets verifySsl to true", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_API_URL = "https://api.example.com";
    process.env.LLNG_API_VERIFY_SSL = "true";

    const config = loadConfig();

    expect(config.api?.verifySsl).toBe(true);
  });

  it("OIDC env vars populate oidc config", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_OIDC_ISSUER = "https://oidc.example.com";
    process.env.LLNG_OIDC_CLIENT_ID = "client123";
    process.env.LLNG_OIDC_CLIENT_SECRET = "secret456";
    process.env.LLNG_OIDC_REDIRECT_URI = "http://localhost:3000/callback";
    process.env.LLNG_OIDC_SCOPE = "openid profile email";

    const config = loadConfig();

    expect(config.oidc).toEqual({
      issuer: "https://oidc.example.com",
      clientId: "client123",
      clientSecret: "secret456",
      redirectUri: "http://localhost:3000/callback",
      scope: "openid profile email",
    });
  });

  it("invalid JSON in file is handled gracefully", () => {
    vi.mocked(fs.readFileSync).mockReturnValue("{ invalid json }");

    const config = loadConfig();

    // Should return defaults despite invalid JSON
    expect(config.mode).toBe("ssh");
    expect(config.ssh).toBeDefined();
  });

  it("partial file config is merged with defaults", () => {
    const fileConfig = {
      ssh: {
        host: "server.example.com",
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const config = loadConfig();

    expect(config.ssh?.host).toBe("server.example.com");
  });

  it("env vars create ssh config even when not in file", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_SSH_HOST = "server.example.com";
    process.env.LLNG_SSH_USER = "admin";
    process.env.LLNG_SSH_SUDO = "www-data";

    const config = loadConfig();

    expect(config.ssh?.host).toBe("server.example.com");
    expect(config.ssh?.user).toBe("admin");
    expect(config.ssh?.sudo).toBe("www-data");
  });

  it("API basic auth env vars populate basicAuth", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_API_URL = "https://api.example.com";
    process.env.LLNG_API_BASIC_USER = "apiuser";
    process.env.LLNG_API_BASIC_PASSWORD = "apipass";

    const config = loadConfig();

    expect(config.api).toEqual({
      baseUrl: "https://api.example.com",
      basicAuth: {
        username: "apiuser",
        password: "apipass",
      },
    });
  });

  it("custom CLI and sessions paths from env vars", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_SSH_CLI_PATH = "/custom/cli";
    process.env.LLNG_SSH_SESSIONS_PATH = "/custom/sessions";

    const config = loadConfig();

    expect(config.ssh?.cliPath).toBe("/custom/cli");
    expect(config.ssh?.sessionsPath).toBe("/custom/sessions");
  });

  it("custom config editor path from env var", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_SSH_CONFIG_EDITOR_PATH = "/custom/configEditor";

    const config = loadConfig();

    expect(config.ssh?.configEditorPath).toBe("/custom/configEditor");
  });

  describe("binPrefix", () => {
    it("LLNG_SSH_BIN_PREFIX env var is stored", () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      process.env.LLNG_SSH_BIN_PREFIX = "/opt/llng/bin";

      const config = loadConfig();

      expect(config.ssh?.binPrefix).toBe("/opt/llng/bin");
    });

    it("binPrefix from file config is preserved", () => {
      const fileConfig = {
        ssh: {
          binPrefix: "/opt/llng/bin",
        },
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

      const config = loadConfig();

      expect(config.ssh?.binPrefix).toBe("/opt/llng/bin");
    });
  });

  describe("remoteCommand", () => {
    it("LLNG_SSH_REMOTE_COMMAND env var is stored", () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      process.env.LLNG_SSH_REMOTE_COMMAND = "docker exec sso-auth-1";

      const config = loadConfig();

      expect(config.ssh?.remoteCommand).toBe("docker exec sso-auth-1");
    });

    it("remoteCommand from file config is preserved", () => {
      const fileConfig = {
        ssh: {
          remoteCommand: "docker exec sso-auth-1",
        },
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

      const config = loadConfig();

      expect(config.ssh?.remoteCommand).toBe("docker exec sso-auth-1");
    });
  });

  describe("k8s config", () => {
    it("loads k8s config from file", () => {
      const fileConfig = {
        mode: "k8s",
        k8s: {
          context: "prod-cluster",
          namespace: "auth",
          deployment: "lemonldap-ng",
          container: "sso",
        },
      };

      vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

      const config = loadConfig();

      expect(config.mode).toBe("k8s");
      expect(config.k8s).toEqual({
        context: "prod-cluster",
        namespace: "auth",
        deployment: "lemonldap-ng",
        container: "sso",
      });
    });

    it("LLNG_K8S env vars populate k8s config", () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      process.env.LLNG_MODE = "k8s";
      process.env.LLNG_K8S_CONTEXT = "my-cluster";
      process.env.LLNG_K8S_NAMESPACE = "auth";
      process.env.LLNG_K8S_DEPLOYMENT = "llng";
      process.env.LLNG_K8S_CONTAINER = "sso";
      process.env.LLNG_K8S_POD_SELECTOR = "app=llng";
      process.env.LLNG_K8S_BIN_PREFIX = "/opt/llng/bin";

      const config = loadConfig();

      expect(config.mode).toBe("k8s");
      expect(config.k8s).toEqual({
        context: "my-cluster",
        namespace: "auth",
        deployment: "llng",
        container: "sso",
        podSelector: "app=llng",
        binPrefix: "/opt/llng/bin",
      });
    });

    it("LLNG_MODE=k8s sets mode", () => {
      const error: any = new Error("ENOENT");
      error.code = "ENOENT";
      vi.mocked(fs.readFileSync).mockImplementation(() => {
        throw error;
      });

      process.env.LLNG_MODE = "k8s";

      const config = loadConfig();
      expect(config.mode).toBe("k8s");
    });
  });
});

describe("loadMultiConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
    vi.mocked(path.join).mockImplementation((...args) => args.join("/"));
    clearEnvVars();
  });

  afterEach(() => {
    clearEnvVars();
  });

  it("wraps legacy flat config as default instance", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    const multi = loadMultiConfig();

    expect(multi.default).toBe("default");
    expect(Object.keys(multi.instances)).toEqual(["default"]);
    expect(multi.instances.default.mode).toBe("ssh");
  });

  it("loads multi-instance config", () => {
    const fileConfig = {
      instances: {
        prod: { mode: "api", api: { baseUrl: "https://prod.example.com" } },
        staging: { mode: "ssh", ssh: { host: "staging.example.com" } },
      },
      default: "prod",
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const multi = loadMultiConfig();

    expect(multi.default).toBe("prod");
    expect(Object.keys(multi.instances)).toEqual(["prod", "staging"]);
    expect(multi.instances.prod.mode).toBe("api");
    expect(multi.instances.prod.api?.baseUrl).toBe("https://prod.example.com");
    expect(multi.instances.staging.mode).toBe("ssh");
    expect(multi.instances.staging.ssh?.host).toBe("staging.example.com");
  });

  it("applies SSH defaults to multi-instance configs", () => {
    const fileConfig = {
      instances: {
        local: { mode: "ssh" },
      },
      default: "local",
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const multi = loadMultiConfig();

    // SSH config should exist (empty object for ssh mode)
    expect(multi.instances.local.ssh).toBeDefined();
  });

  it("applies env vars to the default instance only", () => {
    const fileConfig = {
      instances: {
        prod: { mode: "api", api: { baseUrl: "https://prod.example.com" } },
        staging: { mode: "api", api: { baseUrl: "https://staging.example.com" } },
      },
      default: "prod",
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    process.env.LLNG_MODE = "ssh";

    const multi = loadMultiConfig();

    expect(multi.instances.prod.mode).toBe("ssh");
    expect(multi.instances.staging.mode).toBe("api");
  });

  it("uses first instance as default when default is not specified", () => {
    const fileConfig = {
      instances: {
        alpha: { mode: "ssh" },
        beta: { mode: "api", api: { baseUrl: "https://beta.example.com" } },
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const multi = loadMultiConfig();

    expect(multi.default).toBe("alpha");
  });

  it("supports k8s mode in multi-instance config", () => {
    const fileConfig = {
      instances: {
        prod: {
          mode: "k8s",
          k8s: { context: "prod", namespace: "auth", deployment: "llng" },
        },
        dev: {
          mode: "ssh",
          ssh: { remoteCommand: "docker exec llng-1" },
        },
      },
      default: "prod",
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const multi = loadMultiConfig();

    expect(multi.instances.prod.mode).toBe("k8s");
    expect(multi.instances.prod.k8s?.namespace).toBe("auth");
    expect(multi.instances.dev.mode).toBe("ssh");
    expect(multi.instances.dev.ssh?.remoteCommand).toBe("docker exec llng-1");
  });
});
