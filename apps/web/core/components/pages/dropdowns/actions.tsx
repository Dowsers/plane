/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArchiveRestoreIcon, FileOutput, LockKeyhole, LockKeyholeOpen, LayoutTemplate } from "lucide-react";
// constants
import { EPageAccess, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// plane editor
import { LinkIcon, CopyIcon, LockIcon, NewTabIcon, ArchiveIcon, TrashIcon, GlobeIcon } from "@plane/propel/icons";
// plane ui
import type { TContextMenuItem } from "@plane/ui";
import { ContextMenu, CustomMenu } from "@plane/ui";
// components
import { cn } from "@plane/utils";
import { DeletePageModal } from "@/components/pages/modals/delete-page-modal";
import { SaveAsTemplateModal } from "@/components/pages/modals/save-as-template-modal";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import { usePageOperations } from "@/hooks/use-page-operations";
// plane web components
import { MovePageModal } from "@/plane-web/components/pages";
// plane web hooks
import type { EPageStoreType } from "@/plane-web/hooks/store";
import { usePageFlag } from "@/plane-web/hooks/use-page-flag";
// store types
import type { TPageInstance } from "@/store/pages/base-page";

export type TPageActions =
  | "full-screen"
  | "sticky-toolbar"
  | "copy-markdown"
  | "toggle-lock"
  | "toggle-access"
  | "open-in-new-tab"
  | "copy-link"
  | "make-a-copy"
  | "save-as-template"
  | "archive-restore"
  | "delete"
  | "version-history"
  | "export"
  | "move"
  // Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - the two
  // symmetric project<->Wiki scope-conversion actions.
  | "move-to-wiki"
  | "move-to-project";

type Props = {
  extraOptions?: (TContextMenuItem & { key: TPageActions })[];
  optionsOrder: TPageActions[];
  page: TPageInstance;
  parentRef?: React.RefObject<HTMLElement>;
  storeType: EPageStoreType;
};

export const PageActions = observer(function PageActions(props: Props) {
  const { extraOptions, optionsOrder, page, parentRef, storeType } = props;
  // states
  const [deletePageModal, setDeletePageModal] = useState(false);
  const [movePageModal, setMovePageModal] = useState(false);
  const [saveAsTemplateModal, setSaveAsTemplateModal] = useState(false);
  // params
  const { workspaceSlug } = useParams();
  // i18n
  const { t } = useTranslation();
  // permissions - Category 14, feature 14c, question ouverte 1 (section 1):
  // "Save as template" is gated the same as PageTemplate creation itself
  // (workspace Admin), independently of the page-level role required to
  // edit/view the page (exigence 7, section 2).
  const { allowPermissions } = useUserPermissions();
  const canCurrentUserSaveAsTemplate = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  // page flag
  const { isMovePageEnabled } = usePageFlag({
    workspaceSlug: workspaceSlug?.toString() ?? "",
  });
  // page operations
  const { pageOperations } = usePageOperations({
    page,
  });
  // derived values
  const {
    access,
    archived_at,
    is_locked,
    canCurrentUserArchivePage,
    canCurrentUserChangeAccess,
    canCurrentUserDeletePage,
    canCurrentUserDuplicatePage,
    canCurrentUserLockPage,
    canCurrentUserMovePage,
  } = page;
  // menu items
  const MENU_ITEMS = useMemo(
    function MENU_ITEMS() {
      const menuItems: (TContextMenuItem & { key: TPageActions })[] = [
        {
          key: "toggle-lock",
          action: () => {
            pageOperations.toggleLock();
          },
          title: is_locked ? "Unlock" : "Lock",
          icon: is_locked ? LockKeyholeOpen : LockKeyhole,
          shouldRender: canCurrentUserLockPage,
        },
        {
          key: "toggle-access",
          action: () => {
            pageOperations.toggleAccess();
          },
          title: access === EPageAccess.PUBLIC ? "Make private" : "Make public",
          icon: access === EPageAccess.PUBLIC ? LockIcon : GlobeIcon,
          shouldRender: canCurrentUserChangeAccess && !archived_at,
        },
        {
          key: "open-in-new-tab",
          action: pageOperations.openInNewTab,
          title: "Open in new tab",
          icon: NewTabIcon,
          shouldRender: true,
        },
        {
          key: "copy-link",
          action: pageOperations.copyLink,
          title: "Copy link",
          icon: LinkIcon,
          shouldRender: true,
        },
        {
          key: "make-a-copy",
          action: () => {
            pageOperations.duplicate();
          },
          title: "Make a copy",
          icon: CopyIcon,
          shouldRender: canCurrentUserDuplicatePage,
        },
        {
          key: "save-as-template",
          action: () => {
            setSaveAsTemplateModal(true);
          },
          title: t("page_templates.save_as_template"),
          icon: LayoutTemplate,
          shouldRender: canCurrentUserSaveAsTemplate,
        },
        {
          key: "archive-restore",
          action: () => {
            pageOperations.toggleArchive();
          },
          title: archived_at ? "Restore" : "Archive",
          icon: archived_at ? ArchiveRestoreIcon : ArchiveIcon,
          shouldRender: canCurrentUserArchivePage,
        },
        {
          key: "delete",
          action: () => {
            setDeletePageModal(true);
          },
          title: "Delete",
          icon: TrashIcon,
          shouldRender: canCurrentUserDeletePage && !!archived_at,
        },
        {
          key: "move",
          action: () => setMovePageModal(true),
          title: "Move",
          icon: FileOutput,
          shouldRender: canCurrentUserMovePage && isMovePageEnabled,
        },
      ];
      if (extraOptions) {
        menuItems.push(...extraOptions);
      }
      return menuItems;
    },
    [
      extraOptions,
      is_locked,
      canCurrentUserLockPage,
      access,
      canCurrentUserChangeAccess,
      archived_at,
      canCurrentUserDuplicatePage,
      canCurrentUserSaveAsTemplate,
      canCurrentUserArchivePage,
      canCurrentUserDeletePage,
      canCurrentUserMovePage,
      isMovePageEnabled,
      pageOperations,
      t,
    ]
  );
  // arrange options
  const arrangedOptions = useMemo<(TContextMenuItem & { key: TPageActions })[]>(
    () =>
      optionsOrder
        .map((key) => MENU_ITEMS.find((item) => item.key === key))
        .filter((item): item is TContextMenuItem & { key: TPageActions } => !!item),
    [optionsOrder, MENU_ITEMS]
  );

  return (
    <>
      <MovePageModal isOpen={movePageModal} onClose={() => setMovePageModal(false)} page={page} />
      <DeletePageModal
        isOpen={deletePageModal}
        onClose={() => setDeletePageModal(false)}
        page={page}
        storeType={storeType}
      />
      <SaveAsTemplateModal isOpen={saveAsTemplateModal} onClose={() => setSaveAsTemplateModal(false)} page={page} />
      {parentRef && <ContextMenu parentRef={parentRef} items={arrangedOptions} />}
      <CustomMenu placement="bottom-end" optionsClassName="max-h-[90vh]" ellipsis closeOnSelect>
        {arrangedOptions.map((item) => {
          if (item.shouldRender === false) return null;
          return (
            <CustomMenu.MenuItem
              key={item.key}
              onClick={() => {
                item.action?.();
              }}
              className={cn("flex items-center gap-2", item.className)}
              disabled={item.disabled}
            >
              {item.customContent ?? (
                <>
                  {item.icon && <item.icon className="size-3" />}
                  {item.title}
                </>
              )}
            </CustomMenu.MenuItem>
          );
        })}
      </CustomMenu>
    </>
  );
});
