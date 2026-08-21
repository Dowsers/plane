/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Plugin, PluginKey } from "@tiptap/pm/state";
// constants
import { INLINE_COMMENT_ANCHOR_CLICK_EVENT, type TInlineCommentAnchorClickDetail } from "@/constants/inline-comment";

/**
 * Category 10, features 1+3 (merged) - feature 1 exigence 2/UX: "clic sur
 * un surlignage dans le texte fait defiler jusqu'au fil correspondant dans
 * la gouttiere (et inversement)". This plugin only handles the
 * doc-highlight -> gutter direction; the reverse (gutter card click ->
 * scroll/flash the document highlight) is `EditorRefApi.scrollToCommentAnchor`
 * (helpers/editor-ref.ts), called directly by the app since it already
 * holds an editor ref.
 *
 * Reads `data-comment-id` straight off the clicked DOM element (via
 * `closest`) rather than resolving a ProseMirror mark/position - simpler,
 * and sufficient here since all we need is "which anchor was this", not a
 * document position to feed back into another editor command.
 *
 * `handleClick` returns `false` unconditionally: this is a pure
 * side-channel notification, it must never suppress the editor's own
 * default click behaviour (placing the cursor, extending a selection).
 */
export function inlineCommentClickHandler(): Plugin {
  return new Plugin({
    key: new PluginKey("inlineCommentClickHandler"),
    props: {
      handleClick: (_view, _pos, event) => {
        if (event.button !== 0) return false;

        const target = event.target;
        const targetElement = target instanceof Element ? target : ((target as Node | null)?.parentElement ?? null);
        const anchorElement = targetElement?.closest<HTMLElement>("[data-comment-id]");
        const anchorId = anchorElement?.getAttribute("data-comment-id");
        if (!anchorId) return false;

        window.dispatchEvent(
          new CustomEvent<TInlineCommentAnchorClickDetail>(INLINE_COMMENT_ANCHOR_CLICK_EVENT, {
            detail: { anchorId },
          })
        );

        return false;
      },
    },
  });
}
