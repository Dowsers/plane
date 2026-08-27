/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Mail, Globe, User } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { ICustomer } from "@plane/types";
// components
import { CreateUpdateCustomerModal } from "@/components/customers/create-update-modal";
import { CustomerQuickActions } from "@/components/customers/quick-actions";

type Props = {
  customer: ICustomer;
};

const STATUS_I18N_KEY: Record<string, string> = {
  active: "customers.status_active",
  prospect: "customers.status_prospect",
  churned: "customers.status_churned",
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14b. Customers",
 * feature 3, exigence 3) in plane-selfhost - profile info block (name,
 * description, contact, domain, status) at the top of the Customer detail
 * page, editable via the same create/update modal used from the list page
 * (question ouverte #3 of section 3 - no separate inline-edit form for
 * this MVP, the modal is the single edit surface).
 */
export const CustomerProfileHeader = observer(function CustomerProfileHeader(props: Props) {
  const { customer } = props;
  const { t } = useTranslation();
  const [editModal, setEditModal] = useState(false);

  return (
    <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-5">
      <CreateUpdateCustomerModal isOpen={editModal} handleClose={() => setEditModal(false)} customer={customer} />
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col gap-1">
          <h2 className="text-20 font-semibold">{customer.name}</h2>
          <span className="w-fit rounded-full border-[0.5px] border-subtle px-2 py-0.5 text-11 text-secondary capitalize">
            {t(STATUS_I18N_KEY[customer.status] ?? "customers.status_active")}
          </span>
        </div>
        <CustomerQuickActions customer={customer} />
      </div>

      {customer.description && <p className="text-13 text-secondary">{customer.description}</p>}

      <div className="flex flex-wrap items-center gap-4 text-13 text-secondary">
        {customer.contact_name && (
          <span className="flex items-center gap-1.5">
            <User className="h-3.5 w-3.5" />
            {customer.contact_name}
          </span>
        )}
        {customer.contact_email && (
          <a href={`mailto:${customer.contact_email}`} className="flex items-center gap-1.5 hover:underline">
            <Mail className="h-3.5 w-3.5" />
            {customer.contact_email}
          </a>
        )}
        {customer.domain && (
          <a
            href={customer.domain.startsWith("http") ? customer.domain : `https://${customer.domain}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 hover:underline"
          >
            <Globe className="h-3.5 w-3.5" />
            {customer.domain}
          </a>
        )}
      </div>
    </div>
  );
});
