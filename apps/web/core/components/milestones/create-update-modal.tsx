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
import type { IMilestone, TMilestoneWritePayload } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useMilestone } from "@/hooks/store/use-milestone";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  milestone: IMilestone | null;
};

const DEFAULTS: TMilestoneWritePayload = {
  name: "",
  description: "",
  target_date: null,
};

export const CreateUpdateMilestoneModal = observer(function CreateUpdateMilestoneModal(props: Props) {
  const { isOpen, handleClose, milestone } = props;
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { createMilestone, updateMilestone } = useMilestone();

  const [values, setValues] = useState<TMilestoneWritePayload>(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      milestone
        ? { name: milestone.name, description: milestone.description, target_date: milestone.target_date }
        : DEFAULTS
    );
  }, [milestone, isOpen]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !projectId || !values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("milestones.name") });
      return;
    }

    const payload: TMilestoneWritePayload = {
      name: values.name.trim(),
      description: values.description ?? "",
      target_date: values.target_date ?? null,
    };

    setIsSubmitting(true);
    try {
      if (milestone) {
        await updateMilestone(workspaceSlug.toString(), projectId.toString(), milestone.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("milestones.toast.update_success"),
        });
      } else {
        await createMilestone(workspaceSlug.toString(), projectId.toString(), payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("milestones.toast.create_success"),
        });
      }
      handleClose();
    } catch (error: any) {
      const message = error?.name?.[0] ?? t("milestones.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">
          {milestone ? t("milestones.update_milestone") : t("milestones.create_milestone")}
        </h3>
        <Input
          type="text"
          value={values.name ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
          placeholder={t("milestones.name")}
          className="w-full"
        />
        <TextArea
          value={values.description ?? ""}
          onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
          placeholder={t("milestones.description")}
          className="w-full"
          rows={4}
        />
        <div className="flex flex-col gap-1">
          <span className="text-11 text-secondary">{t("milestones.target_date")}</span>
          <Input
            type="date"
            value={values.target_date ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, target_date: e.target.value || null }))}
            className="w-full max-w-48"
          />
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {milestone ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
