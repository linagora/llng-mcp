import {
  ILlngTransport,
  ConfigInfo,
  SessionFilter,
  SessionGetOptions,
  SessionDeleteOptions,
} from "./interface.js";
import { ApiConfig } from "../config.js";
import https from "https";

export class ApiTransport implements ILlngTransport {
  private baseUrl: string;
  private basicAuth?: { username: string; password: string };
  private verifySsl: boolean;
  private agent?: https.Agent;

  constructor(config: ApiConfig) {
    // Strip trailing slash
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.basicAuth = config.basicAuth;
    this.verifySsl = config.verifySsl !== false;

    // Create agent for SSL verification control
    if (!this.verifySsl) {
      console.error(
        "WARNING: SSL certificate verification is disabled. This makes the connection vulnerable to man-in-the-middle attacks. Do not use in production.",
      );
      this.agent = new https.Agent({
        rejectUnauthorized: false,
      });
    }
  }

  private async request(method: string, path: string, body?: any): Promise<any> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };

    // Add Basic Auth if configured
    if (this.basicAuth) {
      const credentials = Buffer.from(
        `${this.basicAuth.username}:${this.basicAuth.password}`,
      ).toString("base64");
      headers["Authorization"] = `Basic ${credentials}`;
    }

    const options: RequestInit = {
      method,
      headers,
      // @ts-expect-error - agent is valid for https URLs
      agent: this.agent,
    };

    if (body && method !== "GET") {
      options.body = JSON.stringify(body);
    }

    try {
      const response = await fetch(url, options);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText}`);
      }

      // Handle empty responses
      const contentType = response.headers.get("content-type");
      if (contentType && contentType.includes("application/json")) {
        return await response.json();
      } else {
        const text = await response.text();
        if (!text) {
          return {};
        }
        try {
          return JSON.parse(text);
        } catch {
          return text;
        }
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`API request failed: ${error.message}`);
      }
      throw error;
    }
  }

  async configInfo(): Promise<ConfigInfo> {
    const data = await this.request("GET", "/api/v1/config/latest");
    return {
      cfgNum: data.cfgNum,
      cfgAuthor: data.cfgAuthor,
      cfgDate: data.cfgDate,
      cfgLog: data.cfgLog,
    };
  }

  async configGet(keys: string[]): Promise<Record<string, any>> {
    const config = await this.request("GET", "/api/v1/config/latest");
    const result: Record<string, any> = {};

    for (const key of keys) {
      if (key in config) {
        result[key] = config[key];
      }
    }

    return result;
  }

  async configSet(pairs: Record<string, any>, log?: string): Promise<void> {
    // Get current config
    const currentConfig = await this.request("GET", "/api/v1/config/latest");

    // Merge changes
    const updatedConfig = { ...currentConfig, ...pairs };

    // Add log if provided
    if (log) {
      updatedConfig.cfgLog = log;
    }

    // Save config
    await this.request("PUT", "/api/v1/config", updatedConfig);
  }

  async configAddKey(key: string, subkey: string, value: string): Promise<void> {
    // Get current config
    const config = await this.request("GET", "/api/v1/config/latest");

    // Initialize the key if it doesn't exist
    if (!config[key]) {
      config[key] = {};
    }

    // Add the subkey
    config[key][subkey] = value;

    // Save config
    await this.request("PUT", "/api/v1/config", config);
  }

  async configDelKey(key: string, subkey: string): Promise<void> {
    // Get current config
    const config = await this.request("GET", "/api/v1/config/latest");

    // Remove the subkey if it exists
    if (config[key] && subkey in config[key]) {
      delete config[key][subkey];

      // Save config
      await this.request("PUT", "/api/v1/config", config);
    }
  }

  async configSave(): Promise<string> {
    const config = await this.request("GET", "/api/v1/config/latest");
    return JSON.stringify(config, null, 2);
  }

  async configRestore(json: string): Promise<void> {
    const config = JSON.parse(json);
    await this.request("PUT", "/api/v1/config", config);
  }

  async configMerge(json: string): Promise<void> {
    const snippet = JSON.parse(json);
    const currentConfig = await this.request("GET", "/api/v1/config/latest");

    // Deep merge
    const merged = this.deepMerge(currentConfig, snippet);

    await this.request("PUT", "/api/v1/config", merged);
  }

  private deepMerge(target: any, source: any): any {
    const result = { ...target };

    for (const key in source) {
      if (key === "__proto__" || key === "constructor" || key === "prototype") continue;
      const value = source[key];
      if (value !== null && value instanceof Object && !Array.isArray(value)) {
        result[key] = this.deepMerge(result[key] || {}, value);
      } else {
        result[key] = value;
      }
    }

    return result;
  }

  async configRollback(): Promise<void> {
    // Get current config to find cfgNum
    const current = await this.request("GET", "/api/v1/config/latest");
    const currentNum = current.cfgNum;

    if (currentNum <= 1) {
      throw new Error("Cannot rollback: already at first config");
    }

    // Get previous config
    const previous = await this.request("GET", `/api/v1/config/${currentNum - 1}`);

    // Save it as the new current config
    await this.request("PUT", "/api/v1/config", previous);
  }

  async configUpdateCache(): Promise<void> {
    // No-op for API mode - cache is managed server-side
  }

  async configTestEmail(_destination: string): Promise<void> {
    throw new Error("configTestEmail is not supported via API. Use SSH or K8s mode.");
  }

  private resolveBackend(options?: SessionGetOptions): string {
    if (options?.persistent) return "persistent";
    if (options?.refreshTokens) return "oidc";
    return options?.backend || "global";
  }

  async sessionGet(id: string, options?: SessionGetOptions): Promise<Record<string, any>> {
    const backendName = this.resolveBackend(options);
    // hash option is not supported via API
    return await this.request(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(backendName)}/${encodeURIComponent(id)}`,
    );
  }

  async sessionSearch(filters: SessionFilter): Promise<any[]> {
    let backend = filters.backend || "global";
    if (filters.persistent) {
      backend = "persistent";
    }
    const queryParams: string[] = [];

    // Handle refreshTokens: use backend="oidc" and add _type filter
    if (filters.refreshTokens) {
      backend = "oidc";
      const whereClause = filters.where
        ? { ...filters.where, _type: "refresh_token" }
        : { _type: "refresh_token" };
      const whereClauses = Object.entries(whereClause).map(([field, value]) => `${field}=${value}`);
      queryParams.push(`where=${encodeURIComponent(whereClauses.join(" AND "))}`);
    } else if (filters.where) {
      // Build where clause
      const whereClauses = Object.entries(filters.where).map(
        ([field, value]) => `${field}=${value}`,
      );
      queryParams.push(`where=${encodeURIComponent(whereClauses.join(" AND "))}`);
    }

    // Handle idOnly: select only _session_id
    if (filters.idOnly) {
      queryParams.push("select=_session_id");
    } else if (filters.select && filters.select.length > 0) {
      queryParams.push(`select=${filters.select.join(",")}`);
    }

    // Build count flag
    if (filters.count) {
      queryParams.push("count=1");
    }

    const queryString = queryParams.length > 0 ? `?${queryParams.join("&")}` : "";
    const result = await this.request(
      "GET",
      `/api/v1/sessions/${encodeURIComponent(backend)}${queryString}`,
    );

    // API returns an object with session IDs as keys, convert to array
    if (typeof result === "object" && !Array.isArray(result)) {
      if (filters.idOnly) {
        return Object.keys(result);
      }
      return Object.entries(result).map(([id, data]) => ({
        id,
        ...(data as object),
      }));
    }

    return result;
  }

  async sessionDelete(ids: string[], options?: SessionDeleteOptions): Promise<void> {
    const backendName = this.resolveBackend(options);

    if (options?.where) {
      // Where-based deletion: search first, then delete matching
      const searchFilters: SessionFilter = {
        where: options.where,
        backend: backendName,
        idOnly: true,
        refreshTokens: options.refreshTokens,
        persistent: options.persistent,
      };
      const matchingIds = await this.sessionSearch(searchFilters);
      for (const id of matchingIds) {
        const sessionId = typeof id === "string" ? id : id.id || id._session_id;
        if (sessionId) {
          await this.request(
            "DELETE",
            `/api/v1/sessions/${encodeURIComponent(backendName)}/${encodeURIComponent(sessionId)}`,
          );
        }
      }
    } else {
      for (const id of ids) {
        await this.request(
          "DELETE",
          `/api/v1/sessions/${encodeURIComponent(backendName)}/${encodeURIComponent(id)}`,
        );
      }
    }
  }

  async sessionSetKey(
    id: string,
    pairs: Record<string, any>,
    options?: SessionGetOptions,
  ): Promise<void> {
    const backendName = this.resolveBackend(options);
    await this.request(
      "PUT",
      `/api/v1/sessions/${encodeURIComponent(backendName)}/${encodeURIComponent(id)}`,
      pairs,
    );
  }

  async sessionDelKey(id: string, keys: string[], options?: SessionGetOptions): Promise<void> {
    const backendName = this.resolveBackend(options);
    const pairs: Record<string, null> = {};
    for (const key of keys) {
      pairs[key] = null;
    }
    await this.request(
      "PUT",
      `/api/v1/sessions/${encodeURIComponent(backendName)}/${encodeURIComponent(id)}`,
      pairs,
    );
  }

  async sessionBackup(
    backend?: string,
    refreshTokens?: boolean,
    persistent?: boolean,
  ): Promise<string> {
    let backendName = backend || "global";
    if (persistent) {
      backendName = "persistent";
    }
    let path = `/api/v1/sessions/${encodeURIComponent(backendName)}`;

    if (refreshTokens) {
      backendName = "oidc";
      path = `/api/v1/sessions/${encodeURIComponent(backendName)}?where=${encodeURIComponent("_type=refresh_token")}`;
    }

    const sessions = await this.request("GET", path);
    return JSON.stringify(sessions, null, 2);
  }

  async secondFactorsGet(user: string): Promise<any[]> {
    const result = await this.request("GET", `/api/v1/secondfactors/${encodeURIComponent(user)}`);

    // API may return object or array, normalize to array
    if (Array.isArray(result)) {
      return result;
    } else if (typeof result === "object") {
      return Object.entries(result).map(([id, data]) => ({
        id,
        ...(data as object),
      }));
    }

    return [];
  }

  async secondFactorsDelete(user: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.request(
        "DELETE",
        `/api/v1/secondfactors/${encodeURIComponent(user)}/${encodeURIComponent(id)}`,
      );
    }
  }

  async secondFactorsDelType(user: string, type: string): Promise<void> {
    // Get all 2FA devices
    const devices = await this.secondFactorsGet(user);

    // Filter by type and delete
    const toDelete = devices.filter((device: any) => device.type === type);
    const ids = toDelete.map((device: any) => device.id);

    await this.secondFactorsDelete(user, ids);
  }

  async consentsGet(user: string): Promise<any[]> {
    const result = await this.request("GET", `/api/v1/consents/${encodeURIComponent(user)}`);

    // API may return object or array, normalize to array
    if (Array.isArray(result)) {
      return result;
    } else if (typeof result === "object") {
      return Object.entries(result).map(([id, data]) => ({
        id,
        ...(data as object),
      }));
    }

    return [];
  }

  async consentsDelete(user: string, ids: string[]): Promise<void> {
    for (const id of ids) {
      await this.request(
        "DELETE",
        `/api/v1/consents/${encodeURIComponent(user)}/${encodeURIComponent(id)}`,
      );
    }
  }

  async execScript(): Promise<string> {
    throw new Error("execScript is not supported via API. Use SSH or K8s mode.");
  }
}
