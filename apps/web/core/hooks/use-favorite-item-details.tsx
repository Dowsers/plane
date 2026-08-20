/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IFavorite } from "@plane/types";
// components
import { getPageName } from "@plane/utils";
import {
  generateFavoriteItemLink,
  getFavoriteItemIcon,
} from "@/components/workspace/sidebar/favorites/favorite-items/common";
// helpers
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectView } from "@/hooks/store/use-project-view";
// plane web hooks
import { EPageStoreType, usePage } from "@/plane-web/hooks/store";
import { useAdditionalFavoriteItemDetails } from "@/plane-web/hooks/use-additional-favorite-item-details";

export const useFavoriteItemDetails = (workspaceSlug: string, favorite: IFavorite) => {
  const {
    entity_identifier: favoriteItemId,
    entity_data: { logo_props: favoriteItemLogoProps },
    entity_type: favoriteItemEntityType,
  } = favorite;
  const favoriteItemName = favorite?.entity_data?.name || favorite?.name;
  // store hooks
  const { getViewById } = useProjectView();
  const { getProjectById } = useProject();
  const { getCycleById } = useCycle();
  const { getModuleById } = useModule();
  // additional details
  const { getAdditionalFavoriteItemDetails } = useAdditionalFavoriteItemDetails();
  // derived values
  // Category 10, feature 4 ("Wiki workspace en GA") exigence 11 - a
  // favorited Wiki page has no `project_id` (see `generateFavoriteItemLink`'s
  // own comment), so its details live in the workspace-scoped page store,
  // not the project one. Both hooks are called unconditionally (rules of
  // hooks) and the right one is picked based on `favorite.project_id`.
  const projectPageDetail = usePage({
    pageId: favoriteItemId ?? "",
    storeType: EPageStoreType.PROJECT,
  });
  const workspacePageDetail = usePage({
    pageId: favoriteItemId ?? "",
    storeType: EPageStoreType.WORKSPACE,
  });
  const pageDetail = favorite.project_id ? projectPageDetail : workspacePageDetail;
  const viewDetails = getViewById(favoriteItemId ?? "");
  const cycleDetail = getCycleById(favoriteItemId ?? "");
  const moduleDetail = getModuleById(favoriteItemId ?? "");
  const currentProjectDetails = getProjectById(favorite.project_id ?? "");

  let itemIcon;
  let itemTitle;
  const itemLink = generateFavoriteItemLink(workspaceSlug.toString(), favorite);

  switch (favoriteItemEntityType) {
    case "project":
      itemTitle = currentProjectDetails?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("project", currentProjectDetails?.logo_props || favoriteItemLogoProps);
      break;
    case "page":
      itemTitle = getPageName(pageDetail?.name ?? favoriteItemName);
      itemIcon = getFavoriteItemIcon(
        favorite.project_id ? "page" : "wiki_page",
        pageDetail?.logo_props ?? favoriteItemLogoProps
      );
      break;
    case "view":
      itemTitle = viewDetails?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("view", viewDetails?.logo_props || favoriteItemLogoProps);
      break;
    case "cycle":
      itemTitle = cycleDetail?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("cycle");
      break;
    case "module":
      itemTitle = moduleDetail?.name ?? favoriteItemName;
      itemIcon = getFavoriteItemIcon("module");
      break;
    default: {
      const additionalDetails = getAdditionalFavoriteItemDetails(workspaceSlug, favorite);
      itemTitle = additionalDetails.itemTitle;
      itemIcon = additionalDetails.itemIcon;
      break;
    }
  }

  return { itemIcon, itemTitle, itemLink };
};
