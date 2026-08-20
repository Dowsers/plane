/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
// plane imports
import { WikiIcon } from "@plane/propel/icons";
import { getPageName } from "@plane/utils";
// components
import { SwitcherIcon } from "@/components/common/switcher-label";
import { PageActions } from "@/components/pages/dropdowns";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

type Props = {
  workspaceSlug: string;
  pageIds: string[];
};

/**
 * Exigence 6 - archived Wiki pages keep their current read-only
 * behaviour but stay listed here rather than in the main tree
 * (Collections have no archived state of their own on the backend - see
 * `PageCollection`'s model docstring - so this section only ever lists
 * pages, never folders). Deliberately not draggable: an archived page's
 * position in the tree is meaningless until it's restored.
 */
export const WikiArchivedSection = observer(function WikiArchivedSection(props: Props) {
  const { workspaceSlug, pageIds } = props;
  const { getPageById } = usePageStore(EPageStoreType.WORKSPACE);

  return (
    <div className="flex flex-col">
      {pageIds.map((pageId) => {
        const page = getPageById(pageId);
        if (!page) return null;
        return (
          <div
            key={pageId}
            className="group/wiki-archived-item flex w-full items-center gap-1.5 rounded-md px-2 py-1.5 text-primary hover:bg-layer-1-hover"
          >
            <SwitcherIcon logo_props={page.logo_props} LabelIcon={WikiIcon} size={14} />
            <Link href={`/${workspaceSlug}/wiki/${pageId}`} className="flex-grow truncate text-13 text-secondary">
              {getPageName(page.name)}
            </Link>
            <PageActions
              page={page}
              storeType={EPageStoreType.WORKSPACE}
              optionsOrder={["open-in-new-tab", "copy-link", "archive-restore", "delete"]}
            />
          </div>
        );
      })}
    </div>
  );
});
