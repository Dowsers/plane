/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, CustomSearchSelect, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  onLinked: () => void;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 7) in plane-selfhost - "Lier a un client" action from
 * the issue sidebar's "Customer requests" block: either pick an existing
 * CustomerRequest (search by Customer or request title) or create a new
 * one on the fly (pick the Customer, then type title/citation), then link
 * it to the current issue in the same action.
 */
export const LinkCustomerRequestModal = observer(function LinkCustomerRequestModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, issueId, onLinked } = props;
  const { t } = useTranslation();
  const {
    getCustomerIds,
    getCustomerById,
    getCustomerRequestsById,
    fetchCustomers,
    fetchCustomerRequests,
    linkCustomerRequestIssue,
    createCustomerRequest,
  } = useCustomer();

  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [newRequestName, setNewRequestName] = useState("");
  const [newRequestDescription, setNewRequestDescription] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useSWR(
    isOpen && workspaceSlug ? ["WORKSPACE_CUSTOMERS_FOR_LINK", workspaceSlug] : null,
    isOpen && workspaceSlug ? () => fetchCustomers(workspaceSlug) : null,
    { revalidateOnFocus: false }
  );

  useEffect(() => {
    if (!isOpen) {
      setMode("existing");
      setSelectedCustomerId(null);
      setSelectedRequestId(null);
      setNewRequestName("");
      setNewRequestDescription("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedCustomerId && workspaceSlug) fetchCustomerRequests(workspaceSlug, selectedCustomerId);
  }, [selectedCustomerId, workspaceSlug, fetchCustomerRequests]);

  const customerIds = getCustomerIds(workspaceSlug) ?? [];
  const customerOptions = customerIds.map((id) => {
    const customer = getCustomerById(id);
    return { value: id, query: customer?.name ?? "", content: customer?.name ?? "" };
  });

  const requestOptions = selectedCustomerId
    ? getCustomerRequestsById(selectedCustomerId).map((request) => ({
        value: request.id,
        query: request.name,
        content: request.name,
      }))
    : [];

  const handleSubmit = async () => {
    if (!selectedCustomerId) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.label") });
      return;
    }

    setIsSubmitting(true);
    try {
      let requestId = selectedRequestId;
      if (mode === "new") {
        if (!newRequestName.trim()) {
          setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.request_name") });
          setIsSubmitting(false);
          return;
        }
        const request = await createCustomerRequest(workspaceSlug, selectedCustomerId, {
          name: newRequestName.trim(),
          description: newRequestDescription,
        });
        requestId = request.id;
      }

      if (!requestId) {
        setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.request_name") });
        setIsSubmitting(false);
        return;
      }

      await linkCustomerRequestIssue(workspaceSlug, selectedCustomerId, requestId, issueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.link_success") });
      onLinked();
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("customers.link_work_item")}</h3>

        <div className="flex flex-col gap-1">
          <span className="text-13 text-secondary">{t("customers.label")}</span>
          <CustomSearchSelect
            value={selectedCustomerId}
            label={selectedCustomerId ? (getCustomerById(selectedCustomerId)?.name ?? "") : t("customers.label")}
            options={customerOptions}
            onChange={(value: string) => {
              setSelectedCustomerId(value);
              setSelectedRequestId(null);
            }}
          />
        </div>

        {selectedCustomerId && (
          <>
            <div className="flex items-center gap-2 text-13">
              <button
                type="button"
                className={mode === "existing" ? "font-medium underline" : "text-secondary"}
                onClick={() => setMode("existing")}
              >
                {t("customers.requests")}
              </button>
              <span className="text-tertiary">/</span>
              <button
                type="button"
                className={mode === "new" ? "font-medium underline" : "text-secondary"}
                onClick={() => setMode("new")}
              >
                {t("customers.new_request")}
              </button>
            </div>

            {mode === "existing" ? (
              <div className="flex flex-col gap-1">
                <CustomSearchSelect
                  value={selectedRequestId}
                  label={
                    selectedRequestId
                      ? (getCustomerRequestsById(selectedCustomerId).find((r) => r.id === selectedRequestId)?.name ??
                        "")
                      : t("customers.requests")
                  }
                  options={requestOptions}
                  onChange={(value: string) => setSelectedRequestId(value)}
                />
              </div>
            ) : (
              <>
                <Input
                  type="text"
                  value={newRequestName}
                  onChange={(e) => setNewRequestName(e.target.value)}
                  placeholder={t("customers.request_name")}
                  className="w-full"
                />
                <TextArea
                  value={newRequestDescription}
                  onChange={(e) => setNewRequestDescription(e.target.value)}
                  placeholder={t("customers.request_description")}
                  className="w-full"
                  rows={3}
                />
              </>
            )}
          </>
        )}

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="neutral-primary" size="sm" onClick={handleClose}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSubmit} loading={isSubmitting}>
            {t("common.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
