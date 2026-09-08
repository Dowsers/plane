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
import type { ITeamspace, TTeamspaceWritePayload } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  teamspace: ITeamspace | null;
};

const DEFAULTS: TTeamspaceWritePayload = {
  name: "",
  description: "",
};

export const CreateUpdateTeamspaceModal = observer(function CreateUpdateTeamspaceModal(props: Props) {
  const { isOpen, handleClose, teamspace } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createTeamspace, updateTeamspace } = useTeamspace();

  const [values, setValues] = useState<TTeamspaceWritePayload>(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      teamspace
        ? {
            name: teamspace.name,
            description: teamspace.description,
          }
        : DEFAULTS
    );
  }, [teamspace, isOpen]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.name") });
      return;
    }

    const payload: TTeamspaceWritePayload = {
      name: values.name.trim(),
      description: values.description ?? "",
    };

    setIsSubmitting(true);
    try {
      if (teamspace) {
        await updateTeamspace(workspaceSlug.toString(), teamspace.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("teamspaces.toast.update_success"),
        });
      } else {
        await createTeamspace(workspaceSlug.toString(), payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("teamspaces.toast.create_success"),
        });
      }
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">
          {teamspace ? t("teamspaces.update_teamspace") : t("teamspaces.create_teamspace")}
        </h3>
        <div className="flex flex-col gap-1">
          <Input
            id="create-update-name"
            name="create-update-name"
            type="text"
            value={values.name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder={t("teamspaces.name")}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <TextArea
            value={values.description ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder={t("teamspaces.description")}
            className="w-full"
            rows={4}
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {teamspace ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
