/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { TeamsListRoot } from "@/components/teams/root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function TeamsPage() {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Teams` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <TeamsListRoot />
    </>
  );
}

export default observer(TeamsPage);
