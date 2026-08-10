import { describe, expect, it } from "vitest";
import {
  AuthError,
  ExitCode,
  NetworkError,
  ValidationError,
  classifyHttpError,
  extractErrorMessage,
} from "../src/errors.js";

describe("classifyHttpError", () => {
  it("maps 401/403 to AuthError", () => {
    expect(classifyHttpError(401, { detail: "nope" })).toBeInstanceOf(AuthError);
    expect(classifyHttpError(403, { detail: "nope" })).toBeInstanceOf(AuthError);
  });

  it("maps 5xx to NetworkError", () => {
    expect(classifyHttpError(500, {})).toBeInstanceOf(NetworkError);
    expect(classifyHttpError(503, {})).toBeInstanceOf(NetworkError);
  });

  it("maps other 4xx (400/404/409/422) to ValidationError", () => {
    for (const status of [400, 404, 409, 422]) {
      expect(classifyHttpError(status, { error: "bad" })).toBeInstanceOf(ValidationError);
    }
  });

  it("attaches the documented exit codes", () => {
    expect(classifyHttpError(401, {}).exitCode).toBe(ExitCode.AuthError);
    expect(classifyHttpError(400, {}).exitCode).toBe(ExitCode.ValidationError);
    expect(classifyHttpError(500, {}).exitCode).toBe(ExitCode.NetworkError);
  });
});

describe("extractErrorMessage", () => {
  it("prefers {error: string}", () => {
    expect(extractErrorMessage({ error: "boom" })).toBe("boom");
  });

  it("falls back to {detail: string}", () => {
    expect(extractErrorMessage({ detail: "nope" })).toBe("nope");
  });

  it("renders DRF field errors as field: message pairs", () => {
    expect(extractErrorMessage({ name: ["This field is required."] })).toBe("name: This field is required.");
  });

  it("renders the rate-limit body shape", () => {
    expect(extractErrorMessage({ error_code: "rate_limit_exceeded", retry_after: 12 })).toBe(
      "rate_limit_exceeded (retry after 12s)"
    );
  });
});
