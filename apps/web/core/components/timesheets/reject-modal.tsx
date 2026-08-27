/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { X } from "lucide-react";
// plane imports
import { Button, EModalPosition, EModalWidth, ModalCore, TextArea } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  onConfirm: (rejectionReason: string) => Promise<void>;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 3 "Workflow d'approbation de timesheet",
 * "Considérations API/UX") in plane-selfhost - "Modale de rejet imposant la
 * saisie du motif avant validation (champ obligatoire, pas de rejet
 * silencieux)". Mirrors LogTimeModal's shape (ce/components/issues/worklog/
 * create-modal.tsx) for the overall modal structure.
 */
export function TimesheetRejectModal(props: Props) {
  const { isOpen, handleClose, onConfirm } = props;
  const [reason, setReason] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetAndClose = () => {
    setReason("");
    handleClose();
  };

  const handleSubmit = async () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "A rejection reason is required." });
      return;
    }
    setIsSubmitting(true);
    try {
      await onConfirm(trimmed);
      resetAndClose();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to reject the timesheet period.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={resetAndClose} position={EModalPosition.CENTER} width={EModalWidth.SM}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center justify-between">
          <h4 className="text-18 font-medium text-primary">Reject timesheet</h4>
          <button onClick={resetAndClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1">
          <span className="text-13 font-medium text-secondary">Rejection reason (required)</span>
          <TextArea
            placeholder="Explain what needs to be corrected…"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            textAreaSize="sm"
            className="min-h-[90px] w-full"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle pt-4">
          <Button variant="neutral-primary" size="sm" onClick={resetAndClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            Reject
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
