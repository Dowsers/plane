/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// plane imports
import { WikiIcon } from "@plane/propel/icons";
import { Breadcrumbs, Header } from "@plane/ui";
// helpers
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// components
import { WikiCreateMenu } from "@/components/pages/wiki/create-menu";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { usePageCollectionStore } from "@/plane-web/hooks/store";

export const WikiListHeader = observer(function WikiListHeader() {
  // router
  const router = useAppRouter();
  const { workspaceSlug } = useParams();
  // store hooks
  const { canCurrentUserCreateRootCollection } = usePageCollectionStore();

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                label="Wiki"
                href={`/${workspaceSlug}/wiki/`}
                icon={<WikiIcon className="h-4 w-4 text-tertiary" />}
                isLast
              />
            }
            isLast
          />
        </Breadcrumbs>
      </Header.LeftItem>
      <Header.RightItem>
        <WikiCreateMenu
          workspaceSlug={workspaceSlug?.toString() ?? ""}
          collectionId={null}
          canCreate={canCurrentUserCreateRootCollection}
          onPageCreated={(pageId) => router.push(`/${workspaceSlug}/wiki/${pageId}`)}
        />
      </Header.RightItem>
    </Header>
  );
});
