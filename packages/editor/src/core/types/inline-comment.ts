/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - payload handed back to
 * `IEditorProps.commentHandler.createThread` once the user submits the
 * "Commenter" bubble-menu popup. `anchorId` is minted client-side (inside
 * `packages/editor`, at submit time) and the `InlineComment` Mark is
 * already applied to the current selection by the time this fires;
 * `anchorText` is a snapshot of the selected plain text, taken before the
 * Mark is applied. Persisting the thread itself (the actual POST request)
 * is entirely the caller's (`apps/web`) responsibility - `packages/editor`
 * has no HTTP/service layer of its own.
 */
export type TInlineCommentCreatePayload = {
  anchorId: string;
  anchorText: string;
  commentHtml: string;
};

/**
 * Threaded through `IEditorProps` -> ... -> the bubble menu's "Commenter"
 * button (`components/menus/bubble-menu/comment-selector.tsx`), the same
 * way `mentionHandler`/`fileHandler` are already threaded for their own
 * bubble-menu-adjacent features. Left `undefined` on every editor variant
 * that isn't a Page (issue descriptions, comments, ...) - the "Commenter"
 * button simply doesn't render when this is absent, see
 * `EditorBubbleMenu`.
 */
export type TInlineCommentHandler = {
  /**
   * Mirrors the app-level (project or workspace) role/ownership gate
   * `PageCommentPermission`/`WorkspacePageCommentPermission` already
   * enforce server-side for thread creation (project/workspace role ADMIN
   * or MEMBER, unconditionally - see `apps/web/core/store/pages/base-page.ts`'s
   * `canCurrentUserCommentOnPage`). When `false`, the "Commenter" button
   * still doesn't need to be hidden here specifically - locked/archived
   * pages already hide the entire bubble menu via `editor.isEditable` -
   * this covers the remaining case (an editable page the caller still
   * doesn't want commentable, e.g. a MEMBER-gated role check that fails).
   */
  isCommentingEnabled: boolean;
  createThread: (payload: TInlineCommentCreatePayload) => Promise<void>;
};
