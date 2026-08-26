/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { TeamspacesListRoot } from "@/components/teamspaces/root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";

function TeamspacesPage() {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Teamspaces` : undefined;

  return (
    <>
      <PageHead title={pageTitle} />
      <TeamspacesListRoot />
    </>
  );
}

export default observer(TeamspacesPage);
