/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Mark, mergeAttributes } from "@tiptap/core";
import type { Plugin } from "@tiptap/pm/state";
// constants
import { CORE_EXTENSIONS } from "@/constants/extension";
// local imports
import { inlineCommentClickHandler } from "./helpers/click-handler";

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - Tiptap Mark carrying the
 * `data-comment-id` attribute shared with `PageComment.anchor_id`
 * (apps/api/plane/db/models/page_comment.py). Structurally modeled on
 * `CustomLinkExtension` (`extensions/custom-link/extension.tsx`) per this
 * feature's own build brief: a plain `Mark.create(...)` with a single
 * attribute serialized as a `data-*` HTML attribute, `parseHTML`/
 * `renderHTML` round-tripping it, and a ProseMirror click-handler plugin.
 *
 * Deliberately NOT registered in `extensions/core-without-props.ts`
 * (`CoreEditorExtensionsWithoutProps`/`DocumentEditorExtensionsWithoutProps`,
 * used only for headless HTML<->Yjs binary conversions - see
 * `helpers/yjs-utils.ts`): a schema that doesn't know this Mark simply
 * drops any `data-comment-id` span it encounters on `generateJSON`/
 * `generateHTML` round-trips (an unrecognized inline Mark's HTML doesn't
 * match any `parseHTML` rule, so its text survives but the wrapping
 * highlight doesn't) - which is exactly feature 1 exigence 13 ("les
 * exports PDF/Word/Markdown n'incluent jamais les commentaires ni leurs
 * surlignages"), satisfied for free by simply not registering the Mark on
 * that schema, with no bespoke export-scrubbing code needed.
 *
 * No `appendTransaction` orphan-scanning pass, and no `transformPasted`
 * override either - both are deliberate simplifications from this
 * feature's own build brief:
 * - Orphan detection is entirely server-side (see
 *   `plane.utils.page_comment.reconcile_page_comment_anchors`, run on every
 *   description save) - this extension's only jobs are inserting the Mark
 *   and rendering it, never scanning the doc for survivors itself.
 * - Duplicating text that carries this Mark (copy/paste elsewhere in the
 *   document, exigence 7) must PRESERVE `commentId` rather than regenerate
 *   it, so every occurrence keeps pointing at the same thread - the exact
 *   opposite of `extensions/unique-id/plugin.ts`'s own `transformPasted`
 *   handler, which deliberately STRIPS its node-level id on paste/drop so
 *   `appendTransaction` mints a fresh one (avoiding duplicate block ids).
 *   That stripping is a `Node`-attribute concern (global attributes on
 *   block nodes, applied via a dedicated ProseMirror plugin) - a Mark's
 *   attributes have no equivalent default-strip behavior to begin with:
 *   ProseMirror already carries a Mark (and all of its attributes,
 *   `commentId` included) along with the text it decorates through any
 *   copy/cut/paste `Slice`, unless a plugin explicitly strips it. Simply
 *   not adding a `transformPasted` handler here - i.e. doing nothing,
 *   unlike `unique-id`'s explicit stripping - is what preserves the id,
 *   which is the "opposite" behaviour the build brief asks for.
 */

export type InlineCommentAttributes = {
  commentId: string | null;
};

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    [CORE_EXTENSIONS.INLINE_COMMENT]: {
      /** Applies the Mark to the current selection. */
      setInlineComment: (attributes: InlineCommentAttributes) => ReturnType;
      /** Removes the Mark from the current selection (never called for a
       * genuine thread today - there is no "delete just the highlight"
       * affordance in this feature - kept for symmetry/testability with
       * `CustomLinkExtension.unsetLink`). */
      unsetInlineComment: () => ReturnType;
    };
  }
}

export const InlineCommentExtension = Mark.create({
  name: CORE_EXTENSIONS.INLINE_COMMENT,

  // Lower than `CustomLinkExtension` (1000): a comment highlight should
  // never fight a link for "which mark wins" at render time - both can
  // coexist on the same text run regardless of priority, this only
  // matters for paste-rule/autolink precedence, which this Mark has none
  // of.
  priority: 100,

  // A comment highlight must never "leak" onto text the user types right
  // at its boundary - the anchored range is exactly what was selected at
  // creation time, nothing more. Mirrors `CustomLinkExtension.inclusive()`.
  inclusive() {
    return false;
  },

  addAttributes() {
    return {
      commentId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => {
          if (!attributes.commentId) return {};
          return { "data-comment-id": attributes.commentId };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: "span[data-comment-id]",
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        class: "inline-comment-mark",
      }),
      0,
    ];
  },

  addCommands() {
    return {
      setInlineComment:
        (attributes) =>
        ({ chain }) =>
          chain().setMark(this.name, attributes).run(),
      unsetInlineComment:
        () =>
        ({ chain }) =>
          chain().unsetMark(this.name, { extendEmptyMarkRange: true }).run(),
    };
  },

  addProseMirrorPlugins() {
    const plugins: Plugin[] = [inlineCommentClickHandler()];
    return plugins;
  },
});
