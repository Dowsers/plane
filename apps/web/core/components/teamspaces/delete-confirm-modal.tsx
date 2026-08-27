/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { AlertTriangle } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { ITeamspace } from "@plane/types";
import { Input, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";

type Props = {
  isOpen: boolean;
  teamspace: ITeamspace;
  isSubmitting: boolean;
  handleClose: () => void;
  handleSubmit: () => void;
};

// Spec section 1, exigence 7 - deleting a Teamspace requires explicitly
// retyping its name, same pattern already used for Project deletion (see
// apps/web/core/components/project/delete-project-modal.tsx).
export function DeleteTeamspaceConfirmModal(props: Props) {
  const { isOpen, teamspace, isSubmitting, handleClose, handleSubmit } = props;
  const { t } = useTranslation();

  const [confirmName, setConfirmName] = useState("");

  const canDelete = confirmName.trim() === teamspace.name;

  const onClose = () => {
    setConfirmName("");
    handleClose();
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center rounded-full bg-danger-subtle p-2.5">
            <AlertTriangle className="h-5 w-5 text-danger-primary" aria-hidden="true" />
          </span>
          <h3 className="text-16 font-medium">{t("teamspaces.delete_confirm.title")}</h3>
        </div>
        <p className="text-13 text-secondary">{t("teamspaces.delete_confirm.description")}</p>
        <div className="flex flex-col gap-1">
          <p className="text-13 text-secondary">
            {t("teamspaces.delete_confirm.type_name_prompt")}{" "}
            <span className="font-medium text-primary">{teamspace.name}</span>
          </p>
          <Input
            type="text"
            value={confirmName}
            onChange={(e) => setConfirmName(e.target.value)}
            placeholder={teamspace.name}
            className="w-full"
            autoComplete="off"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="secondary" size="sm" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button variant="error-fill" size="sm" onClick={handleSubmit} loading={isSubmitting} disabled={!canDelete}>
            {t("delete")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
}
