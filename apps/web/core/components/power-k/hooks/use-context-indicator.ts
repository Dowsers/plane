/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
// plane imports
import { getPageName } from "@plane/utils";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useModule } from "@/hooks/store/use-module";
// plane web imports
import { useExtendedContextIndicator } from "@/plane-web/components/command-palette/power-k/hooks/use-extended-context-indicator";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// local imports
import type { TPowerKContextType } from "../core/types";

type TArgs = {
  activeContext: TPowerKContextType | null;
};

export const useContextIndicator = (args: TArgs): string | null => {
  const { activeContext } = args;
  // navigation
  const { workItem: workItemIdentifier, cycleId, moduleId, pageId } = useParams();
  // store hooks
  const { getCycleById } = useCycle();
  const { getModuleById } = useModule();
  const { getPageById: getProjectPageById } = usePageStore(EPageStoreType.PROJECT);
  // Category 10, feature 4 ("Wiki workspace en GA") - the `:pageId` route
  // param is shared by the project-scoped and workspace-scoped (Wiki)
  // page-detail routes alike, so `detectContextFromURL` already reports
  // `"page"` for a Wiki page URL with no change needed there; only the
  // lookup itself needs to also try the Wiki page store.
  const { getPageById: getWorkspacePageById } = usePageStore(EPageStoreType.WORKSPACE);
  // extended context indicator
  const extendedIndicator = useExtendedContextIndicator({
    activeContext,
  });
  let indicator: string | undefined | null = null;

  switch (activeContext) {
    case "work-item": {
      indicator = workItemIdentifier ? workItemIdentifier.toString() : null;
      break;
    }
    case "cycle": {
      const cycleDetails = cycleId ? getCycleById(cycleId.toString()) : null;
      indicator = cycleDetails?.name;
      break;
    }
    case "module": {
      const moduleDetails = moduleId ? getModuleById(moduleId.toString()) : null;
      indicator = moduleDetails?.name;
      break;
    }
    case "page": {
      const pageInstance = pageId
        ? (getProjectPageById(pageId.toString()) ?? getWorkspacePageById(pageId.toString()))
        : null;
      indicator = getPageName(pageInstance?.name);
      break;
    }
    default: {
      indicator = extendedIndicator;
    }
  }

  return indicator ?? null;
};
