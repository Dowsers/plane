/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// components
import { Outlet } from "react-router";
import useSWR from "swr";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
// plane web hooks
import { EPageStoreType, usePageCollectionStore, usePageStore } from "@/plane-web/hooks/store";
// local components
import type { Route } from "./+types/layout";
import { WikiListHeader } from "./header";

export default function WikiListLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug } = params;
  const { fetchPagesList } = usePageStore(EPageStoreType.WORKSPACE);
  const { fetchCollections } = usePageCollectionStore();
  // fetching the Wiki pages + folders list
  useSWR(`WORKSPACE_WIKI_PAGES_${workspaceSlug}`, () => fetchPagesList(workspaceSlug));
  useSWR(`WORKSPACE_WIKI_COLLECTIONS_${workspaceSlug}`, () => fetchCollections(workspaceSlug));
  return (
    <>
      <AppHeader header={<WikiListHeader />} />
      <ContentWrapper>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
