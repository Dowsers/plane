/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IUserLite } from "../users";

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - mirrors the shape of
 * `PageCommentReactionSerializer` (apps/api/plane/app/serializers/page.py),
 * itself a mirror of `TPageReaction` (category 10, feature 2) scoped to a
 * `PageComment` instead of a `Page`.
 */
export type TPageCommentReaction = {
  id: string;
  comment: string;
  actor: string;
  actor_detail?: IUserLite;
  reaction: string;
  created_at?: string;
};

/**
 * Category 10, features 1+3 (merged) - mirrors `PageCommentSerializer`.
 *
 * `parent` is `null` for the root of a thread, and the root comment's `id`
 * for a reply - replies never carry their own `anchor_id`/`anchor_text`
 * (they inherit the root's anchor, see `PageComment.save()` server-side).
 * `replies` is only ever populated on a root (a reply's own `replies` is
 * always `[]` - see `PageCommentSerializer.get_replies`).
 */
export type TPageComment = {
  id: string;
  workspace: string;
  page: string;
  parent: string | null;
  // Shared with the `data-comment-id` attribute of the Tiptap
  // `InlineComment` Mark (packages/editor) - required on a root, always
  // `null` on a reply.
  anchor_id: string | null;
  anchor_text: string | null;
  // Server-computed (see `plane.utils.page_comment.reconcile_page_comment_anchors`)
  // - true once no occurrence of `anchor_id` survives in the Page's
  // current `description_html`. Only ever meaningful on a root.
  is_orphaned: boolean;
  comment_stripped: string;
  comment_json: object;
  comment_html: string;
  is_resolved: boolean;
  resolved_by: string | null;
  resolved_at: string | null;
  actor: string;
  actor_detail?: IUserLite;
  created_at: string;
  updated_at: string;
  created_by?: string | null;
  updated_by?: string | null;
  replies: TPageComment[];
  reactions: TPageCommentReaction[];
};

/** Body of `POST .../pages/:page_id/comments/` - the only place `anchor_id`/
 * `anchor_text` are writable (feature 1 exigence 1/2: minted/snapshotted
 * client-side when the `InlineComment` Mark is inserted). */
export type TPageCommentCreatePayload = {
  anchor_id: string;
  anchor_text: string;
  comment_html: string;
};

/** Body of `POST .../comments/:pk/replies/` - no anchor fields, a reply
 * inherits the root's anchor. */
export type TPageCommentReplyPayload = {
  comment_html: string;
};

/** Body of `PATCH .../comments/:pk/` - author-only text edit. */
export type TPageCommentUpdatePayload = {
  comment_html: string;
};
