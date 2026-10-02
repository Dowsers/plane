/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TInspectionMyDocument } from "@plane/types";
import { Button } from "@plane/ui";
// local imports
import { INSPECTION_KIND_I18N } from "./constants";
import { InspectionSigningModal } from "./signing-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  outstanding: TInspectionMyDocument[];
  /** The only document signable right now - documents are signed in a fixed
   * order and the server refuses out-of-order attempts, so offering a choice
   * would just produce a 409. */
  nextSignable: TInspectionMyDocument | undefined;
  gracePeriodDays: number;
  onSigned: () => void;
};

/**
 * The warning half of progressive enforcement (ISO/IEC 17020 §4.1/§4.2): shown
 * while a member still owes documents but their grace period has not elapsed, so
 * nothing is blocked yet.
 *
 * Deliberately NOT dismissible. A compliance obligation that can be hidden with
 * an X is one people forget until the day their access is cut off, which is the
 * outcome the grace period exists to avoid.
 */
export function InspectionNonComplianceBanner(props: Props) {
  const { workspaceSlug, projectId, outstanding, nextSignable, gracePeriodDays, onSigned } = props;
  const { t } = useTranslation();
  const [activeDocument, setActiveDocument] = useState<TInspectionMyDocument | null>(null);

  if (outstanding.length === 0) return null;

  const pendingReview = outstanding.filter((document) => document.signature?.review_status === "PENDING");
  // Everything still owed behind the next one, so the banner can say how many
  // steps remain instead of naming documents the member cannot act on yet.
  const queued = outstanding.filter((document) => document.kind !== nextSignable?.kind && !document.is_signed);

  return (
    <>
      <div className="border-amber-500/30 bg-amber-500/10 flex flex-wrap items-center gap-x-3 gap-y-2 border-b px-4 py-2.5">
        <AlertTriangle className="text-amber-600 size-4 shrink-0" />
        <div className="text-sm flex-1 text-primary">
          {nextSignable ? (
            <span>
              {t("project_settings.inspection.banner.next", {
                document: t(INSPECTION_KIND_I18N[nextSignable.kind]),
                days: gracePeriodDays,
              })}
              {queued.length > 0 ? (
                <span className="ml-1 text-secondary">
                  {t("project_settings.inspection.banner.followed_by", { count: queued.length })}
                </span>
              ) : null}
            </span>
          ) : null}
          {/* A declaration awaiting review is signed but not yet discharged -
              saying "please sign" would be wrong and confusing. */}
          {!nextSignable && pendingReview.length > 0 ? (
            <span>{t("project_settings.inspection.banner.awaiting_review")}</span>
          ) : null}
        </div>
        {nextSignable ? (
          <Button variant="primary" size="sm" onClick={() => setActiveDocument(nextSignable)}>
            {t("project_settings.inspection.banner.action")}
          </Button>
        ) : null}
      </div>

      {activeDocument ? (
        <InspectionSigningModal
          isOpen
          onClose={() => setActiveDocument(null)}
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          document={activeDocument}
          onSigned={onSigned}
        />
      ) : null}
    </>
  );
}
