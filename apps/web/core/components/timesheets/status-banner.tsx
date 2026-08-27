/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import type { TTimesheetPeriod } from "@plane/types";
import { Button } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";

const STATUS_PILL_VARIANT: Record<TTimesheetPeriod["status"], EPillVariant> = {
  draft: EPillVariant.DEFAULT,
  submitted: EPillVariant.INFO,
  approved: EPillVariant.SUCCESS,
  rejected: EPillVariant.ERROR,
};

const STATUS_LABEL: Record<TTimesheetPeriod["status"], string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved",
  rejected: "Rejected",
};

type Props = {
  period: TTimesheetPeriod;
  onSubmit?: () => void;
  isSubmitting?: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 3 "Workflow d'approbation de timesheet",
 * "Considérations API/UX") in plane-selfhost - "un bandeau de statut par
 * période (Brouillon/Soumis/Approuvé/Rejeté) avec bouton 'Soumettre pour
 * approbation' quand applicable, et affichage du motif de rejet le cas
 * échéant" - rendered per-`TimesheetPeriod` row on the "My time" surface.
 */
export const TimesheetStatusBanner = observer(function TimesheetStatusBanner(props: Props) {
  const { period, onSubmit, isSubmitting } = props;

  return (
    <div className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle bg-layer-1 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-13 font-medium text-primary">{period.project_detail?.name ?? "—"}</span>
          <span className="text-12 text-tertiary">
            {renderFormattedDate(period.period_start)} – {renderFormattedDate(period.period_end)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Pill variant={STATUS_PILL_VARIANT[period.status]} size={EPillSize.SM}>
            {STATUS_LABEL[period.status]}
          </Pill>
          {(period.status === "draft" || period.status === "rejected") && onSubmit && (
            <Button variant="primary" size="sm" onClick={onSubmit} loading={isSubmitting}>
              Submit for approval
            </Button>
          )}
        </div>
      </div>
      {period.status === "rejected" && period.rejection_reason && (
        <p className="text-12 text-danger-primary">
          <span className="font-medium">Rejection reason:</span> {period.rejection_reason}
        </p>
      )}
    </div>
  );
});
