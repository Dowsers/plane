/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Types for the interactive API Explorer (category 8, feature 6) - see
 * docs/feature-specs/08-api-webhooks-cli.md ("6. Explorateur d'API
 * interactif") in plane-selfhost, and the backend that serves these
 * shapes (`apps/api/plane/api/views/api_explorer.py`,
 * `apps/api/plane/app/views/api_explorer.py`,
 * `apps/api/plane/app/views/webhook/base.py::WebhookTestSendEndpoint`).
 */

export type TApiExplorerTokenScope = "read_write" | "read_only";

/** Body of `POST /api/v1/workspaces/{slug}/api-explorer/tokens/ephemeral/`. */
export type TApiExplorerEphemeralTokenRequest = {
  scope: TApiExplorerTokenScope;
  ttl_seconds?: number;
};

/** Response of the same endpoint. */
export type TApiExplorerEphemeralToken = {
  id: string;
  token: string;
  scope: TApiExplorerTokenScope;
  is_ephemeral: boolean;
  expired_at: string;
};

/** `GET`/`PATCH /api/workspaces/{slug}/api-explorer-settings/`. */
export type TWorkspaceAPIExplorerSettings = {
  id: string;
  workspace_id: string;
  is_enabled: boolean;
  allow_members_execute: boolean;
};

/**
 * Deliberately loose OpenAPI 3.x typing - the schema comes from
 * drf-spectacular's real generator, so it can contain any spec-legal
 * shape (allOf/oneOf/$ref chains, vendor extensions, etc.). Modeling the
 * full spec isn't worth it for a "parse method/path/summary/params/body"
 * consumer - every object below tolerates unknown extra keys.
 */
export type TOpenAPIParameterLocation = "path" | "query" | "header" | "cookie";

export type TOpenAPISchemaObject = {
  type?: string;
  format?: string;
  enum?: (string | number)[];
  items?: TOpenAPISchemaObject;
  default?: unknown;
  description?: string;
  $ref?: string;
  nullable?: boolean;
  properties?: Record<string, TOpenAPISchemaObject>;
  required?: string[];
  [key: string]: unknown;
};

export type TOpenAPIParameter = {
  name: string;
  in: TOpenAPIParameterLocation;
  required?: boolean;
  description?: string;
  schema?: TOpenAPISchemaObject;
};

export type TOpenAPIMediaType = {
  schema?: TOpenAPISchemaObject;
  example?: unknown;
};

export type TOpenAPIRequestBody = {
  required?: boolean;
  content?: Record<string, TOpenAPIMediaType>;
};

export type TOpenAPIResponse = {
  description?: string;
  content?: Record<string, TOpenAPIMediaType>;
};

export type TOpenAPIOperation = {
  operationId?: string;
  summary?: string;
  description?: string;
  tags?: string[];
  parameters?: TOpenAPIParameter[];
  requestBody?: TOpenAPIRequestBody;
  responses?: Record<string, TOpenAPIResponse>;
  deprecated?: boolean;
};

export const OPENAPI_METHODS = ["get", "post", "put", "patch", "delete"] as const;
export type TOpenAPIMethod = (typeof OPENAPI_METHODS)[number];

export type TOpenAPIPathItem = Partial<Record<TOpenAPIMethod, TOpenAPIOperation>> & {
  parameters?: TOpenAPIParameter[];
};

export type TOpenAPIDocument = {
  openapi?: string;
  info?: { title?: string; version?: string; description?: string };
  paths?: Record<string, TOpenAPIPathItem>;
  components?: { schemas?: Record<string, TOpenAPISchemaObject> };
  tags?: { name: string; description?: string }[];
};

/**
 * Flattened, UI-friendly representation built from `TOpenAPIDocument` by
 * the frontend parser (`apps/web/core/components/api-explorer/utils.ts`)
 * - one row per method+path combination actually present in the schema.
 */
export type TApiExplorerEndpoint = {
  /** `${method}:${path}` - stable react key + selection id. */
  id: string;
  method: TOpenAPIMethod;
  path: string;
  summary: string;
  description: string;
  tags: string[];
  operation: TOpenAPIOperation;
  /** Path + query + header parameters, own + inherited from the path item. */
  parameters: TOpenAPIParameter[];
  isMutating: boolean;
};

export type TApiExplorerHistoryEntry = {
  id: string;
  method: string;
  url: string;
  requestHeaders: Record<string, string>;
  requestBody: string | null;
  status: number | null;
  statusText: string;
  durationMs: number | null;
  responseHeaders: Record<string, string>;
  responseBody: unknown;
  error: string | null;
  timestamp: number;
  /** `${method}:${path}` of the endpoint this call was built from, if it
   * still exists in the currently-loaded schema - lets "replay" re-select
   * the same entry in the browser. */
  endpointId: string | null;
  /** Raw form inputs the request was built from (not just the resolved
   * URL) - replaying re-populates these directly instead of re-parsing
   * the URL, which would be lossy for values containing reserved
   * characters. */
  pathValues: Record<string, string>;
  queryValues: Record<string, string>;
};

/** Body of `POST /api/workspaces/{slug}/webhooks/{pk}/test/`. */
export type TWebhookTestSendRequest = {
  event_type: string;
  source?: string;
};

/** Response of the same endpoint. */
export type TWebhookTestSendResponse = {
  delivered: boolean;
  event_type: string;
  payload: unknown;
  signature?: string | null;
  response_status_code?: number;
  response_body?: string;
  latency_ms?: number;
  last_test_triggered_via?: string | null;
  error?: string;
};
