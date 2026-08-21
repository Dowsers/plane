/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import type { TInlineCommentHandler } from "@plane/editor";
// store
import type { TPageInstance } from "@/store/pages/base-page";

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages"
 * + "Resolution de fils de commentaires") - builds the
 * `commentHandler` prop `CollaborativeDocumentEditorWithRef` (and, through
 * it, the bubble menu's "Commenter" button) expects, wired to this page
 * instance's `comments` sub-store (`page.comments.createThread`) and its
 * `canCurrentUserCommentOnPage` permission getter.
 */
export function usePageCommentHandler(page: TPageInstance): TInlineCommentHandler {
  // `page.canCurrentUserCommentOnPage` is read here (not just inside the
  // memo factory) so this hook's MobX `observer` caller re-renders - and
  // the memo recomputes - whenever the underlying role/permission changes,
  // not just once at mount.
  const isCommentingEnabled = page.canCurrentUserCommentOnPage;
  return useMemo(
    () => ({
      isCommentingEnabled,
      createThread: async ({ anchorId, anchorText, commentHtml }) => {
        await page.comments.createThread({
          anchor_id: anchorId,
          anchor_text: anchorText,
          comment_html: commentHtml,
        });
      },
    }),
    [isCommentingEnabled, page]
  );
}
