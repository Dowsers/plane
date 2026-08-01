/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React from "react";
import { observer } from "mobx-react";
import { Map, Target } from "lucide-react";
import { useParams } from "next/navigation";
import { Disclosure, Transition } from "@headlessui/react";
// plane imports
import { AnalyticsIcon, CycleIcon, ProjectIcon, ViewsIcon } from "@plane/propel/icons";
import { EUserWorkspaceRoles } from "@plane/types";
// components
import { CreateUpdateInitiativeModal } from "@/components/initiatives/create-update-modal";
// hooks
import { useCommandPalette } from "@/hooks/store/use-command-palette";
import { useWorkspace } from "@/hooks/store/use-workspace";
import useLocalStorage from "@/hooks/use-local-storage";
// local imports
import { SidebarWorkspaceMenuHeader } from "./workspace-menu-header";
import { SidebarWorkspaceMenuItem } from "./workspace-menu-item";

export const SidebarWorkspaceMenu = observer(function SidebarWorkspaceMenu() {
  // router params
  const { workspaceSlug } = useParams();
  // store hooks
  const { currentWorkspace } = useWorkspace();
  const { isCreateInitiativeModalOpen, toggleCreateInitiativeModal } = useCommandPalette();
  // local storage
  const { setValue: toggleWorkspaceMenu, storedValue } = useLocalStorage<boolean>("is_workspace_menu_open", true);
  // derived values
  const isWorkspaceMenuOpen = !!storedValue;

  const SIDEBAR_WORKSPACE_MENU_ITEMS = [
    {
      key: "projects",
      labelTranslationKey: "sidebar.projects",
      href: `/${workspaceSlug}/projects/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
      Icon: ProjectIcon,
    },
    {
      key: "views",
      labelTranslationKey: "sidebar.views",
      href: `/${workspaceSlug}/workspace-views/all-issues/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
      Icon: ViewsIcon,
    },
    {
      key: "active-cycles",
      labelTranslationKey: "sidebar.cycles",
      href: `/${workspaceSlug}/active-cycles/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
      Icon: CycleIcon,
    },
    // Opt-in nav item - hidden unless the workspace admin has turned on
    // Initiatives under Settings > Features (default off, see
    // docs/feature-specs/03-projects-roadmaps-initiatives.md in
    // plane-selfhost).
    ...(currentWorkspace?.is_initiatives_enabled
      ? [
          {
            key: "initiatives",
            labelTranslationKey: "sidebar.initiatives",
            href: `/${workspaceSlug}/initiatives/`,
            access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
            Icon: Target,
          },
        ]
      : []),
    // Opt-in nav item - hidden unless the workspace admin has turned on
    // Roadmap under Settings > Features (default off, see
    // docs/feature-specs/03-projects-roadmaps-initiatives.md in
    // plane-selfhost).
    ...(currentWorkspace?.is_roadmap_enabled
      ? [
          {
            key: "roadmap",
            labelTranslationKey: "sidebar.roadmap",
            href: `/${workspaceSlug}/roadmap/`,
            access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER, EUserWorkspaceRoles.GUEST],
            Icon: Map,
          },
        ]
      : []),
    {
      key: "analytics",
      labelTranslationKey: "sidebar.analytics",
      href: `/${workspaceSlug}/analytics/`,
      access: [EUserWorkspaceRoles.ADMIN, EUserWorkspaceRoles.MEMBER],
      Icon: AnalyticsIcon,
    },
  ];

  return (
    <Disclosure as="div" defaultOpen>
      {currentWorkspace?.is_initiatives_enabled && (
        <CreateUpdateInitiativeModal
          isOpen={isCreateInitiativeModalOpen}
          handleClose={() => toggleCreateInitiativeModal(false)}
          initiative={null}
        />
      )}
      <SidebarWorkspaceMenuHeader isWorkspaceMenuOpen={isWorkspaceMenuOpen} toggleWorkspaceMenu={toggleWorkspaceMenu} />
      <Transition
        show={isWorkspaceMenuOpen}
        enter="transition duration-100 ease-out"
        enterFrom="transform scale-95 opacity-0"
        enterTo="transform scale-100 opacity-100"
        leave="transition duration-75 ease-out"
        leaveFrom="transform scale-100 opacity-100"
        leaveTo="transform scale-95 opacity-0"
      >
        {isWorkspaceMenuOpen && (
          <Disclosure.Panel as="div" className="mt-0.5 flex flex-col gap-0.5" static>
            {SIDEBAR_WORKSPACE_MENU_ITEMS.map((item) => (
              <SidebarWorkspaceMenuItem key={item.key} item={item} />
            ))}
          </Disclosure.Panel>
        )}
      </Transition>
    </Disclosure>
  );
});
