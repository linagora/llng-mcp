import { LlngMultiConfig, LlngInstanceConfig, OidcConfig } from "../config.js";
import { ILlngTransport } from "./interface.js";
import { ApiTransport } from "./api.js";
import { SshTransport } from "./ssh.js";

export class TransportRegistry {
  private transports = new Map<string, ILlngTransport>();
  private configs: Record<string, LlngInstanceConfig>;
  private defaultInstance: string;

  constructor(multiConfig: LlngMultiConfig) {
    this.configs = multiConfig.instances;
    this.defaultInstance = multiConfig.default;
  }

  getTransport(instance?: string): ILlngTransport {
    const name = instance || this.defaultInstance;
    const config = this.configs[name];
    if (!config) {
      throw new Error(
        `Unknown instance '${name}'. Available instances: ${Object.keys(this.configs).join(", ")}`,
      );
    }

    let transport = this.transports.get(name);
    if (!transport) {
      if (config.mode === "api") {
        if (!config.api) {
          throw new Error(
            `Instance '${name}' is configured for API mode but has no 'api' configuration`,
          );
        }
        transport = new ApiTransport(config.api);
      } else {
        transport = new SshTransport(
          config.ssh ?? {
            cliPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-cli",
            sessionsPath: "/usr/share/lemonldap-ng/bin/lemonldap-ng-sessions",
            configEditorPath: "/usr/share/lemonldap-ng/bin/lmConfigEditor",
          },
        );
      }
      this.transports.set(name, transport);
    }

    return transport;
  }

  getOidcConfig(instance?: string): OidcConfig | undefined {
    const name = instance || this.defaultInstance;
    const config = this.configs[name];
    if (!config) {
      throw new Error(
        `Unknown instance '${name}'. Available instances: ${Object.keys(this.configs).join(", ")}`,
      );
    }
    return config.oidc;
  }

  listInstances(): { name: string; mode: string; isDefault: boolean }[] {
    return Object.entries(this.configs).map(([name, config]) => ({
      name,
      mode: config.mode,
      isDefault: name === this.defaultInstance,
    }));
  }
}
