/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ITeam, TTeamWritePayload } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useTeam } from "@/hooks/store/use-team";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  team: ITeam | null;
};

const DEFAULTS: TTeamWritePayload = {
  name: "",
  description: "",
};

export const CreateUpdateTeamModal = observer(function CreateUpdateTeamModal(props: Props) {
  const { isOpen, handleClose, team } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createTeam, updateTeam } = useTeam();

  const [values, setValues] = useState<TTeamWritePayload>(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      team
        ? {
            name: team.name,
            description: team.description,
          }
        : DEFAULTS
    );
  }, [team, isOpen]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teams.name") });
      return;
    }

    const payload: TTeamWritePayload = {
      name: values.name.trim(),
      description: values.description ?? "",
    };

    setIsSubmitting(true);
    try {
      if (team) {
        await updateTeam(workspaceSlug.toString(), team.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("teams.toast.update_success") });
      } else {
        await createTeam(workspaceSlug.toString(), payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("teams.toast.create_success") });
      }
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teams.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{team ? t("teams.update_team") : t("teams.create_team")}</h3>
        <div className="flex flex-col gap-1">
          <Input
            id="create-update-name"
            name="create-update-name"
            type="text"
            value={values.name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder={t("teams.name")}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <TextArea
            value={values.description ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder={t("teams.description")}
            className="w-full"
            rows={4}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {team ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
