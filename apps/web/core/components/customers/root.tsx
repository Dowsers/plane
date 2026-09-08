/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Search } from "lucide-react";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TCustomerStatus } from "@plane/types";
import { Button, ContentWrapper, CustomSelect, Loader } from "@plane/ui";
// hooks
import { useCustomer } from "@/hooks/store/use-customer";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateCustomerModal } from "./create-update-modal";
import { CustomerCard } from "./customer-card";

const STATUS_FILTER_OPTIONS: { value: TCustomerStatus | "all"; i18nKey: string }[] = [
  { value: "all", i18nKey: "customers.status_all" },
  { value: "active", i18nKey: "customers.status_active" },
  { value: "prospect", i18nKey: "customers.status_prospect" },
  { value: "churned", i18nKey: "customers.status_churned" },
];

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 1-2/5/8) in plane-selfhost - workspace Customer list
 * page. Mirrors `TeamspacesListRoot`, plus name search and status filter
 * (exigence 2/5), applied client-side over the already-fetched list (the
 * backend also supports `?search=`/`?status=` server-side, but this list
 * is expected to stay small enough per workspace for a client-side filter
 * to be simpler and still responsive).
 */
export const CustomersListRoot = observer(function CustomersListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getCustomerIds, getCustomerById, fetchCustomers } = useCustomer();

  const [createModal, setCreateModal] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<TCustomerStatus | "all">("all");

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_CUSTOMERS", workspaceSlug] : null,
    workspaceSlug ? () => fetchCustomers(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const customerIds = workspaceSlug ? getCustomerIds(workspaceSlug.toString()) : null;

  const filteredCustomerIds = useMemo(() => {
    if (!customerIds) return customerIds;
    return customerIds.filter((id) => {
      const customer = getCustomerById(id);
      if (!customer) return false;
      if (statusFilter !== "all" && customer.status !== statusFilter) return false;
      if (search.trim() && !customer.name.toLowerCase().includes(search.trim().toLowerCase())) return false;
      return true;
    });
  }, [customerIds, getCustomerById, search, statusFilter]);

  if (isLoading && !customerIds) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!customerIds || customerIds.length === 0) {
    return (
      <ContentWrapper>
        <CreateUpdateCustomerModal isOpen={createModal} handleClose={() => setCreateModal(false)} customer={null} />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <h3 className="text-16 font-medium">{t("customers.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("customers.empty_state.description")}</p>
          <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
            {t("customers.empty_state.primary_button")}
          </Button>
        </div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateCustomerModal isOpen={createModal} handleClose={() => setCreateModal(false)} customer={null} />
      <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5 rounded-md border-[0.5px] border-subtle px-2 py-1">
            <Search className="h-3.5 w-3.5 text-tertiary" />
            <input
              id="customers-root-search"
              name="customers-root-search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("search")}
              className="w-40 bg-transparent text-13 outline-none"
            />
          </div>
          <CustomSelect
            value={statusFilter}
            label={t(
              STATUS_FILTER_OPTIONS.find((option) => option.value === statusFilter)?.i18nKey ?? "customers.status_all"
            )}
            onChange={(value: TCustomerStatus | "all") => setStatusFilter(value)}
          >
            {STATUS_FILTER_OPTIONS.map((option) => (
              <CustomSelect.Option key={option.value} value={option.value}>
                {t(option.i18nKey)}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("customers.create_customer")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {(filteredCustomerIds ?? []).map((customerId) => {
          const customer = getCustomerById(customerId);
          if (!customer) return null;
          return <CustomerCard key={customerId} customer={customer} />;
        })}
      </div>
    </ContentWrapper>
  );
});
