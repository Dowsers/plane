/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Clock, Download, FileCheck2, X } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TMyInspectionSignature } from "@plane/types";
import { Button, Loader, Tooltip } from "@plane/ui";
// services
import { InspectionService } from "@/services/inspection.service";
// local imports
import { INSPECTION_KIND_I18N, INSPECTION_RISK_I18N } from "./constants";

const inspectionService = new InspectionService();

type Props = {
  /** Restrict to one project. Omit for the cross-workspace personal record. */
  projectId?: string;
  className?: string;
};

/**
 * The signer's own record of what they have signed, with the evidentiary PDF.
 *
 * Backed by `GET /users/me/inspection-signatures/`, which is user-scoped rather
 * than workspace-scoped: an evaluator needs one place to retrieve their own
 * undertakings, including for an engagement whose workspace they have since
 * left. Being outside any project URL also puts it outside the enforcement gate,
 * so it keeps working for somebody currently blocked.
 *
 * The same component serves both placements asked for - a personal page under
 * account settings, and a per-project section - by filtering client-side on
 * `projectId`. One request, one rendering, no second endpoint.
 */
export function MyInspectionSignatures(props: Props) {
  const { projectId, className } = props;
  const { t } = useTranslation();

  const [signatures, setSignatures] = useState<TMyInspectionSignature[] | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = useCallback(() => {
    inspectionService
      .listMySignatures()
      .then((data) => {
        setSignatures(data);
        return;
      })
      .catch(() => setSignatures([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleDownload = async (signature: TMyInspectionSignature) => {
    setDownloading(signature.id);
    try {
      await inspectionService.downloadSignaturePdf(signature.workspace_slug, signature.project_id, signature.id);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: (error as { error?: string })?.error ?? t("inspection.my_signatures.download_error"),
      });
    } finally {
      setDownloading(null);
    }
  };

  if (signatures === null) {
    return (
      <Loader className="space-y-2">
        <Loader.Item height="48px" />
        <Loader.Item height="48px" />
      </Loader>
    );
  }

  const rows = projectId ? signatures.filter((signature) => signature.project_id === projectId) : signatures;

  if (rows.length === 0) {
    return (
      <p className={className}>
        <span className="text-sm text-tertiary">{t("inspection.my_signatures.empty")}</span>
      </p>
    );
  }

  return (
    <div className={className}>
      <div className="overflow-x-auto rounded border border-subtle">
        <table className="text-sm w-full text-left">
          <thead>
            <tr className="border-b border-subtle bg-surface-2">
              <th className="px-3 py-2 font-medium text-secondary">{t("inspection.my_signatures.document")}</th>
              {/* Only shown on the cross-workspace page: inside a project it
                  would repeat the same value on every row. */}
              {projectId ? null : (
                <th className="px-3 py-2 font-medium text-secondary">{t("inspection.my_signatures.project")}</th>
              )}
              <th className="px-3 py-2 font-medium text-secondary">{t("inspection.my_signatures.signed_at")}</th>
              <th className="px-3 py-2 font-medium text-secondary">{t("inspection.my_signatures.status")}</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((signature) => (
              <tr key={signature.id} className="border-b border-subtle last:border-0">
                <td className="px-3 py-2 text-primary">
                  {t(INSPECTION_KIND_I18N[signature.kind])}
                  <span className="text-xs ml-1 text-tertiary">v{signature.version}</span>
                </td>
                {projectId ? null : (
                  <td className="px-3 py-2 text-secondary">
                    {signature.project_name}
                    <span className="text-xs ml-1 text-tertiary">({signature.workspace_name})</span>
                  </td>
                )}
                <td className="px-3 py-2 text-secondary">{new Date(signature.signed_at).toLocaleDateString()}</td>
                <td className="px-3 py-2">
                  {/* Signed is not the same as discharged: a disclosed conflict
                      waits on a manager, and saying "done" there would mislead. */}
                  {signature.review_status === "PENDING" ? (
                    <span className="text-amber-600 inline-flex items-center gap-1">
                      <Clock className="size-3.5" />
                      {t("inspection.my_signatures.pending_review")}
                    </span>
                  ) : signature.review_status === "REJECTED" ? (
                    <span className="text-danger inline-flex items-center gap-1">
                      <X className="size-3.5" />
                      {t("inspection.my_signatures.rejected")}
                    </span>
                  ) : (
                    <span className="text-success inline-flex items-center gap-1.5">
                      <FileCheck2 className="size-3.5" />
                      {t("inspection.my_signatures.accepted")}
                      {signature.declared_conflicts && signature.risk_level ? (
                        <Tooltip
                          tooltipContent={t("inspection.my_signatures.risk", {
                            risk: t(INSPECTION_RISK_I18N[signature.risk_level]),
                          })}
                        >
                          <AlertTriangle className="text-amber-600 size-3.5" />
                        </Tooltip>
                      ) : null}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button
                    variant="neutral-primary"
                    size="sm"
                    prependIcon={<Download className="size-3.5" />}
                    onClick={() => handleDownload(signature)}
                    loading={downloading === signature.id}
                    disabled={downloading === signature.id}
                  >
                    {t("inspection.my_signatures.download")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs mt-2 text-tertiary">{t("inspection.my_signatures.pdf_notice")}</p>
    </div>
  );
}
