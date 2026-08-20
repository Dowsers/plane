/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { LucideIcon } from "lucide-react";
// plane imports
import type { ISvgIcons } from "@plane/propel/icons";
import {
  CycleIcon,
  FavoriteFolderIcon,
  ModuleIcon,
  PageIcon,
  ProjectIcon,
  ViewsIcon,
  WikiIcon,
} from "@plane/propel/icons";
import type { IFavorite } from "@plane/types";

export const FAVORITE_ITEM_ICONS: Record<string, React.FC<ISvgIcons> | LucideIcon> = {
  page: PageIcon,
  // Category 10, feature 4 ("Wiki workspace en GA") exigence 11 - a
  // favorited Wiki page (a project-less `entity_type: "page"` favorite,
  // `project_id === null`) gets the Wiki icon instead of the generic Page
  // one, as a lightweight in-place equivalent of the "Wiki" badge/section
  // the spec asks for - see `use-favorite-item-details.tsx`. The
  // Favorites panel renders a single flat list with no per-type section
  // headers at all (not even for existing types like "Pages"/"Issues"),
  // so a dedicated "Wiki" section would be new UI machinery well beyond
  // this fix's scope; the existing flat-list rendering already surfaces
  // a favorited Wiki page correctly once the link/icon lookups below
  // account for it.
  wiki_page: WikiIcon,
  project: ProjectIcon,
  view: ViewsIcon,
  module: ModuleIcon,
  cycle: CycleIcon,
  folder: FavoriteFolderIcon,
};

export const FAVORITE_ITEM_LINKS: {
  [key: string]: {
    itemLevel: "project" | "workspace";
    getLink: (favorite: IFavorite) => string;
  };
} = {
  project: {
    itemLevel: "project",
    getLink: () => `issues`,
  },
  cycle: {
    itemLevel: "project",
    getLink: (favorite) => `cycles/${favorite.entity_identifier}`,
  },
  module: {
    itemLevel: "project",
    getLink: (favorite) => `modules/${favorite.entity_identifier}`,
  },
  view: {
    itemLevel: "project",
    getLink: (favorite) => `views/${favorite.entity_identifier}`,
  },
  page: {
    itemLevel: "project",
    getLink: (favorite) => `pages/${favorite.entity_identifier}`,
  },
};
