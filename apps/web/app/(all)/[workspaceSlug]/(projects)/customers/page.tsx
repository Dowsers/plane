/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { CustomersListRoot } from "@/components/customers/root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function CustomersPage() {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Customers` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <CustomersListRoot />
    </>
  );
}

export default observer(CustomersPage);
