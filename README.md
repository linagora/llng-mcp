# llng-mcp

MCP Server for Lemonldap-NG

A Model Context Protocol (MCP) server that enables AI assistants to manage and monitor Lemonldap-NG web SSO instances. Supports both local SSH/CLI mode and remote REST API mode for comprehensive access control and session management.

## Overview

llng-mcp bridges AI assistants with Lemonldap-NG, a powerful web SSO (Single Sign-On) system. Through 42 tools and 1 resource, it provides AI-native access to configuration management, session control, multi-factor authentication, OIDC testing, and user consent tracking.

## Features

### Configuration Tools (11 tools)

- **llng_config_info** - Retrieve current configuration metadata (number, author, date, log)
- **llng_config_get** - Fetch configuration values by key
- **llng_config_set** - Update configuration values with optional change log
- **llng_config_addKey** - Add subkeys to composite configuration parameters
- **llng_config_delKey** - Remove subkeys from composite configuration parameters
- **llng_config_export** - Export entire configuration as JSON
- **llng_config_import** - Replace configuration from JSON backup
- **llng_config_merge** - Merge JSON snippet into current configuration
- **llng_config_rollback** - Revert to previous configuration version
- **llng_config_update_cache** - Force cache refresh on LLNG nodes
- **llng_config_test_email** - Send a test email to verify SMTP settings

### Session Management Tools (6 tools)

- **llng_session_get** - Retrieve session data by ID (supports `backend`, `persistent`, `hash`, `refreshTokens` options)
- **llng_session_search** - Search sessions with filters (supports `where`, `select`, `backend`, `count`, `kind`, `persistent`, `hash`, `idOnly`, `refreshTokens`)
- **llng_session_delete** - Terminate user sessions (supports `where` filter for bulk deletion, `kind`, `backend`, `persistent`, `hash`, `refreshTokens`)
- **llng_session_setKey** - Modify session attributes (supports `backend`, `persistent`, `hash`, `refreshTokens` options)
- **llng_session_delKey** - Remove session attributes (supports `backend`, `persistent`, `hash`, `refreshTokens` options)
- **llng_session_backup** - Export all sessions as JSON backup (supports `backend`, `persistent`, `refreshTokens` options)

### Two-Factor Authentication Tools (3 tools)

- **llng_2fa_list** - List user's registered 2FA devices
- **llng_2fa_delete** - Remove specific 2FA devices
- **llng_2fa_delType** - Remove all devices of a given type (TOTP, U2F, etc.)

### User Consent Tools (2 tools)

- **llng_consent_list** - List user's OIDC provider consents
- **llng_consent_delete** - Revoke OIDC provider consents

### OIDC Relying Party Management Tools (4 tools)

- **llng_oidc_rp_list** - List configured OIDC Relying Parties with clientID and displayName
- **llng_oidc_rp_get** - Get full details of an OIDC RP by confKey
- **llng_oidc_rp_add** - Add a new OIDC Relying Party (clientId, redirectUris, exportedVars, etc.)
- **llng_oidc_rp_delete** - Delete an OIDC Relying Party by confKey

### CLI Utility Tools (7 tools)

- **llng_download_saml_metadata** - Download SAML metadata from a remote IdP
- **llng_import_metadata** - Import a SAML federation into LLNG config
- **llng_delete_session** - Delete user sessions by UID pattern
- **llng_user_attributes** - Look up user attributes
- **llng_purge_central_cache** - Purge expired sessions from central cache
- **llng_purge_local_cache** - Purge local handler cache
- **llng_rotate_oidc_keys** - Rotate OIDC signing keys

### OIDC Testing Tools (8 tools)

- **llng_oidc_metadata** - Fetch OIDC provider discovery metadata
- **llng_oidc_authorize** - Generate authorization URL with PKCE flow
- **llng_oidc_tokens** - Exchange authorization code for access/refresh tokens
- **llng_oidc_userinfo** - Retrieve authenticated user information
- **llng_oidc_introspect** - Validate and inspect access tokens
- **llng_oidc_refresh** - Refresh expired access tokens
- **llng_oidc_whoami** - Decode ID token to display user identity
- **llng_oidc_check_auth** - Test authentication status of protected resources

### Documentation Resource (1 resource)

- **llng-documentation** - Fetch live documentation pages from lemonldap-ng.org

### Instance Discovery (1 tool)

- **llng_instances** - List available LLNG instances and their transport mode

## Installation

Requires Node.js 20 or higher.

```bash
npm install llng-mcp
npm run build
```

## Configuration

The MCP server reads configuration from `~/.llng-mcp.json` with support for environment variable overrides. Two operation modes are available.

### SSH/CLI Mode (Default)

Execute commands via SSH or locally using Lemonldap-NG CLI tools.

```json
{
  "mode": "ssh",
  "ssh": {
    "binPrefix": "/usr/share/lemonldap-ng/bin"
  }
}
```

For remote SSH connections:

```json
{
  "mode": "ssh",
  "ssh": {
    "host": "llng.example.com",
    "user": "root",
    "port": 22,
    "sudo": "root",
    "binPrefix": "/usr/share/lemonldap-ng/bin"
  }
}
```

#### `remoteCommand` - Execute via Docker, LXC, etc.

The `remoteCommand` field inserts a command between SSH/sudo and the LLNG CLI binary. This allows running commands inside containers or through other wrappers:

```json
{
  "mode": "ssh",
  "ssh": {
    "host": "server.example.com",
    "remoteCommand": "docker exec sso-auth-1",
    "binPrefix": "/usr/share/lemonldap-ng/bin"
  }
}
```

This produces: `ssh server.example.com docker exec sso-auth-1 /usr/share/lemonldap-ng/bin/lemonldap-ng-cli ...`

#### `binPrefix` - Custom binary location

The `binPrefix` field (default: `/usr/share/lemonldap-ng/bin`) sets the base directory for all LLNG CLI tools. Individual paths (`cliPath`, `sessionsPath`, `configEditorPath`) can still override specific binaries.

**SSH Mode Limitations**: The following operations require API mode:

- `llng_2fa_list` - List 2FA devices
- `llng_2fa_delete` - Remove 2FA devices
- `llng_2fa_delType` - Remove all devices of type
- `llng_consent_list` - List user consents
- `llng_consent_delete` - Revoke consents

### API Mode

Call REST endpoints on LLNG manager with optional HTTP Basic authentication.

```json
{
  "mode": "api",
  "api": {
    "baseUrl": "https://manager.example.com/api/v1",
    "basicAuth": {
      "username": "admin",
      "password": "secret"
    },
    "verifySsl": true
  }
}
```

### Kubernetes Mode

Execute commands inside Kubernetes pods using `kubectl exec`. The server automatically resolves a pod from a Deployment using label selectors.

```json
{
  "mode": "k8s",
  "k8s": {
    "context": "prod-cluster",
    "namespace": "auth",
    "deployment": "lemonldap-ng",
    "container": "sso"
  }
}
```

- **`context`** (optional) - kubectl context to use
- **`namespace`** (required) - Kubernetes namespace
- **`deployment`** (required) - Deployment name (used to derive the default pod selector `app.kubernetes.io/name=DEPLOYMENT`)
- **`container`** (optional) - Container name within the pod (omit if single container)
- **`podSelector`** (optional) - Override the label selector for pod resolution (default: `app.kubernetes.io/name=DEPLOYMENT`)
- **`binPrefix`** (optional) - Path to LLNG binaries inside the pod (default: `/usr/share/lemonldap-ng/bin`)

K8s mode has the same limitations as SSH mode (2FA and consents require API mode).

### OIDC Configuration (Optional)

For OIDC testing tools:

```json
{
  "oidc": {
    "issuer": "https://auth.example.com",
    "clientId": "my-app",
    "clientSecret": "secret",
    "redirectUri": "http://localhost:8080/callback",
    "scope": "openid profile email"
  }
}
```

### Multi-Instance Configuration

To manage multiple LLNG instances from a single MCP server, use the `instances` format:

```json
{
  "instances": {
    "prod": {
      "mode": "api",
      "api": {
        "baseUrl": "https://manager-prod.example.com/api/v1",
        "basicAuth": { "username": "admin", "password": "secret" }
      }
    },
    "staging": {
      "mode": "ssh",
      "ssh": {
        "host": "staging.example.com",
        "user": "root"
      }
    },
    "local": {
      "mode": "ssh"
    }
  },
  "default": "prod"
}
```

- **`instances`** - Named LLNG instance configurations, each with its own `mode`, `ssh`, `api`, and `oidc` settings
- **`default`** - Name of the instance used when the `instance` parameter is omitted (defaults to the first instance if not specified)
- All tools accept an optional **`instance`** parameter to target a specific instance
- The legacy flat format (without `instances`) is fully supported and treated as a single "default" instance
- Environment variables (`LLNG_*`) apply to the default instance only

### Environment Variables

Configuration can be overridden via environment variables:

**Mode**

- `LLNG_MODE` - Set to "ssh" or "api"

**SSH Configuration**

- `LLNG_SSH_HOST` - Hostname for SSH connection
- `LLNG_SSH_USER` - SSH username
- `LLNG_SSH_PORT` - SSH port (default: 22)
- `LLNG_SSH_SUDO` - User to sudo to
- `LLNG_SSH_REMOTE_COMMAND` - Command inserted between SSH/sudo and LLNG binaries (e.g., `docker exec container-name`)
- `LLNG_SSH_BIN_PREFIX` - Base directory for LLNG CLI tools (default: `/usr/share/lemonldap-ng/bin`)
- `LLNG_SSH_CLI_PATH` - Path to lemonldap-ng-cli (overrides binPrefix)
- `LLNG_SSH_SESSIONS_PATH` - Path to lemonldap-ng-sessions (overrides binPrefix)
- `LLNG_SSH_CONFIG_EDITOR_PATH` - Path to lmConfigEditor (overrides binPrefix)

**Kubernetes Configuration**

- `LLNG_K8S_CONTEXT` - kubectl context
- `LLNG_K8S_NAMESPACE` - Kubernetes namespace
- `LLNG_K8S_DEPLOYMENT` - Deployment name
- `LLNG_K8S_CONTAINER` - Container name (optional)
- `LLNG_K8S_POD_SELECTOR` - Label selector override
- `LLNG_K8S_BIN_PREFIX` - Path to LLNG binaries inside the pod

**API Configuration**

- `LLNG_API_URL` - API base URL
- `LLNG_API_BASIC_USER` - HTTP Basic Auth username
- `LLNG_API_BASIC_PASSWORD` - HTTP Basic Auth password
- `LLNG_API_VERIFY_SSL` - Set to "false" to skip SSL verification

**OIDC Configuration**

- `LLNG_OIDC_ISSUER` - OIDC issuer URL
- `LLNG_OIDC_CLIENT_ID` - OIDC client ID
- `LLNG_OIDC_CLIENT_SECRET` - OIDC client secret
- `LLNG_OIDC_REDIRECT_URI` - OIDC redirect URI
- `LLNG_OIDC_SCOPE` - OIDC scopes

> **Note**: When using multi-instance configuration, environment variables override the **default instance** only.

## Usage with Claude Desktop

Add this to your Claude Desktop configuration (`~/.claude/desktop_config.json`):

```json
{
  "mcpServers": {
    "llng": {
      "command": "node",
      "args": ["/path/to/llng-mcp/dist/index.js"]
    }
  }
}
```

If you have configuration in `~/.llng-mcp.json`, it will be automatically loaded. You can also override via environment variables:

```json
{
  "mcpServers": {
    "llng": {
      "command": "node",
      "args": ["/path/to/llng-mcp/dist/index.js"],
      "env": {
        "LLNG_MODE": "api",
        "LLNG_API_URL": "https://manager.example.com/api/v1"
      }
    }
  }
}
```

## Usage with Other MCP Clients

### Inspect Tool with npx

Test the server using the official MCP inspector:

```bash
npx @modelcontextprotocol/inspector node dist/index.js
```

This opens an interactive inspector where you can call tools and see results.

### Configuration

Configure your MCP client to connect to the stdio server. For example, with `cline`:

```json
{
  "mcpServers": {
    "llng": {
      "command": "node",
      "args": ["/absolute/path/to/llng-mcp/dist/index.js"]
    }
  }
}
```

## Tools Reference

> **Note**: All tools accept an optional `instance` parameter (string) to target a specific LLNG instance. When omitted, the default instance is used.

### Configuration Management

| Tool                     | Description          | Parameters                  | Mode    |
| ------------------------ | -------------------- | --------------------------- | ------- |
| llng_config_info         | Get config metadata  | None                        | Both    |
| llng_config_get          | Fetch config values  | keys (string[])             | Both    |
| llng_config_set          | Update config values | keys (object), log (string) | Both    |
| llng_config_addKey       | Add composite key    | key, subkey, value          | Both    |
| llng_config_delKey       | Delete composite key | key, subkey                 | Both    |
| llng_config_export       | Export as JSON       | None                        | Both    |
| llng_config_import       | Import from JSON     | json (string)               | Both    |
| llng_config_merge        | Merge JSON           | json (string)               | Both    |
| llng_config_rollback     | Revert previous      | None                        | Both    |
| llng_config_update_cache | Force cache refresh  | None                        | Both    |
| llng_config_test_email   | Send test email      | destination (string)        | SSH/K8s |

### Session Management

| Tool                | Description       | Parameters                                                                   | Mode |
| ------------------- | ----------------- | ---------------------------------------------------------------------------- | ---- |
| llng_session_get    | Get session       | id, backend, persistent, hash, refreshTokens                                 | Both |
| llng_session_search | Search sessions   | where, select, backend, count, kind, persistent, hash, idOnly, refreshTokens | Both |
| llng_session_delete | Delete sessions   | ids (optional), where, kind, backend, persistent, hash, refreshTokens        | Both |
| llng_session_setKey | Modify session    | id, keys, backend, persistent, hash, refreshTokens                           | Both |
| llng_session_delKey | Remove attributes | id, keys, backend, persistent, hash, refreshTokens                           | Both |
| llng_session_backup | Export sessions   | backend, persistent, refreshTokens                                           | Both |

### Two-Factor Authentication

| Tool             | Description    | Parameters           | Mode     |
| ---------------- | -------------- | -------------------- | -------- |
| llng_2fa_list    | List devices   | user (string)        | API Only |
| llng_2fa_delete  | Remove devices | user, ids (string[]) | API Only |
| llng_2fa_delType | Remove by type | user, type (string)  | API Only |

### User Consents

| Tool                | Description     | Parameters           | Mode     |
| ------------------- | --------------- | -------------------- | -------- |
| llng_consent_list   | List consents   | user (string)        | API Only |
| llng_consent_delete | Revoke consents | user, ids (string[]) | API Only |

### Instance Discovery

| Tool           | Description              | Parameters | Mode |
| -------------- | ------------------------ | ---------- | ---- |
| llng_instances | List available instances | None       | Both |

### OIDC Relying Party Management

| Tool                | Description    | Parameters                                                                                     | Mode |
| ------------------- | -------------- | ---------------------------------------------------------------------------------------------- | ---- |
| llng_oidc_rp_list   | List OIDC RPs  | None                                                                                           | Both |
| llng_oidc_rp_get    | Get RP details | confKey                                                                                        | Both |
| llng_oidc_rp_add    | Add new RP     | confKey, clientId, redirectUris, clientSecret, displayName, exportedVars, extraClaims, options | Both |
| llng_oidc_rp_delete | Delete RP      | confKey                                                                                        | Both |

### CLI Utilities

| Tool                        | Description              | Parameters                                                              | Mode    |
| --------------------------- | ------------------------ | ----------------------------------------------------------------------- | ------- |
| llng_download_saml_metadata | Download SAML metadata   | url, outputFile, noCheck, verbose                                       | SSH/K8s |
| llng_import_metadata        | Import SAML federation   | url, spPrefix, idpPrefix, ignoreSp, ignoreIdp, remove, noCheck, verbose | SSH/K8s |
| llng_delete_session         | Delete sessions by UID   | uid, force, debug                                                       | SSH/K8s |
| llng_user_attributes        | Look up user attributes  | username, field                                                         | SSH/K8s |
| llng_purge_central_cache    | Purge central cache      | debug, force, json                                                      | SSH/K8s |
| llng_purge_local_cache      | Purge local cache        | debug                                                                   | SSH/K8s |
| llng_rotate_oidc_keys       | Rotate OIDC signing keys | debug                                                                   | SSH/K8s |

### OIDC Testing

| Tool                 | Description     | Parameters             | Requires Config |
| -------------------- | --------------- | ---------------------- | --------------- |
| llng_oidc_metadata   | Fetch discovery | None                   | OIDC config     |
| llng_oidc_authorize  | Get auth URL    | scope (optional)       | OIDC config     |
| llng_oidc_tokens     | Exchange code   | code, code_verifier    | OIDC config     |
| llng_oidc_userinfo   | Get user info   | access_token (string)  | OIDC config     |
| llng_oidc_introspect | Inspect token   | token (string)         | OIDC config     |
| llng_oidc_refresh    | Refresh token   | refresh_token (string) | OIDC config     |
| llng_oidc_whoami     | Decode ID token | id_token (string)      | OIDC config     |
| llng_oidc_check_auth | Test protected  | url, access_token      | OIDC config     |

## Development

### Build

```bash
npm run build
```

### Watch Mode

```bash
npm run dev
```

### Unit Tests

```bash
npm test
```

### Integration Tests

Requires Docker Compose for running Lemonldap-NG instance:

```bash
npm run test:integration
```

The test stack includes a full Lemonldap-NG instance accessible at `http://localhost:19876`.

View test configuration in `docker-compose.test.yml`.

## Architecture

llng-mcp uses an abstraction layer (`ILlngTransport`) with two implementations:

- **SshTransport** - Executes CLI commands via SSH or locally using child_process
- **K8sTransport** - Executes CLI commands inside Kubernetes pods via kubectl exec
- **ApiTransport** - Makes HTTP requests to LLNG REST API

A `TransportRegistry` manages transport instances per named configuration, enabling multi-instance support. All tools resolve their transport through the registry, allowing seamless switching between modes and instances.

## Limitations

### SSH Mode

2FA management and user consent operations require the REST API. The CLI tools (`lemonldap-ng-cli` and `lemonldap-ng-sessions`) provide read-only or delete-only capabilities for these features.

### API Mode

Ensure the LLNG manager is properly configured with REST endpoints enabled and authentication credentials provided.

### OIDC Tools

OIDC testing tools are optional. Omit OIDC configuration if not needed.

## License

AGPL-3.0

Copyright: 2026 [LINAGORA](https://linagora.com)

See the [Lemonldap-NG project](https://lemonldap-ng.org/) for more information.
