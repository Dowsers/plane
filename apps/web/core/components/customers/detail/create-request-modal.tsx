/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISearchIssueResponse } from "@plane/types";
import { Button, EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  customerId: string;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 5) in plane-selfhost - "Nouvelle demande" action on
 * the Customer detail page: create a CustomerRequest, then optionally link
 * one or more work items to it in the same flow (spec's own wording -
 * "avec possibilite d'y lier un ou plusieurs work items des la creation").
 */
export const CreateCustomerRequestModal = observer(function CreateCustomerRequestModal(props: Props) {
  const { isOpen, handleClose, customerId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { createCustomerRequest, linkCustomerRequestIssue } = useCustomer();

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selectedIssues, setSelectedIssues] = useState<ISearchIssueResponse[]>([]);
  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDescription("");
    setSelectedIssues([]);
  };

  const handleSubmit = async () => {
    if (!workspaceSlug || !name.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.request_name") });
      return;
    }

    setIsSubmitting(true);
    try {
      const request = await createCustomerRequest(workspaceSlug.toString(), customerId, {
        name: name.trim(),
        description,
      });
      await Promise.all(
        selectedIssues.map((issue) =>
          linkCustomerRequestIssue(workspaceSlug.toString(), customerId, request.id, issue.id)
        )
      );
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("customers.toast.request_create_success"),
      });
      reset();
      handleClose();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug?.toString()}
        isOpen={issuePickerOpen}
        handleClose={() => setIssuePickerOpen(false)}
        searchParams={{}}
        workspaceLevelToggle
        selectedWorkItemIds={selectedIssues.map((issue) => issue.id)}
        handleOnSubmit={async (data) => setSelectedIssues(data)}
      />
      <div className="flex flex-col gap-4 p-5">
        <h3 className="text-16 font-medium">{t("customers.new_request")}</h3>
        <div className="flex flex-col gap-1">
          <Input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("customers.request_name")}
            className="w-full"
          />
        </div>
        <div className="flex flex-col gap-1">
          <TextArea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder={t("customers.request_description")}
            className="w-full"
            rows={4}
          />
        </div>
        <div className="flex flex-col gap-2">
          <Button variant="neutral-primary" size="sm" onClick={() => setIssuePickerOpen(true)} className="w-fit">
            {t("customers.link_work_item")}
          </Button>
          {selectedIssues.length > 0 && (
            <ul className="flex flex-col gap-1">
              {selectedIssues.map((issue) => (
                <li key={issue.id} className="text-13 text-secondary">
                  {issue.project__identifier}-{issue.sequence_id} {issue.name}
                </li>
              ))}
            </ul>
          )}
        </div>
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
