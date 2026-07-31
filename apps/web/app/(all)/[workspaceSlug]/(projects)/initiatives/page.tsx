/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
// components
import { InitiativesListRoot } from "@/components/initiatives/root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function InitiativesPage() {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Initiatives` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <InitiativesListRoot />
    </>
  );
}

export default observer(InitiativesPage);
