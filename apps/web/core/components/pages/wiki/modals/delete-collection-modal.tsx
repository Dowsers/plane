/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TPageCollection } from "@plane/types";
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { usePageCollectionStore } from "@/plane-web/hooks/store";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  collection: TPageCollection;
  /** Whether this Collection currently has any direct child page/sub-folder - purely cosmetic (skips the choice UI when there's nothing to promote/cascade), the mutation itself is safe either way when empty. */
  isEmpty: boolean;
};

/**
 * Exigence 7 - deleting a non-empty Collection is a real destructive
 * action (`cascade=true` soft-deletes every page/sub-folder inside it).
 * This confirmation is mandatory, not optional UI polish - the spec
 * explicitly calls it out.
 */
export const DeleteCollectionModal = observer(function DeleteCollectionModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, collection, isEmpty } = props;
  // states
  const [cascade, setCascade] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  // router
  const router = useAppRouter();
  // store hooks
  const { removeCollection } = usePageCollectionStore();

  const handleClose = () => {
    setCascade(false);
    onClose();
  };

  const handleDelete = async () => {
    setIsDeleting(true);
    try {
      await removeCollection(workspaceSlug, collection.id, cascade);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Folder deleted successfully." });
      handleClose();
      router.push(`/${workspaceSlug}/wiki`);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || "The folder could not be deleted. Please try again.",
      });
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.CENTER} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-18 font-medium text-secondary">Delete folder</h3>
        {isEmpty ? (
          <p className="text-13 text-secondary">
            Are you sure you want to delete <span className="font-medium text-primary">{collection.name}</span>? This
            action cannot be undone.
          </p>
        ) : (
          <>
            <p className="text-13 text-secondary">
              <span className="font-medium text-primary">{collection.name}</span> contains pages or sub-folders. Choose
              what should happen to them, then confirm deletion.
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setCascade(false)}
                className={cn("flex flex-col items-start gap-1 rounded-md border-[0.5px] border-subtle p-3 text-left", {
                  "border-accent-strong bg-layer-1": !cascade,
                })}
              >
                <span className="text-13 font-medium text-primary">Move its contents up a level</span>
                <span className="text-11 text-tertiary">
                  Pages and sub-folders move to this folder&apos;s parent (or the Wiki root).
                </span>
              </button>
              <button
                type="button"
                onClick={() => setCascade(true)}
                className={cn("flex flex-col items-start gap-1 rounded-md border-[0.5px] border-subtle p-3 text-left", {
                  "border-danger-primary bg-danger-primary/10": cascade,
                })}
              >
                <span className="text-13 font-medium text-primary">Delete everything inside it</span>
                <span className="text-11 text-tertiary">
                  This folder, and every page and sub-folder inside it, will be deleted.
                </span>
              </button>
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="error-fill" size="lg" loading={isDeleting} onClick={handleDelete}>
          {cascade ? "Delete everything" : "Delete folder"}
        </Button>
      </div>
    </ModalCore>
  );
});
