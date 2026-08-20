/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { ArrowUpToLine, Briefcase, Clipboard, History } from "lucide-react";
// plane imports
import { WikiIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { ToggleSwitch } from "@plane/ui";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
import { usePageConvertToWikiOperation } from "@/hooks/use-page-convert-operations";
import { usePageFilters } from "@/hooks/use-page-filters";
import { useQueryParams } from "@/hooks/use-query-params";
// plane web imports
import type { TPageNavigationPaneTab } from "@/plane-web/components/pages/navigation-pane";
import { EPageStoreType } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageActions } from "../../dropdowns";
import { ExportPageModal } from "../../modals/export-page-modal";
import { PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM } from "../../navigation-pane";
import { MoveToProjectModal } from "../../wiki/modals/move-to-project-modal";

type Props = {
  page: TPageInstance;
  storeType: EPageStoreType;
};

export const PageOptionsDropdown = observer(function PageOptionsDropdown(props: Props) {
  const { page, storeType } = props;
  // states
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isMoveToProjectModalOpen, setIsMoveToProjectModalOpen] = useState(false);
  // params
  const { workspaceSlug } = useParams();
  // navigation
  const router = useAppRouter();
  // store values
  const {
    name,
    isContentEditable,
    canCurrentUserEditPage,
    editor: { editorRef },
  } = page;
  // page filters
  const { isFullWidth, handleFullWidth, isStickyToolbarEnabled, handleStickyToolbar } = usePageFilters();
  // query params
  const { updateQueryParams } = useQueryParams();
  // Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - project->Wiki direction
  const { moveToWiki, isConverting } = usePageConvertToWikiOperation({
    workspaceSlug: workspaceSlug?.toString() ?? "",
    pageId: page.id,
  });
  // menu items list
  const EXTRA_MENU_OPTIONS = useMemo(
    function EXTRA_MENU_OPTIONS(): React.ComponentProps<typeof PageActions>["extraOptions"] {
      return [
        {
          key: "full-screen",
          action: () => handleFullWidth(!isFullWidth),
          customContent: (
            <>
              Full width
              <ToggleSwitch value={isFullWidth} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
        },
        {
          key: "sticky-toolbar",
          action: () => handleStickyToolbar(!isStickyToolbarEnabled),
          customContent: (
            <>
              Sticky toolbar
              <ToggleSwitch value={isStickyToolbarEnabled} onChange={() => {}} />
            </>
          ),
          className: "flex items-center justify-between gap-2",
          shouldRender: isContentEditable,
        },
        {
          key: "copy-markdown",
          action: () => {
            if (!editorRef) return;
            editorRef.copyMarkdownToClipboard();
            setToast({
              type: TOAST_TYPE.SUCCESS,
              title: "Success!",
              message: "Markdown copied to clipboard.",
            });
          },
          title: "Copy markdown",
          icon: Clipboard,
          shouldRender: true,
        },
        {
          key: "version-history",
          action: () => {
            // update query param to show info tab in navigation pane
            const updatedRoute = updateQueryParams({
              paramsToAdd: {
                [PAGE_NAVIGATION_PANE_TABS_QUERY_PARAM]: "info" satisfies TPageNavigationPaneTab,
              },
            });
            router.push(updatedRoute);
          },
          title: "Version history",
          icon: History,
          shouldRender: true,
        },
        {
          key: "export",
          action: () => setIsExportModalOpen(true),
          title: "Export",
          icon: ArrowUpToLine,
          shouldRender: true,
        },
        // Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - the
        // two symmetric project<->Wiki scope-conversion actions, gated on
        // the exact same edit-access rule the backend's `convert` endpoint
        // enforces (owner, or workspace/project ADMIN+MEMBER) rather than
        // the stricter admin/owner-only `canCurrentUserMovePage` (which
        // governs the unrelated EE cross-project "Move" action).
        {
          key: "move-to-wiki",
          action: moveToWiki,
          title: "Move to Wiki",
          icon: WikiIcon,
          shouldRender: storeType === EPageStoreType.PROJECT && canCurrentUserEditPage && !isConverting,
        },
        {
          key: "move-to-project",
          action: () => setIsMoveToProjectModalOpen(true),
          title: "Move to project",
          icon: Briefcase,
          shouldRender: storeType === EPageStoreType.WORKSPACE && canCurrentUserEditPage,
        },
      ];
    },
    [
      handleFullWidth,
      isFullWidth,
      handleStickyToolbar,
      isStickyToolbarEnabled,
      isContentEditable,
      editorRef,
      updateQueryParams,
      router,
      setIsExportModalOpen,
      storeType,
      canCurrentUserEditPage,
      moveToWiki,
      isConverting,
    ]
  );

  return (
    <>
      <ExportPageModal
        editorRef={editorRef}
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        pageTitle={name ?? ""}
      />
      {storeType === EPageStoreType.WORKSPACE && (
        <MoveToProjectModal
          isOpen={isMoveToProjectModalOpen}
          onClose={() => setIsMoveToProjectModalOpen(false)}
          workspaceSlug={workspaceSlug?.toString() ?? ""}
          page={page}
        />
      )}
      <PageActions
        extraOptions={EXTRA_MENU_OPTIONS}
        optionsOrder={[
          "full-screen",
          "sticky-toolbar",
          "copy-markdown",
          "version-history",
          "make-a-copy",
          "archive-restore",
          "delete",
          "toggle-access",
          "export",
          "move-to-wiki",
          "move-to-project",
        ]}
        page={page}
        storeType={storeType}
      />
    </>
  );
});
