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
import type { ICustomer, TCustomerStatus, TCustomerWritePayload } from "@plane/types";
import { Button, CustomSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  customer: ICustomer | null;
};

const DEFAULTS: TCustomerWritePayload = {
  name: "",
  description: "",
  contact_name: "",
  contact_email: "",
  domain: "",
  status: "active",
};

const STATUS_OPTIONS: { value: TCustomerStatus; i18nKey: string }[] = [
  { value: "active", i18nKey: "customers.status_active" },
  { value: "prospect", i18nKey: "customers.status_prospect" },
  { value: "churned", i18nKey: "customers.status_churned" },
];

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 1, "Considerations API/UX") in plane-selfhost - mirrors
 * `CreateUpdateTeamspaceModal`, with the extra contact/domain/status fields
 * spec section 1 requires.
 */
export const CreateUpdateCustomerModal = observer(function CreateUpdateCustomerModal(props: Props) {
  const { isOpen, handleClose, customer } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createCustomer, updateCustomer } = useCustomer();

  const [values, setValues] = useState<TCustomerWritePayload>(DEFAULTS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setValues(
      customer
        ? {
            name: customer.name,
            description: customer.description,
            contact_name: customer.contact_name,
            contact_email: customer.contact_email,
            domain: customer.domain,
            status: customer.status,
          }
        : DEFAULTS
    );
  }, [customer, isOpen]);

  const handleSubmit = async () => {
    if (!workspaceSlug || !values.name?.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.name") });
      return;
    }

    const payload: TCustomerWritePayload = {
      name: values.name.trim(),
      description: values.description ?? "",
      contact_name: values.contact_name ?? "",
      contact_email: values.contact_email ?? "",
      domain: values.domain ?? "",
      status: values.status ?? "active",
    };

    setIsSubmitting(true);
    try {
      if (customer) {
        await updateCustomer(workspaceSlug.toString(), customer.id, payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.update_success") });
      } else {
        await createCustomer(workspaceSlug.toString(), payload);
        setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.create_success") });
      }
      handleClose();
    } catch (error: unknown) {
      const message = (error as { name?: string[] })?.name?.[0] ?? t("customers.toast.error");
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectedStatusLabel =
    STATUS_OPTIONS.find((option) => option.value === (values.status ?? "active"))?.i18nKey ?? "customers.status_active";

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">
          {customer ? t("customers.update_customer") : t("customers.create_customer")}
        </h3>
        <div className="flex flex-col gap-1">
          <Input
            id="create-update-name"
            name="create-update-name"
            type="text"
            value={values.name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, name: e.target.value }))}
            placeholder={t("customers.name")}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <TextArea
            value={values.description ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, description: e.target.value }))}
            placeholder={t("customers.description")}
            className="w-full"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="create-update-contact-name"
            name="create-update-contact-name"
            type="text"
            value={values.contact_name ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, contact_name: e.target.value }))}
            placeholder={t("customers.contact_name")}
            className="w-full"
          />
          <Input
            id="create-update-contact-email"
            name="create-update-contact-email"
            type="email"
            value={values.contact_email ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, contact_email: e.target.value }))}
            placeholder={t("customers.contact_email")}
            className="w-full"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Input
            id="create-update-domain"
            name="create-update-domain"
            type="text"
            value={values.domain ?? ""}
            onChange={(e) => setValues((v) => ({ ...v, domain: e.target.value }))}
            placeholder={t("customers.domain")}
            className="w-full"
          />
          <CustomSelect
            value={values.status ?? "active"}
            label={t(selectedStatusLabel)}
            onChange={(value: TCustomerStatus) => setValues((v) => ({ ...v, status: value }))}
            className="w-full"
          >
            {STATUS_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {t(option.i18nKey)}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {customer ? t("update") : t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
