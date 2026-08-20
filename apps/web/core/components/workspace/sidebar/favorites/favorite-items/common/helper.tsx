/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Logo } from "@plane/propel/emoji-icon-picker";
import { PageIcon } from "@plane/propel/icons";
// plane imports
import type { IFavorite, TLogoProps } from "@plane/types";
// components
// plane web constants
import { FAVORITE_ITEM_ICONS, FAVORITE_ITEM_LINKS } from "@/constants/sidebar-favorites";

export const getFavoriteItemIcon = (type: string, logo?: TLogoProps) => {
  const Icon = FAVORITE_ITEM_ICONS[type] || PageIcon;

  return (
    <>
      <div className="hidden size-5 items-center justify-center group-hover:flex">
        <Icon className="m-auto size-4 flex-shrink-0 stroke-[1.5]" />
      </div>
      <div className="flex size-5 items-center justify-center group-hover:hidden">
        {logo?.in_use ? (
          <Logo logo={logo} size={16} type={type === "project" ? "material" : "lucide"} />
        ) : (
          <Icon className="m-auto size-4 flex-shrink-0 stroke-[1.5]" />
        )}
      </div>
    </>
  );
};

export const generateFavoriteItemLink = (workspaceSlug: string, favorite: IFavorite) => {
  // Category 10, feature 4 ("Wiki workspace en GA") exigence 11 - a
  // favorited Wiki page has no `project_id` (see `BasePage.addToFavorites`,
  // which sends `project_id: this.project_ids?.[0] ?? null`), so the
  // generic `FAVORITE_ITEM_LINKS.page` entry (which always builds a
  // `/projects/<project_id>/pages/<id>` link) would previously have
  // produced a broken `/projects/undefined/pages/<id>` URL for it. This
  // was purely a frontend link-generation gap - `WorkspaceFavoriteEndpoint`
  // itself was already fixed backend-side to stop excluding these
  // favorites from the panel at all.
  if (favorite.entity_type === "page" && !favorite.project_id) {
    return `/${workspaceSlug}/wiki/${favorite.entity_identifier}`;
  }

  const entityLinkDetails = FAVORITE_ITEM_LINKS[favorite.entity_type];

  if (!entityLinkDetails) {
    console.error(`Unrecognized favorite entity type: ${favorite.entity_type}`);
    return `/${workspaceSlug}`;
  }

  if (entityLinkDetails.itemLevel === "workspace") {
    return `/${workspaceSlug}/${entityLinkDetails.getLink(favorite)}`;
  } else if (entityLinkDetails.itemLevel === "project") {
    return `/${workspaceSlug}/projects/${favorite.project_id}/${entityLinkDetails.getLink(favorite)}`;
  } else {
    return `/${workspaceSlug}`;
  }
};
