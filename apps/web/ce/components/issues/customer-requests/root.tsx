/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { Building2, Plus, X } from "lucide-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { customerService } from "@/services/customer.service";
// local
import { LinkCustomerRequestModal } from "./link-modal";

type TIssueCustomerRequestsProperty = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 6-7) in plane-selfhost. Mirrors
 * `IssueWorklogProperty`'s self-wrapping-in-`SidebarPropertyListItem`
 * pattern (both call sites, peek-overview/properties.tsx and
 * issue-detail/sidebar.tsx, render this as a bare tag). Read side is a
 * plain SWR fetch of the read-only mirror endpoint
 * (`GET .../issues/<id>/customer-requests/`) rather than a MobX sub-store,
 * since this block only ever reads/links/unlinks - no local mutation state
 * beyond the SWR cache is needed.
 */
export const IssueCustomerRequestsProperty = observer(function IssueCustomerRequestsProperty(
  props: TIssueCustomerRequestsProperty
) {
  const { workspaceSlug, projectId, issueId, disabled } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { unlinkCustomerRequestIssue } = useCustomer();
  const [isModalOpen, setIsModalOpen] = useState(false);

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const { data: links, mutate } = useSWR(
    workspaceSlug && projectId && issueId ? ["ISSUE_CUSTOMER_REQUESTS", workspaceSlug, projectId, issueId] : null,
    () => customerService.getIssueCustomerRequests(workspaceSlug, projectId, issueId),
    { revalidateOnFocus: false }
  );

  const handleUnlink = async (customerId: string, customerRequestId: string, linkIssueId: string) => {
    try {
      await unlinkCustomerRequestIssue(workspaceSlug, customerId, customerRequestId, linkIssueId);
      await mutate();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to remove this link.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    }
  };

  return (
    <SidebarPropertyListItem
      icon={Building2}
      label={t("common.customer_requests")}
      appendElement={
        !disabled &&
        canManage && (
          <button
            type="button"
            onClick={() => setIsModalOpen(true)}
            className="hover:bg-neutral-component-surface-dark grid place-items-center rounded p-0.5 text-tertiary hover:text-primary"
          >
            <Plus className="size-3" />
          </button>
        )
      }
    >
      <div className="flex w-full flex-col gap-1">
        {(links ?? []).length === 0 && <span className="text-body-xs-regular text-tertiary">-</span>}
        {(links ?? []).length > 0 && (
          <ul className="flex flex-col gap-1">
            {links?.map((link) => (
              <li key={link.id} className="flex items-center justify-between gap-2 text-body-xs-regular">
                <Link href={`/${workspaceSlug}/customers/${link.customer_id}/`} className="truncate hover:underline">
                  {link.customer_name}
                  <span className="text-tertiary"> · {link.request_name}</span>
                </Link>
                {!disabled && canManage && (
                  <button
                    type="button"
                    onClick={() => handleUnlink(link.customer_id, link.customer_request_id, issueId)}
                    title="Unlink"
                  >
                    <X className="hover:text-danger-text size-3 text-tertiary" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
      <LinkCustomerRequestModal
        isOpen={isModalOpen}
        handleClose={() => setIsModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        onLinked={() => mutate()}
      />
    </SidebarPropertyListItem>
  );
});
