/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TApiExplorerTokenScope } from "@plane/types";
import { Button, Input } from "@plane/ui";
import { copyTextToClipboard, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// local imports
import { apiExplorerService } from "./service";
import type { TActiveToken } from "./types";

type Props = {
  workspaceSlug: string;
  isAdmin: boolean;
  allowMembersExecute: boolean;
  activeToken: TActiveToken | null;
  onActiveTokenChange: (token: TActiveToken | null) => void;
};

type TMode = "paste" | "ephemeral";

const DEFAULT_TTL_SECONDS = 3600;

/**
 * Token setup panel (spec exigence 4/item 4). Two modes sharing a single
 * "bootstrap" input:
 *
 * - "Paste a token": the pasted value is used verbatim as the active
 *   token for every subsequent call.
 * - "Generate a temporary token": the SAME pasted value is used to
 *   authenticate the mint call itself, because
 *   `APIExplorerEphemeralTokenEndpoint` (like every `plane.api` view) is
 *   token-authenticated only (`X-Api-Key`, no session-cookie fallback -
 *   confirmed by reading `plane.api.views.base.BaseAPIView`) - there is no
 *   way to mint a first token out of thin air from a page the user is
 *   only viewing via their session cookie. In practice this means: the
 *   user needs at least one already-existing personal API token (created
 *   once via Profile Settings > API Tokens) to bootstrap with, after
 *   which they can trade it for a short-lived, narrower-scoped ephemeral
 *   token for the rest of the session instead of using their real
 *   long-lived one directly. This bootstrap requirement is a real,
 *   unavoidable consequence of the backend's own auth design, not a
 *   frontend choice - documented here and in this feature's final report
 *   rather than worked around by guessing at a different backend
 *   contract.
 */
export function TokenPanel({ workspaceSlug, isAdmin, allowMembersExecute, activeToken, onActiveTokenChange }: Props) {
  const [mode, setMode] = useState<TMode>("paste");
  const [bootstrapValue, setBootstrapValue] = useState("");
  const [scope, setScope] = useState<TApiExplorerTokenScope>("read_only");
  const [ttlSeconds, setTtlSeconds] = useState(DEFAULT_TTL_SECONDS);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);

  const canRequestReadWrite = isAdmin || allowMembersExecute;

  const handleUsePastedToken = () => {
    if (!bootstrapValue.trim()) return;
    onActiveTokenChange({ value: bootstrapValue.trim(), scope: null, source: "pasted", expiresAt: null });
    setError(null);
  };

  const handleGenerateEphemeral = async () => {
    if (!bootstrapValue.trim()) {
      setError("Paste one of your existing API tokens first - it is needed to authenticate this request.");
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const result = await apiExplorerService.mintEphemeralToken(workspaceSlug, bootstrapValue.trim(), {
        scope,
        ttl_seconds: ttlSeconds,
      });
      if (result.status >= 200 && result.status < 300) {
        onActiveTokenChange({
          value: result.data.token,
          scope: result.data.scope,
          source: "ephemeral",
          expiresAt: result.data.expired_at,
        });
        setIsRevealed(true);
      } else {
        const message =
          (result.data as unknown as { error?: string })?.error ??
          result.error ??
          `The server rejected this request (HTTP ${result.status}).`;
        setError(message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!activeToken) return;
    copyTextToClipboard(activeToken.value).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied!", message: "Token copied to clipboard." })
    );
  };

  if (activeToken) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-subtle p-3">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 text-tertiary" />
          <span className="text-13 font-medium text-primary">Active token</span>
          <Badge variant={activeToken.source === "ephemeral" ? "brand" : "neutral"} size="sm">
            {activeToken.source === "ephemeral" ? "Ephemeral" : "Pasted"}
          </Badge>
          {activeToken.scope && (
            <Badge variant={activeToken.scope === "read_only" ? "neutral" : "warning"} size="sm">
              {activeToken.scope}
            </Badge>
          )}
          {activeToken.expiresAt && (
            <span className="text-12 text-tertiary">
              Expires {renderFormattedDate(activeToken.expiresAt)} at {renderFormattedTime(activeToken.expiresAt)}
            </span>
          )}
          <Button variant="neutral-primary" size="sm" onClick={() => onActiveTokenChange(null)} className="ml-auto">
            Change token
          </Button>
        </div>
        <div className="font-mono flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-12">
          <span className="flex-1 truncate">{isRevealed ? activeToken.value : "•".repeat(32)}</span>
          <Tooltip tooltipContent={isRevealed ? "Hide" : "Reveal"}>
            <button type="button" onClick={() => setIsRevealed((prev) => !prev)}>
              {isRevealed ? <EyeOff className="size-3.5 text-tertiary" /> : <Eye className="size-3.5 text-tertiary" />}
            </button>
          </Tooltip>
          <Tooltip tooltipContent="Copy">
            <button type="button" onClick={handleCopy}>
              <Copy className="size-3.5 text-tertiary" />
            </button>
          </Tooltip>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle p-3">
      <div className="flex items-center gap-2">
        <KeyRound className="size-4 text-tertiary" />
        <span className="text-13 font-medium text-primary">Set up a token to start exploring</span>
      </div>
      <p className="text-12 text-tertiary">
        Browsing the schema and executing real calls both require one of your own API tokens (Profile Settings &gt; API
        Tokens). Paste one below, then either use it directly or trade it for a short-lived one scoped to this session.
      </p>
      <Input
        placeholder="Paste an existing API token"
        value={bootstrapValue}
        onChange={(e) => setBootstrapValue(e.target.value)}
        inputSize="sm"
        type="password"
      />
      <div className="flex items-center gap-1 text-12">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={`rounded-md px-2 py-1 ${mode === "paste" ? "bg-layer-2 text-primary" : "text-tertiary"}`}
        >
          Use this token
        </button>
        <button
          type="button"
          onClick={() => setMode("ephemeral")}
          className={`rounded-md px-2 py-1 ${mode === "ephemeral" ? "bg-layer-2 text-primary" : "text-tertiary"}`}
        >
          Generate a temporary token
        </button>
      </div>

      {mode === "paste" && (
        <div>
          <Button variant="primary" size="sm" onClick={handleUsePastedToken} disabled={!bootstrapValue.trim()}>
            Use this token
          </Button>
        </div>
      )}

      {mode === "ephemeral" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-12 font-medium text-secondary">Scope</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-13">
                <input type="radio" checked={scope === "read_only"} onChange={() => setScope("read_only")} />
                Read only
              </label>
              <Tooltip
                tooltipContent={
                  canRequestReadWrite
                    ? undefined
                    : "Only Admins (or Members, if this workspace allows it below) can request a read-write token."
                }
              >
                <label
                  className={`flex items-center gap-1.5 text-13 ${canRequestReadWrite ? "" : "opacity-50"}`}
                  aria-disabled={!canRequestReadWrite}
                >
                  <input
                    type="radio"
                    checked={scope === "read_write"}
                    disabled={!canRequestReadWrite}
                    onChange={() => setScope("read_write")}
                  />
                  Read &amp; write
                </label>
              </Tooltip>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-12 font-medium text-secondary">Lifetime (seconds, max 3600)</span>
            <Input
              type="number"
              min={60}
              max={3600}
              value={ttlSeconds}
              onChange={(e) => setTtlSeconds(Number(e.target.value) || DEFAULT_TTL_SECONDS)}
              inputSize="sm"
            />
          </div>
          <div>
            <Button variant="primary" size="sm" onClick={handleGenerateEphemeral} loading={isGenerating}>
              Generate token
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-12 text-danger-primary">{error}</p>}
    </div>
  );
}
