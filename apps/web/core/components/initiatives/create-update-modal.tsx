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
import type { IInitiative, TInitiativeWritePayload } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  initiative: IInitiative | null;
};

const DEFAULTS: TInitiativeWritePayload = {
  name: "",
  description: "",
  lead_id: null,
  start_date: null,
  target_date: null,
};

export const CreateUpdateInitiativeModal = observer(function CreateUpdateInitiativeModal(props: Props) {
  const { isOpen, handleClose, initiative } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createInitiative, updateInitiative } = useInitiative();

  const [values, setValues] = useState<TInitiativeWritePayload>(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      initiative
        ? {
            name: initiative.name,
            description: initiative.description,
            lead_id: initiative.lead_id,
            start_date: initiative.start_date,
            target_date: initiative.target_date,
          }
        : DEFAULTS
    );
  }, [initiative, isOpen]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.name") });
      return;
    }

    const payload: TInitiativeWritePayload = {
      name: values.name.trim(),
      description: values.description ?? "",
      lead_id: values.lead_id ?? null,
      start_date: values.start_date ?? null,
      target_date: values.target_date ?? null,
    };

    setIsSubmitting(true);
    try {
      if (initiative) {
        await updateInitiative(workspaceSlug.toString(), initiative.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("initiatives.toast.update_success"),
        });
      } else {
        await createInitiative(workspaceSlug.toString(), payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("initiatives.toast.create_success"),
        });
      }
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">
          {initiative ? t("initiatives.update_initiative") : t("initiatives.create_initiative")}
        </h3>
        <div className="flex flex-col gap-1">
          <Input
            id="create-update-name"
            name="create-update-name"
            type="text"
            value={values.name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder={t("initiatives.name")}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <TextArea
            value={values.description ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder={t("initiatives.description")}
            className="w-full"
            rows={4}
          />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <span className="text-11 text-secondary">{t("initiatives.lead")}</span>
            <MemberDropdown
              multiple={false}
              value={values.lead_id ?? null}
              onChange={(val) => setValues((v) => ({ ...v, lead_id: val }))}
              placeholder={t("initiatives.lead")}
              buttonVariant="border-with-text"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-11 text-secondary">{t("initiatives.start_date")}</span>
            <Input
              id="create-update-start-date"
              name="create-update-start-date"
              type="date"
              value={values.start_date ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, start_date: e.target.value || null }))}
              className="w-full"
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-11 text-secondary">{t("initiatives.target_date")}</span>
            <Input
              id="create-update-target-date"
              name="create-update-target-date"
              type="date"
              value={values.target_date ?? ""}
              onChange={(e) => setValues((v) => ({ ...v, target_date: e.target.value || null }))}
              className="w-full"
            />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {initiative ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
