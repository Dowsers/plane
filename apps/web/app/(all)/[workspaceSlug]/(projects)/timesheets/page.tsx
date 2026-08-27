/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { TimesheetsRoot } from "@/components/timesheets/root";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import type { Route } from "./+types/page";

function TimesheetsPage({ params }: Route.ComponentProps) {
  const { currentWorkspace } = useWorkspace();
  const pageTitle = currentWorkspace?.name ? `${currentWorkspace?.name} - Timesheets` : undefined;
  const workspaceSlug = params.workspaceSlug;

  return (
    <>
      <PageHead title={pageTitle} />
      <div className="h-full overflow-y-auto p-6">
        <TimesheetsRoot workspaceSlug={workspaceSlug.toString()} />
      </div>
    </>
  );
}

export default observer(TimesheetsPage);
