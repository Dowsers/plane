/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { CustomerDetailRoot } from "@/components/customers/detail/root";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useWorkspace } from "@/hooks/store/use-workspace";

function CustomerDetailPage() {
  const { workspaceSlug, customerId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { getCustomerById } = useCustomer();

  const customer = customerId ? getCustomerById(customerId.toString()) : null;
  const pageTitle =
    currentWorkspace?.name && customer?.name ? `${currentWorkspace.name} - ${customer.name}` : undefined;

  if (!workspaceSlug || !customerId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <CustomerDetailRoot workspaceSlug={workspaceSlug.toString()} customerId={customerId.toString()} />
    </>
  );
}

export default observer(CustomerDetailPage);
