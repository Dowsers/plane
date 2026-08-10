/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import { API_BASE_URL } from "@plane/constants";
import {
  OPENAPI_METHODS,
  type TApiExplorerEndpoint,
  type TOpenAPIDocument,
  type TOpenAPIParameter,
  type TOpenAPISchemaObject,
} from "@plane/types";
// local imports
import type { TActiveToken } from "./types";

export const MAX_HISTORY_ENTRIES = 20;
/** Spec exigence 8's own example threshold ("ex. 5 requetes restantes"). */
export const RATE_LIMIT_LOW_THRESHOLD = 5;

export const MUTATING_METHODS: ReadonlySet<string> = new Set(["post", "put", "patch", "delete"]);

export function isMutatingMethod(method: string): boolean {
  return MUTATING_METHODS.has(method.toLowerCase());
}

/**
 * Flattens a real OpenAPI document (as returned by
 * `GET /api-explorer/schema/`) into one row per method+path, merging
 * path-item-level `parameters` (shared across every method on that path,
 * e.g. a `{project_id}` segment) with each operation's own. Tolerates a
 * missing/malformed `paths` object entirely (returns `[]`) rather than
 * throwing - a schema-load failure is already surfaced separately (spec
 * exigence 15), this must never additionally crash the whole page.
 */
function parameterKey(p: TOpenAPIParameter): string {
  return `${p.in}:${p.name}`;
}

export function parseOpenAPISchema(doc: TOpenAPIDocument | null | undefined): TApiExplorerEndpoint[] {
  if (!doc || typeof doc.paths !== "object" || doc.paths === null) return [];

  const endpoints: TApiExplorerEndpoint[] = [];

  for (const [path, pathItem] of Object.entries(doc.paths)) {
    if (!pathItem || typeof pathItem !== "object") continue;
    const sharedParameters = Array.isArray(pathItem.parameters) ? pathItem.parameters : [];

    for (const method of OPENAPI_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const ownParameters = Array.isArray(operation.parameters) ? operation.parameters : [];
      // Own parameters win over shared ones of the same name+location, per
      // the OpenAPI spec's own override rule.
      const merged = new Map<string, TOpenAPIParameter>();
      for (const p of sharedParameters) merged.set(parameterKey(p), p);
      for (const p of ownParameters) merged.set(parameterKey(p), p);

      endpoints.push({
        id: `${method}:${path}`,
        method,
        path,
        summary: operation.summary?.trim() || "",
        description: operation.description?.trim() || "",
        tags: Array.isArray(operation.tags) && operation.tags.length > 0 ? operation.tags : ["Other"],
        operation,
        parameters: Array.from(merged.values()),
        isMutating: isMutatingMethod(method),
      });
    }
  }

  // Stable, predictable ordering for a searchable list: group visually by
  // path first (so e.g. GET/POST on the same resource sit together), then
  // by method.
  // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array, no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
  endpoints.sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  return endpoints;
}

export function groupEndpointsByTag(endpoints: TApiExplorerEndpoint[]): Map<string, TApiExplorerEndpoint[]> {
  const groups = new Map<string, TApiExplorerEndpoint[]>();
  for (const endpoint of endpoints) {
    for (const tag of endpoint.tags) {
      const bucket = groups.get(tag) ?? [];
      bucket.push(endpoint);
      groups.set(tag, bucket);
    }
  }
  // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array (spread copy), no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
  return new Map([...groups.entries()].sort(([a], [b]) => a.localeCompare(b)));
}

export function matchesSearch(endpoint: TApiExplorerEndpoint, query: string): boolean {
  if (!query.trim()) return true;
  const haystack = `${endpoint.method} ${endpoint.path} ${endpoint.summary} ${endpoint.description}`.toLowerCase();
  return haystack.includes(query.trim().toLowerCase());
}

/** Substitutes `{name}`-style path parameters. Values are URI-encoded;
 * a parameter with no supplied value is left as an empty string rather
 * than left literally as `{name}` in the URL, since an unresolved
 * placeholder is never a valid request. */
export function substitutePathParams(path: string, values: Record<string, string>): string {
  return path.replace(/\{([^}]+)\}/g, (_match, name: string) => encodeURIComponent(values[name] ?? ""));
}

export function buildQueryString(values: Record<string, string>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value === "" || value === undefined) continue;
    params.set(key, value);
  }
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Resolves a single-level `#/components/schemas/Name` `$ref` - the only
 * shape this schema's generator actually produces for reusable schemas.
 * Anything else ($ref to an external file, a JSON pointer into a
 * non-`components/schemas` location) is left unresolved rather than
 * guessed at. */
function resolveRef(doc: TOpenAPIDocument, schema: TOpenAPISchemaObject): TOpenAPISchemaObject {
  if (!schema.$ref) return schema;
  const match = /^#\/components\/schemas\/(.+)$/.exec(schema.$ref);
  const name = match?.[1];
  const resolved = name ? doc.components?.schemas?.[name] : undefined;
  return resolved ?? schema;
}

/**
 * Best-effort placeholder value generator for a body's JSON editor
 * pre-fill - deliberately shallow (depth-limited, no `allOf`/`oneOf`
 * merging) since the actual editing surface is a raw JSON textarea (an
 * acceptable, honest MVP per this feature's own scope call - see this
 * component tree's root docstring); this only needs to produce *a*
 * reasonable starting point without crashing on a type/shape it doesn't
 * fully understand.
 */
export function buildSampleFromSchema(
  doc: TOpenAPIDocument,
  schema: TOpenAPISchemaObject | undefined,
  depth = 0
): unknown {
  if (!schema || depth > 3) return null;
  const resolved = resolveRef(doc, schema);

  if (resolved.default !== undefined) return resolved.default;
  if (resolved.enum && resolved.enum.length > 0) return resolved.enum[0];

  switch (resolved.type) {
    case "object": {
      if (!resolved.properties) return {};
      const sample: Record<string, unknown> = {};
      for (const [key, propSchema] of Object.entries(resolved.properties)) {
        sample[key] = buildSampleFromSchema(doc, propSchema, depth + 1);
      }
      return sample;
    }
    case "array":
      return resolved.items ? [buildSampleFromSchema(doc, resolved.items, depth + 1)] : [];
    case "integer":
    case "number":
      return 0;
    case "boolean":
      return false;
    case "string":
      if (resolved.format === "date-time") return new Date().toISOString();
      if (resolved.format === "date") return new Date().toISOString().slice(0, 10);
      if (resolved.format === "uuid") return "00000000-0000-0000-0000-000000000000";
      return "";
    default:
      // Unknown/unusual type (e.g. a bare `oneOf`/`allOf` with no `type`) -
      // don't guess, don't crash.
      return null;
  }
}

/** application/json request body schema for an operation, if any. */
export function getJsonRequestBodySchema(
  operation: TApiExplorerEndpoint["operation"]
): TOpenAPISchemaObject | undefined {
  return operation.requestBody?.content?.["application/json"]?.schema;
}

export function getJsonRequestBodyExample(operation: TApiExplorerEndpoint["operation"]): unknown {
  return operation.requestBody?.content?.["application/json"]?.example;
}

export type TRateLimitInfo = {
  limit: number | null;
  remaining: number | null;
};

/** Reads the rate-limit headers added in category 8 feature 2
 * (`X-RateLimit-Limit`/`X-RateLimit-Remaining` - see
 * apps/api/plane/api/views/base.py) off an already-lower-cased headers
 * map (see `ApiExplorerService`'s `normalizeHeaders`). Returns `null`
 * entirely (not a partial object) when neither header is present, so
 * callers can tell "no rate-limit info in this response" apart from
 * "0 remaining". */
export function extractRateLimitInfo(headers: Record<string, string>): TRateLimitInfo | null {
  const limitRaw = headers["x-ratelimit-limit"];
  const remainingRaw = headers["x-ratelimit-remaining"];
  if (limitRaw === undefined && remainingRaw === undefined) return null;
  const limit = limitRaw !== undefined ? Number(limitRaw) : null;
  const remaining = remainingRaw !== undefined ? Number(remainingRaw) : null;
  return {
    limit: Number.isFinite(limit) ? limit : null,
    remaining: Number.isFinite(remaining) ? remaining : null,
  };
}

export type TExecuteGate = {
  allowed: boolean;
  reason: string | null;
};

/**
 * Whether the "Execute" button should be enabled for a given endpoint,
 * per spec exigence 14/item 10 (docs/feature-specs/08-api-webhooks-cli.md
 * "6. Explorateur d'API interactif" in plane-selfhost): "masque pour
 * Guest, lecture seule pour Member, execution reservee par defaut aux
 * Admins" - a Guest never reaches this component at all (gated at the
 * settings-page level), so this only distinguishes Admin from Member:
 *
 * - Admin: always allowed (subject to rate limit / token scope below).
 * - Member: always allowed for a non-mutating call (GET/HEAD/OPTIONS -
 *   the backend's own `APITokenScopePermission` never blocks those
 *   either); a mutating call additionally requires
 *   `allow_members_execute`, mirroring the backend's own
 *   `APIExplorerEphemeralTokenEndpoint` rule that a Member may only mint
 *   a `read_write` token when that flag is on.
 *
 * On top of the role gate: a mutating call is also blocked outright when
 * the active token's scope is *known* (i.e. it was minted through this
 * explorer, not pasted - see `TActiveToken`) to be `read_only`, and when
 * the last-seen rate limit is exhausted.
 */
export function computeExecuteGate(params: {
  isAdmin: boolean;
  isMember: boolean;
  allowMembersExecute: boolean;
  activeToken: TActiveToken | null;
  method: string;
  rateLimitInfo: TRateLimitInfo | null;
}): TExecuteGate {
  const { isAdmin, isMember, allowMembersExecute, activeToken, method, rateLimitInfo } = params;

  if (!activeToken) return { allowed: false, reason: "Set up a token above first." };

  if (rateLimitInfo && rateLimitInfo.remaining !== null && rateLimitInfo.remaining <= 0) {
    return { allowed: false, reason: "This token's rate-limit quota is exhausted - wait for it to reset." };
  }

  const mutating = isMutatingMethod(method);

  if (mutating && activeToken.scope === "read_only") {
    return { allowed: false, reason: "Your active token is read-only and cannot perform this request." };
  }

  if (isAdmin) return { allowed: true, reason: null };

  if (isMember) {
    if (!mutating) return { allowed: true, reason: null };
    return allowMembersExecute
      ? { allowed: true, reason: null }
      : {
          allowed: false,
          reason:
            "This workspace restricts mutating requests to Admins. An Admin can allow Members below (Settings on this page).",
        };
  }

  return { allowed: false, reason: "You do not have permission to execute requests here." };
}

/** Absolute origin to resolve a relative API path against for display
 * purposes (curl snippets) - `API_BASE_URL` is an empty string in the
 * normal same-origin-proxied deployment, in which case the browser's own
 * origin IS the real target. */
export function resolveAbsoluteUrl(relativeUrl: string): string {
  const base = API_BASE_URL || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}${relativeUrl}`;
}

/**
 * curl-only snippet generator (spec exigence 9 asks for curl + Python SDK
 * + Node SDK; Python/Node were deliberately skipped - see this feature's
 * final report for why: no actual Plane SDK code exists in this monorepo
 * to model the exact call syntax on confidently, and a best-effort
 * raw-`requests`/`fetch` snippet not tied to any real SDK would be more
 * misleading than useful under a "Python (SDK officiel)" label).
 */
export function buildCurlSnippet(
  method: string,
  relativeUrl: string,
  headers: Record<string, string>,
  body?: string
): string {
  const lines = [`curl -X ${method.toUpperCase()} \\`, `  '${resolveAbsoluteUrl(relativeUrl)}' \\`];
  for (const [key, value] of Object.entries(headers)) {
    lines.push(`  -H '${key}: ${value}' \\`);
  }
  if (body && body.trim()) {
    lines.push(`  -H 'Content-Type: application/json' \\`);
    // Escape single quotes for shell-safety inside the single-quoted body.
    const escaped = body.replace(/'/g, `'\\''`);
    lines.push(`  -d '${escaped}'`);
  } else {
    // Drop the trailing continuation backslash on the last header line.
    lines[lines.length - 1] = lines[lines.length - 1].replace(/ \\$/, "");
  }
  return lines.join("\n");
}
