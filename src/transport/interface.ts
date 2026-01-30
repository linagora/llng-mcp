export interface SessionFilter {
  where?: Record<string, string>; // field=value pairs
  select?: string[]; // fields to return
  backend?: string; // persistent, oidc, saml, cas
  count?: boolean; // just return count
}

export interface ConfigInfo {
  cfgNum: number;
  cfgAuthor: string;
  cfgDate: string;
  cfgLog?: string;
}

export interface ILlngTransport {
  configInfo(): Promise<ConfigInfo>;
  configGet(keys: string[]): Promise<Record<string, any>>;
  configSet(pairs: Record<string, any>, log?: string): Promise<void>;
  configAddKey(key: string, subkey: string, value: string): Promise<void>;
  configDelKey(key: string, subkey: string): Promise<void>;
  configSave(): Promise<string>;
  configRestore(json: string): Promise<void>;
  configMerge(json: string): Promise<void>;
  configRollback(): Promise<void>;
  configUpdateCache(): Promise<void>;

  sessionGet(id: string, backend?: string): Promise<Record<string, any>>;
  sessionSearch(filters: SessionFilter): Promise<any[]>;
  sessionDelete(ids: string[], backend?: string): Promise<void>;
  sessionSetKey(id: string, pairs: Record<string, any>): Promise<void>;
  sessionDelKey(id: string, keys: string[]): Promise<void>;
  sessionBackup(backend?: string): Promise<string>;

  secondFactorsGet(user: string): Promise<any[]>;
  secondFactorsDelete(user: string, ids: string[]): Promise<void>;
  secondFactorsDelType(user: string, type: string): Promise<void>;

  consentsGet(user: string): Promise<any[]>;
  consentsDelete(user: string, ids: string[]): Promise<void>;
}
