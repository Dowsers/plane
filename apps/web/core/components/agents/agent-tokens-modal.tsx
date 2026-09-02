/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Plus } from "lucide-react";
import useSWR, { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAgentProfile, TAgentAPIToken } from "@plane/types";
import { AlertModalCore, Button, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { calculateTimeAgo, renderFormattedDate } from "@plane/utils";
// services
import { AgentService } from "@/services/agent.service";
// local imports
import { AgentTokenGeneratedDetails } from "./agent-token-generated-details";

const agentService = new AgentService();

const TOKENS_KEY = (workspaceSlug: string, agentId: string) => `AGENT_TOKENS_${workspaceSlug}_${agentId}`;

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  agent: IAgentProfile | null;
};

/**
 * Per-agent token management sub-view (spec's own "emettre/revoquer leurs
 * jetons", docs/feature-specs/09-ai-features.md "7. Type d'acteur agent de
 * premiere classe" in plane-selfhost, "Considerations API/UX" section) -
 * list existing tokens (label/created_at/last_used/active) with
 * issue/revoke actions. No mobx store, deliberately - same rationale as
 * `SLAPolicyListRoot`: this data has no cross-cutting consumer elsewhere
 * in the app, so plain service calls + SWR are enough.
 */
export function AgentTokensModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, agent } = props;
  const { t } = useTranslation();
  const [generatedToken, setGeneratedToken] = useState<TAgentAPIToken | null>(null);
  const [isIssuing, setIsIssuing] = useState(false);
  const [revokeTarget, setRevokeTarget] = useState<TAgentAPIToken | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);

  const agentId = agent?.id;
  const swrKey = isOpen && workspaceSlug && agentId ? TOKENS_KEY(workspaceSlug, agentId) : null;
  const { data: tokens, isLoading } = useSWR(swrKey, () =>
    agentId ? agentService.listTokens(workspaceSlug, agentId) : null
  );

  const refresh = () => {
    if (agentId) mutate(TOKENS_KEY(workspaceSlug, agentId));
  };

  const handleModalClose = () => {
    handleClose();
    setGeneratedToken(null);
  };

  const handleIssueToken = async () => {
    if (!agentId) return;
    setIsIssuing(true);
    try {
      const token = await agentService.createToken(workspaceSlug, agentId);
      setGeneratedToken(token);
      refresh();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("agents.tokens.errors.issue_failed");
      setToast({ type: TOAST_TYPE.ERROR, title: t("common.errors.default.title"), message });
    } finally {
      setIsIssuing(false);
    }
  };

  const handleRevoke = async () => {
    if (!agentId || !revokeTarget) return;
    setIsRevoking(true);
    try {
      await agentService.revokeToken(workspaceSlug, agentId, revokeTarget.id);
      setRevokeTarget(null);
      refresh();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.errors.default.title"),
        message: t("agents.tokens.errors.revoke_failed"),
      });
    } finally {
      setIsRevoking(false);
    }
  };

  if (!agent) return null;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleModalClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      {generatedToken ? (
        <AgentTokenGeneratedDetails handleClose={handleModalClose} tokenDetails={generatedToken} />
      ) : (
        <div className="flex max-h-[75vh] flex-col gap-4 overflow-y-auto p-5">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h4 className="text-16 font-medium text-primary">
                {t("agents.tokens.title", { name: agent.display_name })}
              </h4>
              <p className="text-12 text-tertiary">{t("agents.tokens.description")}</p>
            </div>
            <Button
              variant="primary"
              size="sm"
              prependIcon={<Plus className="h-3.5 w-3.5" />}
              onClick={handleIssueToken}
              loading={isIssuing}
              disabled={agent.status === "DISABLED"}
            >
              {t("agents.tokens.issue_new_token")}
            </Button>
          </div>

          {agent.status === "DISABLED" && (
            <p className="rounded-md bg-layer-1 px-2.5 py-1.5 text-11 text-tertiary">
              {t("agents.tokens.disabled_notice")}
            </p>
          )}

          {isLoading && (
            <Loader className="flex flex-col gap-2">
              <Loader.Item height="50px" />
              <Loader.Item height="50px" />
            </Loader>
          )}

          {!isLoading && (tokens?.length ?? 0) === 0 && (
            <p className="text-13 text-tertiary">{t("agents.tokens.no_tokens")}</p>
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
                      {token.is_active ? t("common.active") : t("agents.tokens.revoked")}
                    </span>
                  </div>
                  <span className="text-11 text-tertiary">
                    {t("agents.tokens.created")} {renderFormattedDate(token.created_at)}
                    {token.last_used
                      ? ` - ${t("agents.tokens.last_used")} ${calculateTimeAgo(token.last_used)}`
                      : ` - ${t("agents.tokens.never_used")}`}
                  </span>
                </div>
                {token.is_active && (
                  <Button variant="danger" size="sm" onClick={() => setRevokeTarget(token)}>
                    {t("agents.tokens.revoke")}
                  </Button>
                )}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
            <Button variant="neutral-primary" size="sm" onClick={handleModalClose}>
              {t("close")}
            </Button>
          </div>
        </div>
      )}

      <AlertModalCore
        isOpen={!!revokeTarget}
        handleClose={() => setRevokeTarget(null)}
        handleSubmit={handleRevoke}
        isSubmitting={isRevoking}
        title={t("agents.tokens.revoke_modal.title")}
        content={t("agents.tokens.revoke_modal.content", { label: revokeTarget?.label })}
      />
    </ModalCore>
  );
}
