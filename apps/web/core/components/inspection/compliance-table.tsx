/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle, Check, Clock, Minus, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TInspectionComplianceDocument, TInspectionCompliance } from "@plane/types";
import { Button, Loader, Tooltip } from "@plane/ui";
// local imports
import { INSPECTION_KIND_I18N, INSPECTION_RISK_I18N } from "./constants";
import { InspectionReviewModal } from "./review-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  compliance: TInspectionCompliance | null;
  onRefresh: () => void;
};

/**
 * The evidence an accreditation assessor actually asks to see: for each active
 * member of the engagement, which documents they signed, when, and what the
 * impartiality risk verdict was.
 *
 * Backend: `ProjectInspectionComplianceEndpoint`.
 */
export function InspectionComplianceTable(props: Props) {
  const { workspaceSlug, projectId, compliance, onRefresh } = props;
  const { t } = useTranslation();
  const [reviewing, setReviewing] = useState<string | null>(null);

  if (!compliance) {
    return (
      <Loader className="space-y-2">
        <Loader.Item height="36px" />
        <Loader.Item height="36px" />
      </Loader>
    );
  }

  const renderCell = (document: TInspectionComplianceDocument) => {
    if (!document.signed_at) {
      return (
        <Tooltip tooltipContent={t("project_settings.inspection.table.unsigned")}>
          <span className="text-sm inline-flex items-center gap-1 text-tertiary">
            <Minus className="size-4" />
          </span>
        </Tooltip>
      );
    }

    // Signed, but a disclosed conflict is still awaiting a verdict - the
    // obligation is NOT discharged yet, so this must not read as a green tick.
    if (document.review_status === "PENDING") {
      return (
        <button
          type="button"
          onClick={() => document.signature_id && setReviewing(document.signature_id)}
          className="text-sm text-amber-600 inline-flex items-center gap-1 hover:underline"
        >
          <Clock className="size-4" />
          {t("project_settings.inspection.table.pending_review")}
        </button>
      );
    }

    if (document.review_status === "REJECTED") {
      return (
        <span className="text-sm text-danger inline-flex items-center gap-1">
          <X className="size-4" />
          {t("project_settings.inspection.table.rejected")}
        </span>
      );
    }

    return (
      <span className="text-sm text-success inline-flex items-center gap-1.5">
        <Check className="size-4" />
        {document.declared_conflicts ? (
          <Tooltip
            tooltipContent={
              document.risk_level
                ? t("project_settings.inspection.table.accepted_with_risk", {
                    risk: t(INSPECTION_RISK_I18N[document.risk_level]),
                  })
                : t("project_settings.inspection.table.accepted_after_disclosure")
            }
          >
            <AlertTriangle className="text-amber-600 size-3.5" />
          </Tooltip>
        ) : null}
      </span>
    );
  };

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h4 className="text-base font-medium text-primary">{t("project_settings.inspection.table.title")}</h4>
            <p className="text-xs text-tertiary">{t("project_settings.inspection.table.description")}</p>
          </div>
          <Button variant="neutral-primary" size="sm" onClick={onRefresh}>
            {t("project_settings.inspection.table.refresh")}
          </Button>
        </div>

        {compliance.required_kinds.length === 0 ? (
          <p className="text-sm rounded border border-subtle bg-surface-2 p-4 text-tertiary">
            {/* No published document means nobody owes anything yet - worth
                saying plainly, since an empty table otherwise reads as a bug. */}
            {t("project_settings.inspection.table.no_documents")}
          </p>
        ) : (
          <div className="overflow-x-auto rounded border border-subtle">
            <table className="text-sm w-full text-left">
              <thead>
                <tr className="border-b border-subtle bg-surface-2">
                  <th className="px-3 py-2 font-medium text-secondary">
                    {t("project_settings.inspection.table.member")}
                  </th>
                  {compliance.required_kinds.map((kind) => (
                    <th key={kind} className="px-3 py-2 font-medium text-secondary">
                      {t(INSPECTION_KIND_I18N[kind])}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {compliance.members.map((row) => (
                  <tr key={row.member_id} className="border-b border-subtle last:border-0">
                    <td className="px-3 py-2 text-primary">{row.member_email ?? row.member_id}</td>
                    {compliance.required_kinds.map((kind) => {
                      const document = row.documents.find((item) => item.kind === kind);
                      return (
                        <td key={kind} className="px-3 py-2">
                          {document ? renderCell(document) : <Minus className="size-4 text-tertiary" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {reviewing ? (
        <InspectionReviewModal
          isOpen
          onClose={() => setReviewing(null)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          signatureId={reviewing}
          onReviewed={onRefresh}
        />
      ) : null}
    </>
  );
}
