/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { ChevronDown, FileText, FolderPlus, Plus } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { CustomMenu } from "@plane/ui";
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// local imports
import { CreateCollectionModal } from "./modals/create-collection-modal";

type Props = {
  workspaceSlug: string;
  collectionId: string | null;
  /** Exigence 4 - root creation of a page/Collection is gated by `wiki_root_creation_role`; creation inside an existing Collection is not. Callers pass `true` unconditionally for the non-root case. */
  canCreate: boolean;
  onPageCreated: (pageId: string) => void;
  /** Compact variant for use inside a Collection row's own "New" affordance. */
  variant?: "header" | "compact";
};

export const WikiCreateMenu = observer(function WikiCreateMenu(props: Props) {
  const { workspaceSlug, collectionId, canCreate, onPageCreated, variant = "header" } = props;
  // states
  const [isCreatingPage, setIsCreatingPage] = useState(false);
  const [isCollectionModalOpen, setIsCollectionModalOpen] = useState(false);
  // store hooks
  const { createPage } = usePageStore(EPageStoreType.WORKSPACE);

  const handleCreatePage = async () => {
    setIsCreatingPage(true);
    try {
      const page = await createPage({ collection_id: collectionId ?? undefined });
      if (page?.id) onPageCreated(page.id);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || "The page could not be created. Please try again.",
      });
    } finally {
      setIsCreatingPage(false);
    }
  };

  if (!canCreate) return null;

  return (
    <>
      <CreateCollectionModal
        isOpen={isCollectionModalOpen}
        onClose={() => setIsCollectionModalOpen(false)}
        workspaceSlug={workspaceSlug}
        parentId={collectionId}
      />
      <CustomMenu
        placement="bottom-end"
        closeOnSelect
        customButton={
          variant === "header" ? (
            <Button variant="primary" size="sm" className="flex items-center gap-1">
              New
              <ChevronDown className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <span className="grid place-items-center rounded-sm p-0.5 text-placeholder hover:bg-layer-1">
              <Plus className="size-3.5" />
            </span>
          )
        }
        disabled={isCreatingPage}
      >
        <CustomMenu.MenuItem onClick={handleCreatePage}>
          <span className="flex items-center gap-2">
            <FileText className="size-3.5" />
            New page
          </span>
        </CustomMenu.MenuItem>
        <CustomMenu.MenuItem onClick={() => setIsCollectionModalOpen(true)}>
          <span className="flex items-center gap-2">
            <FolderPlus className="size-3.5" />
            New folder
          </span>
        </CustomMenu.MenuItem>
      </CustomMenu>
    </>
  );
});
