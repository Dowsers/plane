/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Copy, Eye, EyeOff, KeyRound } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
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
  const { t } = useTranslation();
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
      setError(t("api_explorer.token_panel.errors.bootstrap_required"));
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
          t("api_explorer.token_panel.errors.request_rejected", { status: result.status });
        setError(message);
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopy = () => {
    if (!activeToken) return;
    copyTextToClipboard(activeToken.value).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.copied"),
        message: t("api_explorer.token_panel.copied_message"),
      })
    );
  };

  if (activeToken) {
    return (
      <div className="flex flex-col gap-2 rounded-md border border-subtle p-3">
        <div className="flex flex-wrap items-center gap-2">
          <KeyRound className="size-4 text-tertiary" />
          <span className="text-13 font-medium text-primary">{t("api_explorer.token_panel.active_token")}</span>
          <Badge variant={activeToken.source === "ephemeral" ? "brand" : "neutral"} size="sm">
            {activeToken.source === "ephemeral"
              ? t("api_explorer.token_panel.ephemeral")
              : t("api_explorer.token_panel.pasted")}
          </Badge>
          {activeToken.scope && (
            <Badge variant={activeToken.scope === "read_only" ? "neutral" : "warning"} size="sm">
              {activeToken.scope}
            </Badge>
          )}
          {activeToken.expiresAt && (
            <span className="text-12 text-tertiary">
              {t("api_explorer.token_panel.expires_at", {
                date: renderFormattedDate(activeToken.expiresAt),
                time: renderFormattedTime(activeToken.expiresAt),
              })}
            </span>
          )}
          <Button variant="neutral-primary" size="sm" onClick={() => onActiveTokenChange(null)} className="ml-auto">
            {t("api_explorer.token_panel.change_token")}
          </Button>
        </div>
        <div className="font-mono flex items-center gap-2 rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-12">
          <span className="flex-1 truncate">{isRevealed ? activeToken.value : "•".repeat(32)}</span>
          <Tooltip
            tooltipContent={isRevealed ? t("api_explorer.token_panel.hide") : t("api_explorer.token_panel.reveal")}
          >
            <button type="button" onClick={() => setIsRevealed((prev) => !prev)}>
              {isRevealed ? <EyeOff className="size-3.5 text-tertiary" /> : <Eye className="size-3.5 text-tertiary" />}
            </button>
          </Tooltip>
          <Tooltip tooltipContent={t("api_explorer.token_panel.copy")}>
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
        <span className="text-13 font-medium text-primary">{t("api_explorer.token_panel.setup_title")}</span>
      </div>
      <p className="text-12 text-tertiary">{t("api_explorer.token_panel.setup_description")}</p>
      <Input
        id="token-bootstrap-value"
        name="token-bootstrap-value"
        placeholder={t("api_explorer.token_panel.paste_placeholder")}
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
          {t("api_explorer.token_panel.use_this_token")}
        </button>
        <button
          type="button"
          onClick={() => setMode("ephemeral")}
          className={`rounded-md px-2 py-1 ${mode === "ephemeral" ? "bg-layer-2 text-primary" : "text-tertiary"}`}
        >
          {t("api_explorer.token_panel.generate_temporary_token")}
        </button>
      </div>

      {mode === "paste" && (
        <div>
          <Button variant="primary" size="sm" onClick={handleUsePastedToken} disabled={!bootstrapValue.trim()}>
            {t("api_explorer.token_panel.use_this_token")}
          </Button>
        </div>
      )}

      {mode === "ephemeral" && (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-12 font-medium text-secondary">{t("api_explorer.token_panel.scope")}</span>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-1.5 text-13">
                <input
                  id="token-scope-read-only"
                  name="token-scope"
                  type="radio"
                  checked={scope === "read_only"}
                  onChange={() => setScope("read_only")}
                />
                {t("api_explorer.token_panel.read_only")}
              </label>
              <Tooltip
                tooltipContent={
                  canRequestReadWrite ? undefined : t("api_explorer.token_panel.read_write_restricted_tooltip")
                }
              >
                <label
                  className={`flex items-center gap-1.5 text-13 ${canRequestReadWrite ? "" : "opacity-50"}`}
                  aria-disabled={!canRequestReadWrite}
                >
                  <input
                    id="token-scope-read-write"
                    name="token-scope"
                    type="radio"
                    checked={scope === "read_write"}
                    disabled={!canRequestReadWrite}
                    onChange={() => setScope("read_write")}
                  />
                  {t("api_explorer.token_panel.read_write")}
                </label>
              </Tooltip>
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-12 font-medium text-secondary">{t("api_explorer.token_panel.lifetime")}</span>
            <Input
              id="token-ttl-seconds"
              name="token-ttl-seconds"
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
              {t("api_explorer.token_panel.generate_token")}
            </Button>
          </div>
        </div>
      )}

      {error && <p className="text-12 text-danger-primary">{error}</p>}
    </div>
  );
}
