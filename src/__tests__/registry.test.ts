import { describe, it, expect, vi } from "vitest";
import { TransportRegistry } from "../transport/registry.js";
import { LlngMultiConfig } from "../config.js";

vi.mock("../transport/api.js", () => {
  const ApiTransport = vi.fn(function (this: any) {
    this._type = "api";
  });
  return { ApiTransport };
});

vi.mock("../transport/ssh.js", () => {
  const SshTransport = vi.fn(function (this: any) {
    this._type = "ssh";
  });
  return { SshTransport };
});

describe("TransportRegistry", () => {
  function makeConfig(overrides?: Partial<LlngMultiConfig>): LlngMultiConfig {
    return {
      instances: {
        prod: {
          mode: "api",
          api: { baseUrl: "https://prod.example.com" },
        },
        staging: {
          mode: "ssh",
          ssh: {
            host: "staging.example.com",
            cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
            sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
            configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
          },
        },
      },
      default: "prod",
      ...overrides,
    };
  }

  it("returns transport for default instance when no name given", () => {
    const registry = new TransportRegistry(makeConfig());
    const transport = registry.getTransport();
    expect(transport).toBeDefined();
    expect((transport as any)._type).toBe("api");
  });

  it("returns transport for named instance", () => {
    const registry = new TransportRegistry(makeConfig());
    const transport = registry.getTransport("staging");
    expect((transport as any)._type).toBe("ssh");
  });

  it("caches transport instances", () => {
    const registry = new TransportRegistry(makeConfig());
    const t1 = registry.getTransport("prod");
    const t2 = registry.getTransport("prod");
    expect(t1).toBe(t2);
  });

  it("throws for unknown instance", () => {
    const registry = new TransportRegistry(makeConfig());
    expect(() => registry.getTransport("unknown")).toThrow(
      "Unknown instance 'unknown'. Available instances: prod, staging",
    );
  });

  it("throws for API mode without api config", () => {
    const config = makeConfig({
      instances: {
        broken: { mode: "api" },
      },
      default: "broken",
    });
    const registry = new TransportRegistry(config);
    expect(() => registry.getTransport()).toThrow("API mode requires 'api' configuration");
  });

  it("returns OIDC config for instance", () => {
    const config = makeConfig();
    config.instances.prod.oidc = {
      issuer: "https://auth.example.com",
      clientId: "client",
      redirectUri: "http://localhost/cb",
      scope: "openid",
    };
    const registry = new TransportRegistry(config);
    expect(registry.getOidcConfig("prod")?.issuer).toBe("https://auth.example.com");
  });

  it("returns undefined OIDC config when not configured", () => {
    const registry = new TransportRegistry(makeConfig());
    expect(registry.getOidcConfig("prod")).toBeUndefined();
  });

  it("throws for unknown instance in getOidcConfig", () => {
    const registry = new TransportRegistry(makeConfig());
    expect(() => registry.getOidcConfig("nope")).toThrow("Unknown instance 'nope'");
  });

  it("lists all instances", () => {
    const registry = new TransportRegistry(makeConfig());
    const list = registry.listInstances();
    expect(list).toEqual([
      { name: "prod", mode: "api", isDefault: true, hasManager: false },
      { name: "staging", mode: "ssh", isDefault: false, hasManager: false },
    ]);
  });
});
