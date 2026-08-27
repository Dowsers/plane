/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { ICustomer } from "@plane/types";
import { Tooltip } from "@plane/ui";
// local imports
import { CustomerQuickActions } from "./quick-actions";

type Props = {
  customer: ICustomer;
};

const STATUS_I18N_KEY: Record<string, string> = {
  active: "customers.status_active",
  prospect: "customers.status_prospect",
  churned: "customers.status_churned",
};

export const CustomerCard = observer(function CustomerCard(props: Props) {
  const { customer } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/customers/${customer.id}/`}
          className="flex-grow truncate text-14 font-medium hover:underline"
        >
          {customer.name}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <CustomerQuickActions customer={customer} />
        </div>
      </div>

      {customer.description && <p className="line-clamp-2 text-13 text-secondary">{customer.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <Tooltip tooltipContent={t("customers.status")}>
          <span className="rounded-full border-[0.5px] border-subtle px-2 py-0.5 capitalize">
            {t(STATUS_I18N_KEY[customer.status] ?? "customers.status_active")}
          </span>
        </Tooltip>
        <span>
          {t("customers.requests")}: {customer.request_count ?? 0}
        </span>
        <span>
          {t("customers.work_items")}: {customer.issue_count ?? 0}
        </span>
      </div>
    </div>
  );
});
