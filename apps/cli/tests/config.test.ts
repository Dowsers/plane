import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AuthError, ValidationError } from "../src/errors.js";
import { loadConfig, resolveContext, saveConfig } from "../src/config.js";

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), "plane-cli-config-test-"));
  process.env.XDG_CONFIG_HOME = tempDir;
  delete process.env.PLANE_API_TOKEN;
  delete process.env.PLANE_API_URL;
});

afterEach(() => {
  delete process.env.XDG_CONFIG_HOME;
  delete process.env.PLANE_API_TOKEN;
  delete process.env.PLANE_API_URL;
  rmSync(tempDir, { recursive: true, force: true });
});

describe("config file round-trip", () => {
  it("returns {} when no config file exists yet", () => {
    expect(loadConfig()).toEqual({});
  });

  it("persists and reloads a saved config", () => {
    saveConfig({ api_url: "https://plane.example.com", token: "plane_api_abc" });
    saveConfig({ default_workspace: "acme" });
    expect(loadConfig()).toEqual({
      api_url: "https://plane.example.com",
      token: "plane_api_abc",
      default_workspace: "acme",
    });
  });
});

describe("resolveContext precedence (flag > env > config file)", () => {
  it("throws ValidationError when no api-url is configured anywhere", () => {
    expect(() => resolveContext({})).toThrow(ValidationError);
  });

  it("throws AuthError when api-url is set but no token is configured", () => {
    expect(() => resolveContext({ apiUrl: "https://plane.example.com" })).toThrow(AuthError);
  });

  it("falls back to the config file when no flag/env is given", () => {
    saveConfig({ api_url: "https://from-config.example.com", token: "from-config-token", default_workspace: "acme" });
    const ctx = resolveContext({});
    expect(ctx).toEqual({ apiUrl: "https://from-config.example.com", token: "from-config-token", workspace: "acme" });
  });

  it("prefers the environment variable over the config file", () => {
    saveConfig({ api_url: "https://from-config.example.com", token: "from-config-token" });
    process.env.PLANE_API_TOKEN = "from-env-token";
    const ctx = resolveContext({});
    expect(ctx.token).toBe("from-env-token");
  });

  it("prefers an explicit flag over both the environment variable and the config file", () => {
    saveConfig({ api_url: "https://from-config.example.com", token: "from-config-token" });
    process.env.PLANE_API_TOKEN = "from-env-token";
    const ctx = resolveContext({ token: "from-flag-token" });
    expect(ctx.token).toBe("from-flag-token");
  });

  it("requires a workspace only when requireWorkspace is set", () => {
    saveConfig({ api_url: "https://plane.example.com", token: "tok" });
    expect(() => resolveContext({}, { requireWorkspace: false })).not.toThrow();
    expect(() => resolveContext({}, { requireWorkspace: true })).toThrow(ValidationError);
  });
});
