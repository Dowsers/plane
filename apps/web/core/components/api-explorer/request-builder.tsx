/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Copy, Wand2 } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TApiExplorerEndpoint, TOpenAPIDocument } from "@plane/types";
import { Button } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// local imports
import { ParamInput } from "./param-input";
import type { TExecutePayload, TReplaySeed } from "./types";
import {
  buildCurlSnippet,
  buildQueryString,
  buildSampleFromSchema,
  getJsonRequestBodyExample,
  getJsonRequestBodySchema,
  substitutePathParams,
  type TExecuteGate,
} from "./utils";

const METHOD_BADGE_VARIANT: Record<string, "brand" | "success" | "warning" | "danger"> = {
  get: "brand",
  post: "success",
  put: "warning",
  patch: "warning",
  delete: "danger",
};

type Props = {
  endpoint: TApiExplorerEndpoint;
  doc: TOpenAPIDocument;
  executeGate: TExecuteGate;
  isExecuting: boolean;
  onExecute: (payload: TExecutePayload) => void;
  replaySeed: TReplaySeed | null;
  activeTokenValue: string;
};

export function RequestBuilder({
  endpoint,
  doc,
  executeGate,
  isExecuting,
  onExecute,
  replaySeed,
  activeTokenValue,
}: Props) {
  const [pathValues, setPathValues] = useState<Record<string, string>>({});
  const [queryValues, setQueryValues] = useState<Record<string, string>>({});
  const [bodyText, setBodyText] = useState<string>("");
  const [bodyError, setBodyError] = useState<string | null>(null);

  const pathParams = useMemo(() => endpoint.parameters.filter((p) => p.in === "path"), [endpoint]);
  const queryParams = useMemo(() => endpoint.parameters.filter((p) => p.in === "query"), [endpoint]);
  const bodySchema = useMemo(() => getJsonRequestBodySchema(endpoint.operation), [endpoint]);
  const hasBody = Boolean(endpoint.operation.requestBody);

  // Reset the draft whenever the selected endpoint changes, or seed it
  // from a replayed history entry (`replaySeed.nonce` changes on every
  // replay, even of the same endpoint, so this still fires).
  useEffect(() => {
    if (replaySeed) {
      setPathValues(replaySeed.pathValues);
      setQueryValues(replaySeed.queryValues);
      setBodyText(replaySeed.bodyText ?? "");
      setBodyError(null);
      return;
    }
    setPathValues(Object.fromEntries(pathParams.map((p) => [p.name, ""])));
    setQueryValues(Object.fromEntries(queryParams.map((p) => [p.name, ""])));
    setBodyText("");
    setBodyError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endpoint.id, replaySeed?.nonce]);

  const resolvedPath = substitutePathParams(endpoint.path, pathValues);
  const queryString = buildQueryString(queryValues);
  const relativeUrl = `${resolvedPath}${queryString}`;

  const handlePrefillBody = () => {
    const example = getJsonRequestBodyExample(endpoint.operation);
    const sample = example ?? buildSampleFromSchema(doc, bodySchema);
    setBodyText(JSON.stringify(sample, null, 2));
    setBodyError(null);
  };

  const validateAndBuildPayload = (): TExecutePayload | null => {
    const missingRequired = [...pathParams, ...queryParams].find(
      (p) => p.required && !pathValues[p.name] && !queryValues[p.name]
    );
    if (missingRequired) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Missing parameter",
        message: `"${missingRequired.name}" is required.`,
      });
      return null;
    }

    let normalizedBody: string | null = null;
    if (hasBody && bodyText.trim()) {
      try {
        // Parse only to validate, then re-stringify so what gets sent is
        // always well-formed JSON regardless of the textarea's exact
        // whitespace.
        normalizedBody = JSON.stringify(JSON.parse(bodyText));
        setBodyError(null);
      } catch {
        setBodyError("Body must be valid JSON.");
        return null;
      }
    }

    return {
      method: endpoint.method,
      url: relativeUrl,
      bodyText: normalizedBody,
      pathValues,
      queryValues,
      endpointId: endpoint.id,
    };
  };

  const handleExecuteClick = () => {
    const payload = validateAndBuildPayload();
    if (payload) onExecute(payload);
  };

  const handleCopyCurl = () => {
    const payload = validateAndBuildPayload();
    if (!payload) return;
    const snippet = buildCurlSnippet(
      payload.method,
      payload.url,
      { "X-Api-Key": activeTokenValue || "<your-token>", "X-Plane-Source": "api-explorer" },
      payload.bodyText ?? undefined
    );
    copyTextToClipboard(snippet).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied!", message: "curl command copied to clipboard." })
    );
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={METHOD_BADGE_VARIANT[endpoint.method] ?? "neutral"} size="lg">
          {endpoint.method.toUpperCase()}
        </Badge>
        <code className="truncate text-13 text-primary">{resolvedPath || endpoint.path}</code>
      </div>
      {endpoint.summary && <p className="text-13 text-secondary">{endpoint.summary}</p>}
      {endpoint.description && endpoint.description !== endpoint.summary && (
        <p className="text-12 text-tertiary">{endpoint.description}</p>
      )}

      {pathParams.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-12 font-semibold tracking-wide text-tertiary uppercase">Path parameters</span>
          {pathParams.map((param) => (
            <div key={param.name} className="flex flex-col gap-1">
              <label className="text-13 text-secondary">
                {param.name}
                {param.required && <span className="text-danger-primary"> *</span>}
              </label>
              <ParamInput
                parameter={param}
                value={pathValues[param.name] ?? ""}
                onChange={(value) => setPathValues((prev) => ({ ...prev, [param.name]: value }))}
              />
            </div>
          ))}
        </div>
      )}

      {queryParams.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="text-12 font-semibold tracking-wide text-tertiary uppercase">Query parameters</span>
          {queryParams.map((param) => (
            <div key={param.name} className="flex flex-col gap-1">
              <label className="text-13 text-secondary">
                {param.name}
                {param.required && <span className="text-danger-primary"> *</span>}
              </label>
              <ParamInput
                parameter={param}
                value={queryValues[param.name] ?? ""}
                onChange={(value) => setQueryValues((prev) => ({ ...prev, [param.name]: value }))}
              />
            </div>
          ))}
        </div>
      )}

      {hasBody && (
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-12 font-semibold tracking-wide text-tertiary uppercase">
              Body (JSON){endpoint.operation.requestBody?.required && <span className="text-danger-primary"> *</span>}
            </span>
            <Tooltip tooltipContent="Fill in a best-effort sample from the schema">
              <button
                type="button"
                onClick={handlePrefillBody}
                className="flex items-center gap-1 text-12 text-accent-primary hover:underline"
              >
                <Wand2 className="size-3" />
                Prefill
              </button>
            </Tooltip>
          </div>
          <textarea
            value={bodyText}
            onChange={(e) => setBodyText(e.target.value)}
            spellCheck={false}
            className="font-mono focus:border-accent-primary min-h-[160px] w-full rounded-md border border-subtle bg-layer-1 p-2 text-12 text-primary outline-none"
            placeholder="{}"
          />
          {bodyError && <p className="text-12 text-danger-primary">{bodyError}</p>}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Tooltip tooltipContent={executeGate.allowed ? undefined : (executeGate.reason ?? undefined)}>
          <Button
            variant="primary"
            size="sm"
            onClick={handleExecuteClick}
            loading={isExecuting}
            disabled={!executeGate.allowed || isExecuting}
          >
            Execute
          </Button>
        </Tooltip>
        <Button
          variant="neutral-primary"
          size="sm"
          onClick={handleCopyCurl}
          prependIcon={<Copy className="size-3.5" />}
        >
          Copy as curl
        </Button>
      </div>
      {!executeGate.allowed && executeGate.reason && <p className="text-12 text-tertiary">{executeGate.reason}</p>}
    </div>
  );
}
