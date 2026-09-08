/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueWorklog } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateDropdown } from "@/components/dropdowns/date";
// helpers
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local
import { durationPartsToMinutes } from "./utils";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  /** When set, the modal edits this existing entry instead of creating a new one. */
  worklog?: TIssueWorklog | null;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1, "Considérations API/UX" - "Modale/formulaire léger
 * de saisie : durée (champ heures/minutes), date de prestation (sélecteur,
 * défaut = aujourd'hui), description optionnelle.") in plane-selfhost.
 * Structurally mirrors SLAPolicyFormModal
 * (apps/web/core/components/sla-policies/policy-form-modal.tsx) for its
 * overall shape (local form state, ModalCore, setToast on failure).
 */
export function LogTimeModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, issueId, worklog } = props;
  const { t } = useTranslation();
  const { createWorklog, updateWorklog } = useIssueDetail();

  const [hours, setHours] = useState(worklog ? String(Math.floor(worklog.duration / 60)) : "");
  const [minutes, setMinutes] = useState(worklog ? String(worklog.duration % 60) : "");
  const [loggedAt, setLoggedAt] = useState<string>(worklog?.logged_at ?? renderFormattedPayloadDate(new Date()) ?? "");
  const [description, setDescription] = useState(worklog?.description ?? "");
  const [isSaving, setIsSaving] = useState(false);

  const resetAndClose = () => {
    setHours("");
    setMinutes("");
    setLoggedAt(renderFormattedPayloadDate(new Date()) ?? "");
    setDescription("");
    handleClose();
  };

  const handleSave = async () => {
    const duration = durationPartsToMinutes(hours, minutes);
    if (duration < 1) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Enter a duration of at least 1 minute." });
      return;
    }
    if (!loggedAt) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Select the date the work was performed." });
      return;
    }

    setIsSaving(true);
    try {
      const payload: Partial<TIssueWorklog> = { duration, logged_at: loggedAt, description };
      if (worklog) {
        await updateWorklog(workspaceSlug, projectId, issueId, worklog.id, payload);
      } else {
        await createWorklog(workspaceSlug, projectId, issueId, payload);
      }
      resetAndClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to save the time entry.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={resetAndClose} position={EModalPosition.CENTER} width={EModalWidth.SM}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-18 font-medium text-primary">{worklog ? t("common.update") : t("common.add")}</h4>
          <button onClick={resetAndClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Duration</span>
          <div className="flex items-center gap-2">
            <Input
              id="create-hours"
              name="create-hours"
              type="number"
              min={0}
              placeholder="Hours"
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              inputSize="sm"
              className="flex-1"
            />
            <Input
              id="create-minutes"
              name="create-minutes"
              type="number"
              min={0}
              max={59}
              placeholder="Minutes"
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              inputSize="sm"
              className="flex-1"
            />
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Date</span>
          <DateDropdown
            value={loggedAt}
            onChange={(val) => setLoggedAt(val ? (renderFormattedPayloadDate(val) ?? "") : "")}
            maxDate={getDate(new Date())}
            buttonVariant="border-with-text"
            placeholder="Select date"
            className="w-full"
          />
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Description (optional)</span>
          <TextArea
            placeholder="What did you work on?"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            textAreaSize="sm"
            className="min-h-[70px] w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
          <Button variant="neutral-primary" size="sm" onClick={resetAndClose} disabled={isSaving}>
            {t("common.cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving}>
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
