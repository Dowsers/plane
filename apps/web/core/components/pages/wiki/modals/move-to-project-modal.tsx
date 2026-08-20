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
import { EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// components
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";
// store
import type { TPageInstance } from "@/store/pages/base-page";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  page: TPageInstance;
};

/**
 * Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - "Deplacer
 * vers un projet", the Wiki-side of the project<->Wiki conversion action.
 * Symmetric to the project-side "Deplacer vers le Wiki" action (see
 * `usePageConvertOperations`), which needs no target picker since a Wiki
 * page has exactly one possible destination scope.
 */
export const MoveToProjectModal = observer(function MoveToProjectModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, page } = props;
  // states
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // router
  const router = useAppRouter();
  // store hooks
  const { convertToProject } = usePageStore(EPageStoreType.WORKSPACE);

  const handleClose = () => {
    setProjectId(null);
    onClose();
  };

  const handleSubmit = async () => {
    if (!page.id || !projectId) return;
    setIsSubmitting(true);
    try {
      await convertToProject(workspaceSlug, page.id, projectId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Page moved to the project." });
      handleClose();
      router.push(`/${workspaceSlug}/projects/${projectId}/pages/${page.id}`);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || "The page could not be moved. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="space-y-4 p-5">
        <h3 className="text-18 font-medium text-secondary">Move to project</h3>
        <p className="text-13 text-secondary">
          Choose the project this page should move into. Its version history and sub-pages are preserved.
        </p>
        <ProjectDropdown
          buttonVariant="border-with-text"
          multiple={false}
          value={projectId}
          onChange={(val: string) => setProjectId(val)}
          placeholder="Select a project"
          className="w-full"
          buttonClassName="w-full"
        />
      </div>
      <div className="flex items-center justify-end gap-2 border-t-[0.5px] border-subtle px-5 py-4">
        <Button variant="secondary" size="lg" onClick={handleClose}>
          Cancel
        </Button>
        <Button variant="primary" size="lg" loading={isSubmitting} disabled={!projectId} onClick={handleSubmit}>
          Move
        </Button>
      </div>
    </ModalCore>
  );
});
