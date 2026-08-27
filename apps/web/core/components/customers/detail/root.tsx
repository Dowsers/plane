/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button, ContentWrapper, Loader } from "@plane/ui";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateCustomerRequestModal } from "./create-request-modal";
import { CustomerProfileHeader } from "./profile-header";
import { CustomerRequestCard } from "./request-card";

type Props = {
  workspaceSlug: string;
  customerId: string;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 3-5/9) in plane-selfhost - Customer detail page:
 * profile header (section "CustomerProfileHeader") plus the list of its
 * CustomerRequest, sorted by date descending (default order already
 * applied by the backend's `ordering = ("-created_at",)`).
 */
export const CustomerDetailRoot = observer(function CustomerDetailRoot(props: Props) {
  const { workspaceSlug, customerId } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getCustomerById, getCustomerRequestsById, fetchCustomerDetails, fetchCustomerRequests } = useCustomer();

  const [createRequestModal, setCreateRequestModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug && customerId ? ["CUSTOMER_DETAILS", workspaceSlug, customerId] : null,
    workspaceSlug && customerId ? () => fetchCustomerDetails(workspaceSlug, customerId) : null,
    { revalidateOnFocus: false }
  );
  useSWR(
    workspaceSlug && customerId ? ["CUSTOMER_REQUESTS", workspaceSlug, customerId] : null,
    workspaceSlug && customerId ? () => fetchCustomerRequests(workspaceSlug, customerId) : null,
    { revalidateOnFocus: false }
  );

  const canManage = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );

  const customer = getCustomerById(customerId);
  const requests = getCustomerRequestsById(customerId);

  if (isLoading && !customer) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="120px" />
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!customer) return null;

  return (
    <ContentWrapper>
      <CreateCustomerRequestModal
        isOpen={createRequestModal}
        handleClose={() => setCreateRequestModal(false)}
        customerId={customerId}
      />
      <CustomerProfileHeader customer={customer} />

      <div className="mt-6 flex items-center justify-between">
        <h3 className="text-14 font-medium">{t("customers.requests")}</h3>
        <Button variant="primary" size="sm" onClick={() => setCreateRequestModal(true)} disabled={!canManage}>
          {t("customers.new_request")}
        </Button>
      </div>

      <div className="mt-3 flex flex-col gap-3">
        {requests.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-12 text-center">
            <h4 className="text-14 font-medium">{t("customers.requests_empty_state.title")}</h4>
            <p className="max-w-md text-13 text-secondary">{t("customers.requests_empty_state.description")}</p>
          </div>
        ) : (
          requests.map((request) => <CustomerRequestCard key={request.id} customerId={customerId} request={request} />)
        )}
      </div>
    </ContentWrapper>
  );
});
