/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { FileSignature, Lock } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import type { TInspectionMyDocument } from "@plane/types";
import { Button } from "@plane/ui";
// local imports
import { INSPECTION_KIND_I18N } from "./constants";
import { InspectionSigningModal } from "./signing-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
  projectName?: string;
  blocked: TInspectionMyDocument[];
  onSigned: () => void;
};

/**
 * Rendered IN PLACE OF the project once a member's grace period has elapsed
 * (ISO/IEC 17020 §4.1/§4.2) - the blocking half of progressive enforcement.
 *
 * This exists because the decision was taken to block reads as well as writes,
 * which means every ordinary project request now 403s with
 * `INSPECTION_SIGNATURE_REQUIRED`. Letting those surface as raw errors would
 * leave the user stranded with no explanation and no way forward, so the project
 * subtree is replaced by this screen - the one route out.
 *
 * It follows `ProjectAccessRestriction`'s role (a full-page replacement inside
 * `ProjectAuthWrapper`) rather than being a modal: a modal implies there is
 * something usable behind it, and here there is not.
 */
export function InspectionBlockedScreen(props: Props) {
  const { workspaceSlug, projectId, projectName, blocked, onSigned } = props;
  const { t } = useTranslation();
  const [activeDocument, setActiveDocument] = useState<TInspectionMyDocument | null>(null);

  const unsigned = blocked.filter((document) => !document.signature);
  const awaitingReview = blocked.filter((document) => document.signature?.review_status === "PENDING");
  const refused = blocked.filter((document) => document.signature?.review_status === "REJECTED");

  return (
    <>
      <div className="flex h-full w-full items-center justify-center p-6">
        <div className="w-full max-w-xl space-y-5 text-center">
          <div className="bg-amber-500/15 mx-auto flex size-12 items-center justify-center rounded-full">
            <Lock className="text-amber-600 size-6" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-semibold text-primary">{t("project_settings.inspection.blocked.title")}</h2>
            <p className="text-sm text-secondary">
              {t("project_settings.inspection.blocked.description", {
                project: projectName ?? t("project_settings.inspection.blocked.this_project"),
              })}
            </p>
          </div>

          {unsigned.length > 0 ? (
            <div className="space-y-2 rounded border border-subtle bg-surface-2 p-4 text-left">
              <p className="text-xs font-medium tracking-wide text-tertiary uppercase">
                {t("project_settings.inspection.blocked.to_sign")}
              </p>
              <ul className="space-y-2">
                {unsigned.map((document) => (
                  <li key={document.kind} className="flex items-center justify-between gap-3">
                    <span className="text-sm flex items-center gap-2 text-primary">
                      <FileSignature className="size-4 text-tertiary" />
                      {t(INSPECTION_KIND_I18N[document.kind])}
                    </span>
                    <Button variant="primary" size="sm" onClick={() => setActiveDocument(document)}>
                      {t("project_settings.inspection.blocked.sign_now")}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Signed, but a disclosed conflict still needs a manager's verdict -
              nothing the signer can do, so no button. */}
          {awaitingReview.length > 0 ? (
            <p className="border-sky-500/30 bg-sky-500/10 text-sm rounded border p-3 text-secondary">
              {t("project_settings.inspection.blocked.awaiting_review")}
            </p>
          ) : null}

          {refused.length > 0 ? (
            <p className="border-red-500/30 bg-red-500/10 text-sm rounded border p-3 text-secondary">
              {t("project_settings.inspection.blocked.refused")}
            </p>
          ) : null}
        </div>
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
