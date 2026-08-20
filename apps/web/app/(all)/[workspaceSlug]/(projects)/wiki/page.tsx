/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// components
import { PageHead } from "@/components/core/page-title";
import { WikiTreeRoot } from "@/components/pages/wiki/wiki-tree-root";
import type { Route } from "./+types/page";

function WikiListPage({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;

  return (
    <>
      <PageHead title="Wiki" />
      <WikiTreeRoot workspaceSlug={workspaceSlug} />
    </>
  );
}

export default observer(WikiListPage);
