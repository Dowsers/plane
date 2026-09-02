/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
import { CopyIcon } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSCIMToken } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
import { calculateTimeAgo, copyTextToClipboard, joinUrlPath, renderFormattedDate } from "@plane/utils";
import { useTranslation } from "@plane/i18n";
// components
import { resolveAbsoluteUrl } from "@/components/api-explorer/utils";
// services
import workspaceSCIMService from "@/services/workspace-scim.service";
// local imports
import { CreateSCIMTokenModal } from "./create-scim-token-modal";

type Props = {
  workspaceSlug: string;
};

const TOKENS_KEY = (workspaceSlug: string) => `WORKSPACE_SCIM_TOKENS_${workspaceSlug}`;

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 2 ("SCIM 2.0 natif") - Workspace Settings >
 * Security > SCIM Provisioning > token management. No mobx store,
 * deliberately - same rationale category 9's `AgentTokensModal`
 * (apps/web/core/components/agents/agent-tokens-modal.tsx) already used
 * for its own per-agent tokens: this data has no cross-cutting consumer
 * elsewhere in the app, plain service calls + SWR are enough.
 */
export const SCIMTokenPanel = observer(function SCIMTokenPanel(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  // state
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TSCIMToken | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const { data: tokens, isLoading } = useSWR(TOKENS_KEY(workspaceSlug), () =>
    workspaceSCIMService.listTokens(workspaceSlug)
  );

  // Exigence: "copie de la Base URL prete a coller dans l'IdP" - a static
  // value (this instance's `/api/scim/v2/` root), never per-token.
  // `resolveAbsoluteUrl` (api-explorer/utils.ts, category 8) already
  // solves "give me an absolute URL even when `API_BASE_URL` is the empty
  // same-origin-proxied default" - reused as-is rather than re-implemented.
  const baseUrl = resolveAbsoluteUrl(joinUrlPath("/api/scim/v2/"));

  const refresh = () => mutate(TOKENS_KEY(workspaceSlug));

  const copyBaseUrl = () => {
    copyTextToClipboard(baseUrl).then(() =>
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("scim.token_panel.toast.copied_title"),
        message: t("scim.token_panel.toast.copied_message"),
      })
    );
  };

  const handleRevoke = async () => {
    if (!revokeTarget) return;
    setIsRevoking(true);
    try {
      await workspaceSCIMService.revokeToken(workspaceSlug, revokeTarget.id);
      setRevokeTarget(null);
      refresh();
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("scim.token_panel.toast.revoke_failed_title"),
        message: err?.error ?? t("scim.token_panel.toast.revoke_failed_message"),
      });
    } finally {
      setIsRevoking(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <span className="text-caption-sm-medium text-tertiary uppercase">{t("scim.token_panel.base_url")}</span>
        <button
          type="button"
          onClick={copyBaseUrl}
          className="flex w-full max-w-md items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-2 px-3 py-2 text-left text-body-xs-regular"
        >
          <span className="truncate">{baseUrl}</span>
          <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
        </button>
      </div>

      <div className="flex items-center justify-between">
        <p className="text-13 text-tertiary">{t("scim.token_panel.description")}</p>
        <Button
          variant="primary"
          size="sm"
          prependIcon={<Plus className="h-3.5 w-3.5" />}
          onClick={() => setIsCreateOpen(true)}
        >
          {t("scim.create_token_modal.submit")}
        </Button>
      </div>

      {isLoading && (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      )}

      {!isLoading && (tokens?.length ?? 0) === 0 && (
        <p className="rounded-lg border border-subtle bg-layer-2 px-4 py-6 text-center text-13 text-tertiary">
          {t("scim.token_panel.empty")}
        </p>
      )}

      <div className="flex flex-col gap-2">
        {tokens?.map((token) => (
          <div
            key={token.id}
            className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2"
          >
            <div className="flex min-w-0 flex-col">
              <div className="flex items-center gap-2">
                <span className="truncate text-13 font-medium text-primary">{token.label}</span>
                <span
                  className={`flex h-4 max-h-fit items-center rounded-xs px-2 text-11 font-medium ${
                    token.is_active ? "bg-success-subtle text-success-primary" : "bg-layer-1 text-placeholder"
                  }`}
                >
                  {token.is_active ? t("scim.token_panel.status_active") : t("scim.token_panel.status_revoked")}
                </span>
              </div>
              <span className="text-11 text-tertiary">
                {t("scim.token_panel.created_at", { date: renderFormattedDate(token.created_at) })}
                {token.last_used_at
                  ? t("scim.token_panel.last_used", { time: calculateTimeAgo(token.last_used_at) })
                  : t("scim.token_panel.never_used")}
              </span>
            </div>
            {token.is_active && (
              <Button variant="error-fill" size="sm" onClick={() => setRevokeTarget(token)}>
                {t("scim.token_panel.revoke")}
              </Button>
            )}
          </div>
        ))}
      </div>

      <CreateSCIMTokenModal
        isOpen={isCreateOpen}
        workspaceSlug={workspaceSlug}
        baseUrl={baseUrl}
        onClose={() => setIsCreateOpen(false)}
        onCreated={refresh}
      />

      <AlertModalCore
        isOpen={!!revokeTarget}
        handleClose={() => setRevokeTarget(null)}
        handleSubmit={handleRevoke}
        isSubmitting={isRevoking}
        title={t("scim.token_panel.revoke_modal.title")}
        content={t("scim.token_panel.revoke_modal.content", { label: revokeTarget?.label })}
      />
    </div>
  );
});
