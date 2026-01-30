import { LlngMultiConfig, LlngInstanceConfig, OidcConfig } from "../config.js";
import { ILlngTransport } from "./interface.js";
import { ApiTransport } from "./api.js";
import { SshTransport } from "./ssh.js";
import { K8sTransport } from "./k8s.js";

export class TransportRegistry {
  private transports = new Map<string, ILlngTransport>();
  private configs: Record<string, LlngInstanceConfig>;
  private defaultInstance: string;

  constructor(multiConfig: LlngMultiConfig) {
    this.configs = multiConfig.instances;
    this.defaultInstance = multiConfig.default;
  }

  private resolveInstance(instance?: string): { name: string; config: LlngInstanceConfig } {
    const name = instance || this.defaultInstance;
    const config = this.configs[name];
    if (!config) {
      throw new Error(
        `Unknown instance '${name}'. Available instances: ${Object.keys(this.configs).join(", ")}`,
      );
    }
    return { name, config };
  }

  getTransport(instance?: string): ILlngTransport {
    const { name, config } = this.resolveInstance(instance);

    let transport = this.transports.get(name);
    if (!transport) {
      if (config.mode === "api") {
        if (!config.api) {
          throw new Error(
            `Instance '${name}' is configured for API mode but has no 'api' configuration`,
          );
        }
        transport = new ApiTransport(config.api);
      } else if (config.mode === "k8s") {
        if (!config.k8s) {
          throw new Error(
            `Instance '${name}' is configured for K8s mode but has no 'k8s' configuration`,
          );
        }
        transport = new K8sTransport(config.k8s);
      } else {
        transport = new SshTransport(config.ssh ?? {});
      }
      this.transports.set(name, transport);
    }

    return transport;
  }

  getOidcConfig(instance?: string): OidcConfig | undefined {
    const { config } = this.resolveInstance(instance);
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
