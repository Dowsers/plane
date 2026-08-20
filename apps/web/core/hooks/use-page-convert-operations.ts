/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useAppRouter } from "@/hooks/use-app-router";
// plane web hooks
import { EPageStoreType, usePageStore } from "@/plane-web/hooks/store";

/**
 * Category 10, feature 4 ("Wiki workspace en GA") exigence 5 - the
 * project->Wiki direction of the conversion action ("Deplacer vers le
 * Wiki"). Needs no target picker (a Wiki page has exactly one possible
 * destination scope), unlike the symmetric Wiki->project direction (see
 * `MoveToProjectModal`), which does.
 */
export const usePageConvertToWikiOperation = (params: { workspaceSlug: string; pageId?: string }) => {
  const { workspaceSlug, pageId } = params;
  const [isConverting, setIsConverting] = useState(false);
  const router = useAppRouter();
  const { convertToWiki } = usePageStore(EPageStoreType.PROJECT);

  const moveToWiki = async () => {
    if (!pageId) return;
    setIsConverting(true);
    try {
      await convertToWiki(workspaceSlug, pageId);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Success!", message: "Page moved to the Wiki." });
      router.push(`/${workspaceSlug}/wiki/${pageId}`);
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error || "The page could not be moved. Please try again.",
      });
    } finally {
      setIsConverting(false);
    }
  };

  return { moveToWiki, isConverting };
};
