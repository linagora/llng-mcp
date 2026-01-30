import { LlngMultiConfig, LlngInstanceConfig, LlngConfig, OidcConfig } from "../config.js";
import { ILlngTransport } from "./interface.js";
import { ApiTransport } from "./api.js";
import { SshTransport } from "./ssh.js";
import { K8sTransport } from "./k8s.js";

export type TransportRole = "portal" | "manager";

interface TransportEntry {
  portal: ILlngTransport;
  manager?: ILlngTransport;
  managerResolved?: boolean;
}

export class TransportRegistry {
  private transports = new Map<string, TransportEntry>();
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

  private buildTransport(config: LlngConfig): ILlngTransport {
    if (config.mode === "api") {
      if (!config.api) {
        throw new Error(`API mode requires 'api' configuration`);
      }
      return new ApiTransport(config.api);
    } else if (config.mode === "k8s") {
      if (!config.k8s) {
        throw new Error(`K8s mode requires 'k8s' configuration`);
      }
      return new K8sTransport(config.k8s);
    } else {
      return new SshTransport(config.ssh ?? {});
    }
  }

  private buildManagerConfig(config: LlngInstanceConfig): LlngConfig | undefined {
    if (!config.manager) return undefined;
    const m = config.manager;
    const merged: LlngConfig = {
      mode: m.mode ?? config.mode,
    };
    // Deep merge ssh: parent ssh + manager ssh overrides
    if (config.mode === "ssh" || merged.mode === "ssh") {
      merged.ssh = { ...config.ssh, ...m.ssh };
    }
    if (m.api) merged.api = m.api;
    else if (config.api && merged.mode === "api") merged.api = config.api;
    if (m.k8s) merged.k8s = m.k8s;
    else if (config.k8s && merged.mode === "k8s") merged.k8s = config.k8s;
    return merged;
  }

  getTransport(instance?: string, role?: TransportRole): ILlngTransport {
    const { name, config } = this.resolveInstance(instance);

    let entry = this.transports.get(name);
    if (!entry) {
      const portal = this.buildTransport(config);
      entry = { portal };
      this.transports.set(name, entry);
    }

    if (role === "manager") {
      if (!entry.managerResolved) {
        const managerConfig = this.buildManagerConfig(config);
        entry.manager = managerConfig ? this.buildTransport(managerConfig) : undefined;
        entry.managerResolved = true;
      }
      if (entry.manager) {
        return entry.manager;
      }
    }
    return entry.portal;
  }

  getOidcConfig(instance?: string): OidcConfig | undefined {
    const { config } = this.resolveInstance(instance);
    return config.oidc;
  }

  listInstances(): { name: string; mode: string; isDefault: boolean; hasManager: boolean }[] {
    return Object.entries(this.configs).map(([name, config]) => ({
      name,
      mode: config.mode,
      isDefault: name === this.defaultInstance,
      hasManager: !!config.manager,
    }));
  }
}
