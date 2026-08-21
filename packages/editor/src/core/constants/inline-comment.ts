/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - dispatched on `window` (see the
 * `InlineComment` Mark's click-handler ProseMirror plugin,
 * `extensions/inline-comment/extension.ts`) whenever the user clicks a
 * rendered `data-comment-id` highlight in the document. The comment
 * gutter (apps/web) listens for this to scroll to/flash the matching
 * thread card - the reverse of `EditorRefApi.scrollToCommentAnchor`, which
 * goes the other way (gutter card click -> scroll/flash the document
 * highlight).
 *
 * A plain `window` custom event (rather than threading a new callback prop
 * through the editor component tree, the way `commentHandler` is threaded
 * for thread *creation*) is deliberately the simplest option here: unlike
 * creation, "a highlight was clicked" has no data to send back to the
 * server, it is pure UI-to-UI signalling between two otherwise-unrelated
 * component trees (the ProseMirror click-handler plugin runs deep inside
 * `packages/editor`; the gutter lives in `apps/web`) - a window event
 * avoids prop-drilling a callback through every intermediate editor
 * component for a signal that has exactly one real listener at a time.
 */
export const INLINE_COMMENT_ANCHOR_CLICK_EVENT = "plane-editor:inline-comment-anchor-click";

export type TInlineCommentAnchorClickDetail = {
  anchorId: string;
};
