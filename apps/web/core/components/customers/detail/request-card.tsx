/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Plus, Trash2, X } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ICustomerRequest, ISearchIssueResponse } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { generateWorkItemLink } from "@plane/utils";
// components
import { ExistingIssuesListModal } from "@/components/core/modals/existing-issues-list-modal";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  customerId: string;
  request: ICustomerRequest;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 3-4/9) in plane-selfhost - one CustomerRequest row on
 * the Customer detail page: title, citation/description, date, and its
 * linked work items (id/title, click-through to the issue) with an
 * unlink action per item, plus a "link another work item" action and a
 * delete-the-whole-request action.
 */
export const CustomerRequestCard = observer(function CustomerRequestCard(props: Props) {
  const { customerId, request } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { linkCustomerRequestIssue, unlinkCustomerRequestIssue, deleteCustomerRequest } = useCustomer();
  const { allowPermissions } = useUserPermissions();

  const [issuePickerOpen, setIssuePickerOpen] = useState(false);
  const [deleteModal, setDeleteModal] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const handleLink = async (data: ISearchIssueResponse[]) => {
    if (!workspaceSlug) return;
    try {
      await Promise.all(
        data.map((issue) => linkCustomerRequestIssue(workspaceSlug.toString(), customerId, request.id, issue.id))
      );
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.link_success") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    }
  };

  const handleUnlink = async (issueId: string) => {
    if (!workspaceSlug) return;
    try {
      await unlinkCustomerRequestIssue(workspaceSlug.toString(), customerId, request.id, issueId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("customers.toast.unlink_success") });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    }
  };

  const handleDelete = async () => {
    if (!workspaceSlug) return;
    setIsDeleting(true);
    try {
      await deleteCustomerRequest(workspaceSlug.toString(), customerId, request.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("customers.toast.request_delete_success"),
      });
      setDeleteModal(false);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("customers.toast.error") });
    } finally {
      setIsDeleting(false);
    }
  };

  const linkedIssueIds = (request.issues ?? []).map((issue) => issue.issue_id);

  return (
    <div className="flex flex-col gap-2 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4">
      <ExistingIssuesListModal
        workspaceSlug={workspaceSlug?.toString()}
        isOpen={issuePickerOpen}
        handleClose={() => setIssuePickerOpen(false)}
        searchParams={{}}
        workspaceLevelToggle
        selectedWorkItemIds={linkedIssueIds}
        handleOnSubmit={handleLink}
      />
      <AlertModalCore
        isOpen={deleteModal}
        handleClose={() => setDeleteModal(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title={t("customers.delete_request_confirm.title")}
        content={t("customers.delete_request_confirm.description")}
      />

      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <span className="text-14 font-medium">{request.name}</span>
          <span className="text-11 text-tertiary">
            {new Date(request.requested_at ?? request.created_at).toLocaleDateString()}
          </span>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={() => setDeleteModal(true)}
            className="hover:text-danger-text text-tertiary"
            title={t("delete")}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {request.description && <p className="text-13 text-secondary">{request.description}</p>}

      <div className="mt-1 flex flex-col gap-1.5">
        {(request.issues ?? []).map((issue) => (
          <div
            key={issue.id}
            className="flex items-center justify-between gap-2 rounded border-[0.5px] border-subtle px-2 py-1"
          >
            <Link
              href={generateWorkItemLink({
                workspaceSlug: workspaceSlug?.toString(),
                projectId: issue.project_id,
                issueId: issue.issue_id,
                projectIdentifier: issue.project_identifier,
                sequenceId: issue.sequence_id,
              })}
              className="truncate text-13 hover:underline"
            >
              #{issue.sequence_id} {issue.name}
            </Link>
            {canManage && (
              <button
                type="button"
                onClick={() => handleUnlink(issue.issue_id)}
                className="hover:text-danger-text text-tertiary"
                title={t("customers.link_work_item")}
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        ))}
        {canManage && (
          <button
            type="button"
            onClick={() => setIssuePickerOpen(true)}
            className="flex w-fit items-center gap-1 text-12 text-tertiary hover:text-primary"
          >
            <Plus className="h-3 w-3" />
            {t("customers.link_work_item")}
          </button>
        )}
      </div>
    </div>
  );
});
