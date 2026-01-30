import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { loadConfig, loadMultiConfig } from "../config.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";

vi.mock("fs");
vi.mock("os");
vi.mock("path");

describe("loadConfig", () => {
  beforeEach(() => {
    // Reset all mocks before each test
    vi.resetAllMocks();

    // Setup default mock returns
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
    vi.mocked(path.join).mockImplementation((...args) => args.join("/"));

    // Clear all env vars
    delete process.env.LLNG_MODE;
    delete process.env.LLNG_SSH_HOST;
    delete process.env.LLNG_SSH_USER;
    delete process.env.LLNG_SSH_PORT;
    delete process.env.LLNG_SSH_SUDO;
    delete process.env.LLNG_SSH_CLI_PATH;
    delete process.env.LLNG_SSH_SESSIONS_PATH;
    delete process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
    delete process.env.LLNG_API_URL;
    delete process.env.LLNG_API_BASIC_USER;
    delete process.env.LLNG_API_BASIC_PASSWORD;
    delete process.env.LLNG_API_VERIFY_SSL;
    delete process.env.LLNG_OIDC_ISSUER;
    delete process.env.LLNG_OIDC_CLIENT_ID;
    delete process.env.LLNG_OIDC_CLIENT_SECRET;
    delete process.env.LLNG_OIDC_REDIRECT_URI;
    delete process.env.LLNG_OIDC_SCOPE;
  });

  afterEach(() => {
    // Cleanup env vars after each test
    delete process.env.LLNG_MODE;
    delete process.env.LLNG_SSH_HOST;
    delete process.env.LLNG_SSH_USER;
    delete process.env.LLNG_SSH_PORT;
    delete process.env.LLNG_SSH_SUDO;
    delete process.env.LLNG_SSH_CLI_PATH;
    delete process.env.LLNG_SSH_SESSIONS_PATH;
    delete process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
    delete process.env.LLNG_API_URL;
    delete process.env.LLNG_API_BASIC_USER;
    delete process.env.LLNG_API_BASIC_PASSWORD;
    delete process.env.LLNG_API_VERIFY_SSL;
    delete process.env.LLNG_OIDC_ISSUER;
    delete process.env.LLNG_OIDC_CLIENT_ID;
    delete process.env.LLNG_OIDC_CLIENT_SECRET;
    delete process.env.LLNG_OIDC_REDIRECT_URI;
    delete process.env.LLNG_OIDC_SCOPE;
  });

  it("returns defaults when no file and no env vars", () => {
    // Mock file not existing (ENOENT error)
    const error: any = new Error("ENOENT: no such file or directory");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    const config = loadConfig();

    expect(config).toEqual({
      mode: "ssh",
      ssh: {
        cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
        configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
      },
    });
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
    expect(config.ssh).toEqual({
      host: "server.example.com",
      user: "admin",
      port: 2222,
      cliPath: "/custom/path/cli",
      sessionsPath: "/custom/path/sessions",
      configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
    });
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
    expect(config).toEqual({
      mode: "ssh",
      ssh: {
        cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
        sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
        configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
      },
    });
  });

  it("partial file config is merged with defaults", () => {
    const fileConfig = {
      ssh: {
        host: "server.example.com",
        // Missing cliPath and sessionsPath
      },
    };

    vi.mocked(fs.readFileSync).mockReturnValue(JSON.stringify(fileConfig));

    const config = loadConfig();

    // Should have host from file and default paths
    expect(config.ssh).toEqual({
      host: "server.example.com",
      cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
      sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
      configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
    });
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

    expect(config.ssh).toEqual({
      host: "server.example.com",
      user: "admin",
      sudo: "www-data",
      cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
      sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
      configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
    });
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

    expect(config.ssh).toEqual({
      cliPath: "/custom/cli",
      sessionsPath: "/custom/sessions",
      configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
    });
  });

  it("custom config editor path from env var", () => {
    const error: any = new Error("ENOENT");
    error.code = "ENOENT";
    vi.mocked(fs.readFileSync).mockImplementation(() => {
      throw error;
    });

    process.env.LLNG_SSH_CONFIG_EDITOR_PATH = "/custom/configEditor";

    const config = loadConfig();

    expect(config.ssh).toEqual({
      cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
      sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
      configEditorPath: "/custom/configEditor",
    });
  });
});

describe("loadMultiConfig", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(os.homedir).mockReturnValue("/home/testuser");
    vi.mocked(path.join).mockImplementation((...args) => args.join("/"));

    // Clear env vars
    delete process.env.LLNG_MODE;
    delete process.env.LLNG_SSH_HOST;
    delete process.env.LLNG_SSH_USER;
    delete process.env.LLNG_SSH_PORT;
    delete process.env.LLNG_SSH_SUDO;
    delete process.env.LLNG_SSH_CLI_PATH;
    delete process.env.LLNG_SSH_SESSIONS_PATH;
    delete process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
    delete process.env.LLNG_API_URL;
    delete process.env.LLNG_API_BASIC_USER;
    delete process.env.LLNG_API_BASIC_PASSWORD;
    delete process.env.LLNG_API_VERIFY_SSL;
    delete process.env.LLNG_OIDC_ISSUER;
    delete process.env.LLNG_OIDC_CLIENT_ID;
    delete process.env.LLNG_OIDC_CLIENT_SECRET;
    delete process.env.LLNG_OIDC_REDIRECT_URI;
    delete process.env.LLNG_OIDC_SCOPE;
  });

  afterEach(() => {
    delete process.env.LLNG_MODE;
    delete process.env.LLNG_SSH_HOST;
    delete process.env.LLNG_SSH_USER;
    delete process.env.LLNG_SSH_PORT;
    delete process.env.LLNG_SSH_SUDO;
    delete process.env.LLNG_SSH_CLI_PATH;
    delete process.env.LLNG_SSH_SESSIONS_PATH;
    delete process.env.LLNG_SSH_CONFIG_EDITOR_PATH;
    delete process.env.LLNG_API_URL;
    delete process.env.LLNG_API_BASIC_USER;
    delete process.env.LLNG_API_BASIC_PASSWORD;
    delete process.env.LLNG_API_VERIFY_SSL;
    delete process.env.LLNG_OIDC_ISSUER;
    delete process.env.LLNG_OIDC_CLIENT_ID;
    delete process.env.LLNG_OIDC_CLIENT_SECRET;
    delete process.env.LLNG_OIDC_REDIRECT_URI;
    delete process.env.LLNG_OIDC_SCOPE;
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

    expect(multi.instances.local.ssh?.cliPath).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-cli");
    expect(multi.instances.local.ssh?.sessionsPath).toBe("/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions");
    expect(multi.instances.local.ssh?.configEditorPath).toBe("/usr/share/lemonldap-ng/bin/lmConfigEditor");
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
});
