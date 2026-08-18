/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { TAIGenerationStatus } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Loader, ModalCore } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// services
import { ProjectUpdateService } from "@/services/project-update.service";

const projectUpdateService = new ProjectUpdateService();
const PER_PAGE = 20;

const STATUS_PILL_VARIANT: Record<TAIGenerationStatus, EPillVariant> = {
  SUCCESS: EPillVariant.SUCCESS,
  FAILED: EPillVariant.ERROR,
  TIMEOUT: EPillVariant.WARNING,
  PENDING: EPillVariant.DEFAULT,
};

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
};

/**
 * Admin-only (PROJECT level, matching `ProjectUpdateAIGenerationLogEndpoint`'s
 * own gating - apps/api/plane/app/views/project_update/ai_draft.py, not a
 * workspace-level permission) read-only audit trail for category 9 feature 6
 * ("Redaction assistee des mises a jour de statut", exigence 13). Kept as a
 * minimal modal triggered from the project's Updates tab rather than the
 * workspace-level Settings > AI page the spec's own wording points to
 * (`docs/feature-specs/09-ai-features.md`'s "un lien vers les logs
 * d'audit") - the underlying endpoint is project-scoped, and that page has
 * no project context to link into. Structurally mirrors the sibling
 * `WorkflowTransitionAuditLogRoot`
 * (apps/web/core/components/governed-workflows/audit-log-root.tsx) - cursor
 * pagination, a status pill, a relative timestamp - but as a small modal
 * rather than a full settings tab, since this is an audit convenience, not
 * a primary UX surface.
 */
export const ProjectUpdateAIGenerationLogModal = observer(function ProjectUpdateAIGenerationLogModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const [cursor, setCursor] = useState<string | undefined>(undefined);

  const { data, isLoading } = useSWR(
    isOpen ? ["PROJECT_UPDATE_AI_GENERATION_LOGS", workspaceSlug, projectId, cursor] : null,
    () => projectUpdateService.getAIGenerationLogs(workspaceSlug, projectId, { per_page: PER_PAGE, cursor })
  );

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("project_updates.audit_log.title")}</h3>

        <div className="overflow-x-auto">
          <table className="w-full text-13">
            <thead>
              <tr className="border-b border-subtle text-left text-tertiary">
                <th className="py-2 pr-3 font-medium">Status</th>
                <th className="py-2 pr-3 font-medium">Triggered by</th>
                <th className="py-2 pr-3 font-medium">Provider / model</th>
                <th className="py-2 pr-3 font-medium">Tokens</th>
                <th className="py-2 pr-3 font-medium">When</th>
                <th className="py-2 pr-3 font-medium">Error</th>
              </tr>
            </thead>
            <tbody>
              {data?.results.map((log) => {
                const latencyMs = log.token_usage?.latency_ms;
                return (
                  <tr key={log.id} className="border-b border-subtle-1 align-top">
                    <td className="py-2 pr-3">
                      <Pill variant={STATUS_PILL_VARIANT[log.status]} size={EPillSize.SM}>
                        {log.status}
                      </Pill>
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-secondary">
                      {log.triggered_by_detail?.display_name ?? "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-secondary">
                      {[log.provider, log.model_name].filter(Boolean).join(" / ") || "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-secondary">
                      {typeof latencyMs === "number" ? `${latencyMs}ms` : "—"}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-tertiary">{calculateTimeAgo(log.created_at)}</td>
                    <td className="text-danger py-2 pr-3">{log.error_message ?? ""}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isLoading && (
            <Loader className="mt-2 flex flex-col gap-2">
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
              <Loader.Item height="32px" />
            </Loader>
          )}
          {!isLoading && (data?.results.length ?? 0) === 0 && (
            <p className="py-6 text-center text-13 text-tertiary">{t("project_updates.audit_log.empty")}</p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 border-t border-subtle pt-3">
          <div className="flex items-center gap-2">
            <Button
              variant="neutral-primary"
              size="sm"
              disabled={!data?.prev_page_results || !data?.prev_cursor}
              onClick={() => setCursor(data?.prev_cursor)}
            >
              Previous
            </Button>
            <Button
              variant="neutral-primary"
              size="sm"
              disabled={!data?.next_page_results || !data?.next_cursor}
              onClick={() => setCursor(data?.next_cursor)}
            >
              Next
            </Button>
          </div>
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("close")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
