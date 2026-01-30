export interface SessionGetOptions {
  backend?: string;
  refreshTokens?: boolean;
  persistent?: boolean;
  hash?: boolean;
}

export interface SessionDeleteOptions extends SessionGetOptions {
  where?: Record<string, string>;
}

export interface SessionFilter {
  where?: Record<string, string>; // field=value pairs
  select?: string[]; // fields to return
  backend?: string; // persistent, oidc, saml, cas
  count?: boolean; // just return count
  refreshTokens?: boolean; // filter for refresh token (offline) sessions only
  persistent?: boolean; // shortcut for backend=persistent
  hash?: boolean; // session ID is original cookie value
  idOnly?: boolean; // return only session IDs
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
  configTestEmail(destination: string): Promise<void>;

  sessionGet(id: string, options?: SessionGetOptions): Promise<Record<string, any>>;
  sessionSearch(filters: SessionFilter): Promise<any[]>;
  sessionDelete(ids: string[], options?: SessionDeleteOptions): Promise<void>;
  sessionSetKey(id: string, pairs: Record<string, any>, options?: SessionGetOptions): Promise<void>;
  sessionDelKey(id: string, keys: string[], options?: SessionGetOptions): Promise<void>;
  sessionBackup(backend?: string, refreshTokens?: boolean, persistent?: boolean): Promise<string>;

  secondFactorsGet(user: string): Promise<any[]>;
  secondFactorsDelete(user: string, ids: string[]): Promise<void>;
  secondFactorsDelType(user: string, type: string): Promise<void>;

  consentsGet(user: string): Promise<any[]>;
  consentsDelete(user: string, ids: string[]): Promise<void>;

  execScript(scriptName: string, args: string[]): Promise<string>;
}
