import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ApiTransport } from "../transport/api.js";

// Helper function to mock fetch response
function mockFetchResponse(data: any, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    headers: new Headers({ "content-type": "application/json" }),
  };
}

describe("ApiTransport", () => {
  let originalFetch: typeof global.fetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe("constructor", () => {
    it("should strip trailing slash from baseUrl", () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com/",
        verifySsl: true,
      });

      // Verify by making a request and checking the URL
      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({ cfgNum: 1 }));
      global.fetch = mockFetch as any;

      transport.configInfo();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/api/v1/config/latest",
        expect.any(Object),
      );
    });
  });

  describe("authentication", () => {
    it("should add Basic auth header when basicAuth is configured", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        basicAuth: { username: "admin", password: "secret" },
        verifySsl: true,
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse({ cfgNum: 1, cfgAuthor: "admin", cfgDate: 123456 }));
      global.fetch = mockFetch as any;

      await transport.configInfo();

      const expectedAuth = Buffer.from("admin:secret").toString("base64");
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: `Basic ${expectedAuth}`,
          }),
        }),
      );
    });

    it("should not add auth header when basicAuth is not configured", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse({ cfgNum: 1, cfgAuthor: "admin", cfgDate: 123456 }));
      global.fetch = mockFetch as any;

      await transport.configInfo();

      const callArgs = mockFetch.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers["Authorization"]).toBeUndefined();
    });
  });

  describe("error handling", () => {
    it("should throw error on HTTP error response", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValue(mockFetchResponse({ error: "Not found" }, false, 404));
      global.fetch = mockFetch as any;

      await expect(transport.configInfo()).rejects.toThrow("API request failed");
    });
  });

  describe("configInfo", () => {
    it("should fetch config metadata", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const configData = {
        cfgNum: 5,
        cfgAuthor: "admin",
        cfgDate: 1234567890,
        cfgLog: "Test update",
        otherField: "ignored",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(configData));
      global.fetch = mockFetch as any;

      const result = await transport.configInfo();

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/api/v1/config/latest",
        expect.any(Object),
      );
      expect(result).toEqual({
        cfgNum: 5,
        cfgAuthor: "admin",
        cfgDate: 1234567890,
        cfgLog: "Test update",
      });
    });
  });

  describe("configGet", () => {
    it("should return only requested keys", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const configData = {
        cfgNum: 5,
        portal: "https://portal.example.com",
        domain: "example.com",
        timeout: 3600,
        extraField: "not requested",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(configData));
      global.fetch = mockFetch as any;

      const result = await transport.configGet(["portal", "domain"]);

      expect(result).toEqual({
        portal: "https://portal.example.com",
        domain: "example.com",
      });
      expect(result).not.toHaveProperty("timeout");
      expect(result).not.toHaveProperty("extraField");
    });
  });

  describe("configSet", () => {
    it("should merge pairs and PUT updated config", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        portal: "https://portal.example.com",
        domain: "example.com",
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configSet({ domain: "newdomain.com", timeout: 7200 });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(mockFetch.mock.calls[0][0]).toBe("https://auth.example.com/api/v1/config/latest");
      expect(mockFetch.mock.calls[1][0]).toBe("https://auth.example.com/api/v1/config");
      expect(mockFetch.mock.calls[1][1].method).toBe("PUT");

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body).toEqual({
        cfgNum: 5,
        portal: "https://portal.example.com",
        domain: "newdomain.com",
        timeout: 7200,
      });
    });

    it("should add cfgLog when log parameter is provided", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        portal: "https://portal.example.com",
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configSet({ domain: "example.com" }, "Added domain");

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.cfgLog).toBe("Added domain");
    });
  });

  describe("configAddKey", () => {
    it("should add subkey to nested object", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        locationRules: {
          default: "accept",
        },
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configAddKey("locationRules", "admin.example.com", '$uid eq "admin"');

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.locationRules).toEqual({
        default: "accept",
        "admin.example.com": '$uid eq "admin"',
      });
    });

    it("should initialize key if it does not exist", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        portal: "https://portal.example.com",
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configAddKey("locationRules", "default", "accept");

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.locationRules).toEqual({
        default: "accept",
      });
    });
  });

  describe("configDelKey", () => {
    it("should remove subkey from nested object", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        locationRules: {
          default: "accept",
          "admin.example.com": '$uid eq "admin"',
        },
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configDelKey("locationRules", "admin.example.com");

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.locationRules).toEqual({
        default: "accept",
      });
    });

    it("should not fail when key does not exist", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        locationRules: {
          default: "accept",
        },
      };

      const mockFetch = vi.fn().mockResolvedValueOnce(mockFetchResponse(currentConfig));
      global.fetch = mockFetch as any;

      await transport.configDelKey("locationRules", "nonexistent");

      // Should only fetch, not PUT
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe("configSave", () => {
    it("should return config as JSON string", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const configData = {
        cfgNum: 5,
        portal: "https://portal.example.com",
        domain: "example.com",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(configData));
      global.fetch = mockFetch as any;

      const result = await transport.configSave();

      expect(result).toBe(JSON.stringify(configData, null, 2));
    });
  });

  describe("configRestore", () => {
    it("should PUT parsed JSON config", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const configData = {
        cfgNum: 5,
        portal: "https://portal.example.com",
        domain: "example.com",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configRestore(JSON.stringify(configData));

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/api/v1/config",
        expect.objectContaining({
          method: "PUT",
          body: JSON.stringify(configData),
        }),
      );
    });
  });

  describe("configMerge", () => {
    it("should deep merge JSON snippet with current config", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        portal: "https://portal.example.com",
        locationRules: {
          default: "accept",
        },
        authParams: {
          timeout: 3600,
        },
      };

      const snippet = {
        locationRules: {
          "admin.example.com": '$uid eq "admin"',
        },
        authParams: {
          maxRetries: 3,
        },
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configMerge(JSON.stringify(snippet));

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.locationRules).toEqual({
        default: "accept",
        "admin.example.com": '$uid eq "admin"',
      });
      expect(body.authParams).toEqual({
        timeout: 3600,
        maxRetries: 3,
      });
    });
  });

  describe("configRollback", () => {
    it("should fetch previous config and PUT it", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 5,
        portal: "https://portal.example.com",
      };

      const previousConfig = {
        cfgNum: 4,
        portal: "https://old-portal.example.com",
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse(previousConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configRollback();

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[1][0]).toBe("https://auth.example.com/api/v1/config/4");
      expect(mockFetch.mock.calls[2][0]).toBe("https://auth.example.com/api/v1/config");

      const body = JSON.parse(mockFetch.mock.calls[2][1].body);
      expect(body).toEqual(previousConfig);
    });

    it("should throw error when at cfgNum 1", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        cfgNum: 1,
        portal: "https://portal.example.com",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(currentConfig));
      global.fetch = mockFetch as any;

      await expect(transport.configRollback()).rejects.toThrow(
        "Cannot rollback: already at first config",
      );
    });
  });

  describe("configUpdateCache", () => {
    it("should be a no-op", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi.fn();
      global.fetch = mockFetch as any;

      await transport.configUpdateCache();

      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe("sessionGet", () => {
    it("should fetch session from global backend by default", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const sessionData = {
        _session_id: "abc123",
        uid: "user1",
        _startTime: 1234567890,
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(sessionData));
      global.fetch = mockFetch as any;

      const result = await transport.sessionGet("abc123");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/api/v1/sessions/global/abc123",
        expect.any(Object),
      );
      expect(result).toEqual(sessionData);
    });

    it("should fetch session from specified backend", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const sessionData = {
        _session_id: "xyz789",
        sub: "user@example.com",
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(sessionData));
      global.fetch = mockFetch as any;

      await transport.sessionGet("xyz789", "oidc");

      expect(mockFetch).toHaveBeenCalledWith(
        "https://auth.example.com/api/v1/sessions/oidc/xyz789",
        expect.any(Object),
      );
    });
  });

  describe("sessionSearch", () => {
    it("should build query string with where clause", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const sessionsData = {
        session1: { uid: "user1", _startTime: 1234567890 },
        session2: { uid: "user2", _startTime: 1234567891 },
      };

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse(sessionsData));
      global.fetch = mockFetch as any;

      const result = await transport.sessionSearch({
        where: { uid: "user1", ipAddr: "192.168.1.1" },
      });

      const expectedUrl =
        "https://auth.example.com/api/v1/sessions/global?where=uid%3Duser1%20AND%20ipAddr%3D192.168.1.1";
      expect(mockFetch).toHaveBeenCalledWith(expectedUrl, expect.any(Object));

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty("id", "session1");
    });

    it("should handle select parameter", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({}));
      global.fetch = mockFetch as any;

      await transport.sessionSearch({
        select: ["uid", "_startTime"],
      });

      expect(mockFetch.mock.calls[0][0]).toContain("select=uid,_startTime");
    });

    it("should handle count parameter", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({}));
      global.fetch = mockFetch as any;

      await transport.sessionSearch({
        count: true,
      });

      expect(mockFetch.mock.calls[0][0]).toContain("count=1");
    });
  });

  describe("sessionDelete", () => {
    it("should DELETE each session ID", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.sessionDelete(["session1", "session2", "session3"]);

      expect(mockFetch).toHaveBeenCalledTimes(3);
      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/api/v1/sessions/global/session1",
      );
      expect(mockFetch.mock.calls[1][0]).toBe(
        "https://auth.example.com/api/v1/sessions/global/session2",
      );
      expect(mockFetch.mock.calls[2][0]).toBe(
        "https://auth.example.com/api/v1/sessions/global/session3",
      );

      mockFetch.mock.calls.forEach((call) => {
        expect(call[1].method).toBe("DELETE");
      });
    });

    it("should use specified backend", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const mockFetch = vi.fn().mockResolvedValue(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.sessionDelete(["session1"], "oidc");

      expect(mockFetch.mock.calls[0][0]).toBe(
        "https://auth.example.com/api/v1/sessions/oidc/session1",
      );
    });
  });

  describe("deepMerge", () => {
    it("should properly merge nested objects", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        level1: {
          level2: {
            a: 1,
            b: 2,
          },
          c: 3,
        },
        d: 4,
      };

      const snippet = {
        level1: {
          level2: {
            b: 20,
            e: 5,
          },
          f: 6,
        },
        g: 7,
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configMerge(JSON.stringify(snippet));

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);

      expect(body.level1.level2).toEqual({
        a: 1,
        b: 20,
        e: 5,
      });
      expect(body.level1.c).toBe(3);
      expect(body.level1.f).toBe(6);
      expect(body.d).toBe(4);
      expect(body.g).toBe(7);
    });

    it("should handle array replacement (not merge)", async () => {
      const transport = new ApiTransport({
        baseUrl: "https://auth.example.com",
        verifySsl: true,
      });

      const currentConfig = {
        arrayField: [1, 2, 3],
      };

      const snippet = {
        arrayField: [4, 5],
      };

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce(mockFetchResponse(currentConfig))
        .mockResolvedValueOnce(mockFetchResponse({ success: true }));
      global.fetch = mockFetch as any;

      await transport.configMerge(JSON.stringify(snippet));

      const body = JSON.parse(mockFetch.mock.calls[1][1].body);
      expect(body.arrayField).toEqual([4, 5]);
    });
  });
});
