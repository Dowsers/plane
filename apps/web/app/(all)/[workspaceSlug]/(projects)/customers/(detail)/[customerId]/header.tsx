/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Building2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";

export const CustomerDetailHeader = observer(function CustomerDetailHeader() {
  const { workspaceSlug, customerId } = useParams();
  const { t } = useTranslation();
  const { getCustomerById } = useCustomer();

  const customer = customerId ? getCustomerById(customerId.toString()) : null;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug}/customers/`}
                label={t("customers.label")}
                icon={<Building2 className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {customer && <Breadcrumbs.Item component={<BreadcrumbLink label={customer.name} />} />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
