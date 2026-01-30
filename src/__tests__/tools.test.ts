import { describe, it, expect, vi } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerConfigTools } from "../tools/config.js";
import { registerSessionTools } from "../tools/sessions.js";
import { registerSecondFactorTools } from "../tools/secondfactors.js";
import { registerConsentTools } from "../tools/consents.js";
import { registerOidcTools } from "../tools/oidc.js";
import { registerOidcRpTools } from "../tools/oidc-rp.js";
import { registerCliUtilityTools } from "../tools/cli-utilities.js";
import { TransportRegistry } from "../transport/registry.js";

describe("Tool Registration", () => {
  function createMockServer() {
    const toolNames: string[] = [];
    const mockServer = {
      tool: vi.fn((name: string, _desc: string, _schema: any, _handler: any) => {
        toolNames.push(name);
      }),
    } as unknown as McpServer;
    return { mockServer, toolNames };
  }

  function createMockRegistry() {
    const mockTransport = {
      configInfo: vi
        .fn()
        .mockResolvedValue({ cfgNum: 1, cfgAuthor: "test", cfgDate: "2025-01-30" }),
      configGet: vi.fn().mockResolvedValue({}),
      configSet: vi.fn().mockResolvedValue(undefined),
      configAddKey: vi.fn().mockResolvedValue(undefined),
      configDelKey: vi.fn().mockResolvedValue(undefined),
      configSave: vi.fn().mockResolvedValue("{}"),
      configRestore: vi.fn().mockResolvedValue(undefined),
      configMerge: vi.fn().mockResolvedValue(undefined),
      configRollback: vi.fn().mockResolvedValue(undefined),
      configUpdateCache: vi.fn().mockResolvedValue(undefined),
      sessionGet: vi.fn().mockResolvedValue({}),
      sessionSearch: vi.fn().mockResolvedValue([]),
      sessionDelete: vi.fn().mockResolvedValue(undefined),
      sessionSetKey: vi.fn().mockResolvedValue(undefined),
      sessionDelKey: vi.fn().mockResolvedValue(undefined),
      sessionBackup: vi.fn().mockResolvedValue("{}"),
      secondFactorsGet: vi.fn().mockResolvedValue([]),
      secondFactorsDelete: vi.fn().mockResolvedValue(undefined),
      secondFactorsDelType: vi.fn().mockResolvedValue(undefined),
      consentsGet: vi.fn().mockResolvedValue([]),
      consentsDelete: vi.fn().mockResolvedValue(undefined),
      configTestEmail: vi.fn().mockResolvedValue(undefined),
      execScript: vi.fn().mockResolvedValue("script output"),
    };

    const registry = {
      getTransport: vi.fn().mockReturnValue(mockTransport),
      getOidcConfig: vi.fn().mockReturnValue({
        issuer: "https://auth.example.com",
        clientId: "test-client",
        redirectUri: "http://localhost:3000/callback",
        scope: "openid profile",
      }),
      listInstances: vi.fn().mockReturnValue([{ name: "default", mode: "ssh", isDefault: true }]),
    } as unknown as TransportRegistry;

    return { registry, mockTransport };
  }

  describe("Config Tools", () => {
    it("should register 11 config tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerConfigTools(mockServer, registry);

      expect(toolNames).toHaveLength(11);
      expect(toolNames).toEqual([
        "llng_config_info",
        "llng_config_get",
        "llng_config_set",
        "llng_config_addKey",
        "llng_config_delKey",
        "llng_config_export",
        "llng_config_import",
        "llng_config_merge",
        "llng_config_rollback",
        "llng_config_update_cache",
        "llng_config_test_email",
      ]);
    });

    it("should handle transport errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      // Override one method to throw
      mockTransport.configInfo = vi.fn().mockRejectedValue(new Error("Connection failed"));

      registerConfigTools(mockServer, registry);

      // Get the handler from the mock
      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_info",
      );
      expect(toolCall).toBeDefined();

      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Connection failed");
    });

    it("should successfully call transport methods", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      const expectedInfo = {
        cfgNum: 5,
        cfgAuthor: "admin",
        cfgDate: 1234567890,
        cfgLog: "Test update",
      };

      mockTransport.configInfo = vi.fn().mockResolvedValue(expectedInfo);

      registerConfigTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_info",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe(JSON.stringify(expectedInfo, null, 2));
      expect(mockTransport.configInfo).toHaveBeenCalled();
    });
  });

  describe("Session Tools", () => {
    it("should register 6 session tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerSessionTools(mockServer, registry);

      expect(toolNames).toHaveLength(6);
      expect(toolNames).toEqual([
        "llng_session_get",
        "llng_session_search",
        "llng_session_delete",
        "llng_session_setKey",
        "llng_session_delKey",
        "llng_session_backup",
      ]);
    });

    it("should handle transport errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.sessionGet = vi.fn().mockRejectedValue(new Error("Session not found"));

      registerSessionTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_get",
      );
      const handler = toolCall[3];
      const result = await handler({ id: "session123" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Session not found");
    });

    it("should pass correct parameters to transport", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      const sessionData = { _session_id: "session123", uid: "user1" };
      mockTransport.sessionGet = vi.fn().mockResolvedValue(sessionData);

      registerSessionTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_get",
      );
      const handler = toolCall[3];
      const result = await handler({ id: "session123", backend: "oidc" });

      expect(mockTransport.sessionGet).toHaveBeenCalledWith("session123", {
        backend: "oidc",
        refreshTokens: undefined,
        persistent: undefined,
        hash: undefined,
      });
      expect(result.content[0].text).toBe(JSON.stringify(sessionData, null, 2));
    });
  });

  describe("2FA Tools", () => {
    it("should register 3 second factor tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerSecondFactorTools(mockServer, registry);

      expect(toolNames).toHaveLength(3);
      expect(toolNames).toEqual(["llng_2fa_list", "llng_2fa_delete", "llng_2fa_delType"]);
    });

    it("should handle transport errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.secondFactorsGet = vi.fn().mockRejectedValue(new Error("User not found"));

      registerSecondFactorTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_2fa_list",
      );
      const handler = toolCall[3];
      const result = await handler({ user: "john" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("User not found");
    });

    it("should return device list", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      const devices = [
        { id: "1", type: "TOTP", name: "Authenticator" },
        { id: "2", type: "U2F", name: "Security Key" },
      ];
      mockTransport.secondFactorsGet = vi.fn().mockResolvedValue(devices);

      registerSecondFactorTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_2fa_list",
      );
      const handler = toolCall[3];
      const result = await handler({ user: "john" });

      expect(result.content[0].text).toBe(JSON.stringify(devices, null, 2));
    });
  });

  describe("Consent Tools", () => {
    it("should register 2 consent tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerConsentTools(mockServer, registry);

      expect(toolNames).toHaveLength(2);
      expect(toolNames).toEqual(["llng_consent_list", "llng_consent_delete"]);
    });

    it("should handle transport errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.consentsGet = vi.fn().mockRejectedValue(new Error("Database error"));

      registerConsentTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_consent_list",
      );
      const handler = toolCall[3];
      const result = await handler({ user: "john" });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Database error");
    });

    it("should return consent list", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      const consents = [
        { id: "1", rp: "app1.example.com", scope: "openid profile" },
        { id: "2", rp: "app2.example.com", scope: "openid email" },
      ];
      mockTransport.consentsGet = vi.fn().mockResolvedValue(consents);

      registerConsentTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_consent_list",
      );
      const handler = toolCall[3];
      const result = await handler({ user: "john" });

      expect(result.content[0].text).toBe(JSON.stringify(consents, null, 2));
    });
  });

  describe("OIDC Tools", () => {
    it("should register 8 OIDC tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerOidcTools(mockServer, registry);

      expect(toolNames).toHaveLength(8);
      expect(toolNames).toEqual([
        "llng_oidc_metadata",
        "llng_oidc_authorize",
        "llng_oidc_tokens",
        "llng_oidc_userinfo",
        "llng_oidc_introspect",
        "llng_oidc_refresh",
        "llng_oidc_whoami",
        "llng_oidc_check_auth",
      ]);
    });

    it("should handle undefined config with error", async () => {
      const { mockServer } = createMockServer();
      const { registry } = createMockRegistry();
      (registry.getOidcConfig as any).mockReturnValue(undefined);

      registerOidcTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_metadata",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toBe("Error: OIDC not configured");
    });
  });

  describe("OIDC RP Tools", () => {
    it("should register 5 OIDC RP tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerOidcRpTools(mockServer, registry);

      expect(toolNames).toHaveLength(5);
      expect(toolNames).toEqual([
        "llng_oidc_issuer_enable",
        "llng_oidc_rp_list",
        "llng_oidc_rp_get",
        "llng_oidc_rp_add",
        "llng_oidc_rp_delete",
      ]);
    });

    it("should return empty list when no RPs configured", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockResolvedValue({ oidcRPMetaDataOptions: null });

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_rp_list",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.content[0].text).toBe(JSON.stringify([], null, 2));
    });

    it("should fetch top-level keys and extract confKey for rp_get", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockResolvedValue({
        oidcRPMetaDataOptions: { myApp: { oidcRPMetaDataOptionsClientID: "client1" } },
        oidcRPMetaDataExportedVars: { myApp: { name: "cn" } },
        oidcRPMetaDataMacros: {},
        oidcRPMetaDataScopeRules: {},
        oidcRPMetaDataOptionsExtraClaims: {},
      });

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_rp_get",
      );
      const handler = toolCall[3];
      const result = await handler({ confKey: "myApp" });

      expect(result.content[0].text).toContain("client1");
      // Verify it fetches top-level keys, not slash-separated
      expect(mockTransport.configGet).toHaveBeenCalledWith([
        "oidcRPMetaDataOptions",
        "oidcRPMetaDataExportedVars",
        "oidcRPMetaDataMacros",
        "oidcRPMetaDataScopeRules",
        "oidcRPMetaDataOptionsExtraClaims",
      ]);
    });

    it("should handle transport errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockRejectedValue(new Error("Transport error"));

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_rp_list",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Transport error");
    });

    it("should enable OIDC issuer when not activated", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockResolvedValue({
        issuerDBOpenIDConnectActivation: 0,
        oidcServicePrivateKeySig: "",
      });

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_issuer_enable",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(mockTransport.configSet).toHaveBeenCalledWith({ issuerDBOpenIDConnectActivation: 1 });
      expect(mockTransport.execScript).toHaveBeenCalledWith("rotateOidcKeys", []);
      expect(result.content[0].text).toContain("enabled successfully");
    });

    it("should refuse rp_add when issuer is not enabled", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockResolvedValue({
        issuerDBOpenIDConnectActivation: 0,
        oidcServicePrivateKeySig: "",
      });

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_rp_add",
      );
      const handler = toolCall[3];
      const result = await handler({
        confKey: "myApp",
        clientId: "client1",
        redirectUris: "http://localhost/callback",
      });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("llng_oidc_issuer_enable");
    });

    it("should add default IDTokenSignAlg when issuer is enabled", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configGet = vi.fn().mockResolvedValue({
        issuerDBOpenIDConnectActivation: 1,
        oidcServicePrivateKeySig:
          "-----BEGIN RSA PRIVATE KEY-----\nfake\n-----END RSA PRIVATE KEY-----",
      });

      registerOidcRpTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_oidc_rp_add",
      );
      const handler = toolCall[3];
      const result = await handler({
        confKey: "myApp",
        clientId: "client1",
        redirectUris: "http://localhost/callback",
      });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("added successfully");

      // Verify configMerge was called with IDTokenSignAlg default
      const mergeCall = mockTransport.configMerge.mock.calls[0][0];
      const mergeData = JSON.parse(mergeCall);
      expect(mergeData.oidcRPMetaDataOptions.myApp.oidcRPMetaDataOptionsIDTokenSignAlg).toBe(
        "RS256",
      );
      expect(mergeData.oidcRPMetaDataOptions.myApp.oidcRPMetaDataOptionsAccessTokenClaims).toBe(1);
    });
  });

  describe("CLI Utility Tools", () => {
    it("should register 7 CLI utility tools", () => {
      const { mockServer, toolNames } = createMockServer();
      const { registry } = createMockRegistry();

      registerCliUtilityTools(mockServer, registry);

      expect(toolNames).toHaveLength(7);
      expect(toolNames).toEqual([
        "llng_download_saml_metadata",
        "llng_import_metadata",
        "llng_delete_session",
        "llng_user_attributes",
        "llng_purge_central_cache",
        "llng_purge_local_cache",
        "llng_rotate_oidc_keys",
      ]);
    });

    it("should call execScript with correct arguments", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      registerCliUtilityTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_user_attributes",
      );
      const handler = toolCall[3];
      const result = await handler({ username: "john", field: "mail" });

      expect(mockTransport.execScript).toHaveBeenCalledWith("llngUserAttributes", [
        "--username",
        "john",
        "--field",
        "mail",
      ]);
      expect(result.content[0].text).toBe("script output");
    });

    it("should handle execScript errors with isError flag", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.execScript = vi.fn().mockRejectedValue(new Error("Not supported via API"));

      registerCliUtilityTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_rotate_oidc_keys",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Not supported via API");
    });

    it("should handle boolean flags correctly", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      registerCliUtilityTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_purge_central_cache",
      );
      const handler = toolCall[3];
      await handler({ debug: true, force: true, json: true });

      expect(mockTransport.execScript).toHaveBeenCalledWith("purgeCentralCache", [
        "--debug",
        "--force",
        "--json",
      ]);
    });
  });

  describe("Error Handling", () => {
    it("should wrap non-Error objects in error responses", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      // Reject with a string instead of Error object
      mockTransport.configInfo = vi.fn().mockRejectedValue("Something went wrong");

      registerConfigTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_info",
      );
      const handler = toolCall[3];
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("Error: Something went wrong");
    });

    it("should handle multiple tool errors independently", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      mockTransport.configInfo = vi.fn().mockRejectedValue(new Error("Config error"));
      mockTransport.sessionGet = vi.fn().mockRejectedValue(new Error("Session error"));

      registerConfigTools(mockServer, registry);
      registerSessionTools(mockServer, registry);

      const configToolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_info",
      );
      const sessionToolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_get",
      );

      const configResult = await configToolCall[3]({});
      const sessionResult = await sessionToolCall[3]({ id: "test" });

      expect(configResult.isError).toBe(true);
      expect(configResult.content[0].text).toContain("Config error");

      expect(sessionResult.isError).toBe(true);
      expect(sessionResult.content[0].text).toContain("Session error");
    });
  });

  describe("Success Responses", () => {
    it("should return success messages for void operations", async () => {
      const { mockServer } = createMockServer();
      const { registry } = createMockRegistry();

      registerConfigTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_set",
      );
      const handler = toolCall[3];
      const result = await handler({ keys: { domain: "example.com" } });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("Config values updated successfully");
    });

    it("should include IDs in success messages", async () => {
      const { mockServer } = createMockServer();
      const { registry } = createMockRegistry();

      registerSessionTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_delete",
      );
      const handler = toolCall[3];
      const result = await handler({ ids: ["session1", "session2", "session3"] });

      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toBe("Successfully deleted 3 session(s)");
    });
  });

  describe("Parameter Handling", () => {
    it("should pass optional parameters correctly", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      registerConfigTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_config_set",
      );
      const handler = toolCall[3];

      await handler({ keys: { domain: "example.com" }, log: "Updated domain" });

      expect(mockTransport.configSet).toHaveBeenCalledWith(
        { domain: "example.com" },
        "Updated domain",
      );
    });

    it("should handle array parameters", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      registerSessionTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_delete",
      );
      const handler = toolCall[3];

      await handler({ ids: ["id1", "id2"], backend: "oidc" });

      expect(mockTransport.sessionDelete).toHaveBeenCalledWith(["id1", "id2"], {
        backend: "oidc",
        refreshTokens: undefined,
        persistent: undefined,
        hash: undefined,
        where: undefined,
      });
    });

    it("should handle complex filter objects", async () => {
      const { mockServer } = createMockServer();
      const { registry, mockTransport } = createMockRegistry();

      registerSessionTools(mockServer, registry);

      const toolCall = (mockServer.tool as any).mock.calls.find(
        (call: any) => call[0] === "llng_session_search",
      );
      const handler = toolCall[3];

      const filter = {
        where: { uid: "user1", ipAddr: "192.168.1.1" },
        select: ["uid", "_startTime"],
        backend: "global",
        count: false,
      };

      await handler(filter);

      expect(mockTransport.sessionSearch).toHaveBeenCalledWith({
        ...filter,
        refreshTokens: undefined,
        persistent: undefined,
        hash: undefined,
        idOnly: undefined,
      });
    });
  });
});
