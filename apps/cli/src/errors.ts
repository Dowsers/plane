// Copyright (c) 2023-present Plane Software, Inc. and contributors
// SPDX-License-Identifier: AGPL-3.0-only
// See the LICENSE file for details.
//
// Exit code scheme for the CLI (docs/feature-specs/08-api-webhooks-cli.md,
// section 5, exigence 7, in plane-selfhost). Documented in README.md -
// keep the two in sync.

export const ExitCode = {
  Success: 0,
  GeneralError: 1,
  ValidationError: 2,
  AuthError: 3,
  NetworkError: 4,
} as const;

export class CliError extends Error {
  readonly exitCode: number;

  constructor(message: string, exitCode: number) {
    super(message);
    this.name = new.target.name;
    this.exitCode = exitCode;
  }
}

/** Bad input, usage error, or a 4xx the server rejected as malformed/not-found. */
export class ValidationError extends CliError {
  constructor(message: string) {
    super(message, ExitCode.ValidationError);
  }
}

/** 401/403 from the API - the token is missing, invalid, or lacks permission. */
export class AuthError extends CliError {
  constructor(message: string) {
    super(message, ExitCode.AuthError);
  }
}

/** Connection failures, timeouts, 5xx, and rate-limit retries exhausted. */
export class NetworkError extends CliError {
  constructor(message: string) {
    super(message, ExitCode.NetworkError);
  }
}

/**
 * Plane's DRF error bodies aren't shaped consistently across endpoints -
 * sometimes {"error": "..."},  sometimes {"detail": "..."}, sometimes raw
 * per-field validation errors ({"name": ["This field is required."]}).
 * Best-effort extraction so the CLI never just prints "[object Object]".
 */
export function extractErrorMessage(body: unknown): string {
  if (body && typeof body === "object") {
    const record = body as Record<string, unknown>;
    if (typeof record.error === "string") return record.error;
    if (typeof record.detail === "string") return record.detail;
    if (typeof record.error_code === "string" && "retry_after" in record) {
      return `${record.error_code} (retry after ${record.retry_after}s)`;
    }
    const fieldErrors: string[] = [];
    for (const [field, value] of Object.entries(record)) {
      if (Array.isArray(value)) fieldErrors.push(`${field}: ${value.join(", ")}`);
      else if (typeof value === "string") fieldErrors.push(`${field}: ${value}`);
    }
    if (fieldErrors.length) return fieldErrors.join("; ");
  }
  if (typeof body === "string" && body.trim()) return body;
  return "Request failed with no error detail in the response body";
}

/** Maps an HTTP status onto the CLI's exit-code buckets - see ExitCode above. */
export function classifyHttpError(status: number, body: unknown): CliError {
  const message = `HTTP ${status}: ${extractErrorMessage(body)}`;
  if (status === 401 || status === 403) return new AuthError(message);
  if (status >= 500) return new NetworkError(message);
  // Everything else (400, 404, 405, 409, 422, ...) is the server telling
  // us the request itself was invalid, not an infra/auth problem.
  return new ValidationError(message);
}
