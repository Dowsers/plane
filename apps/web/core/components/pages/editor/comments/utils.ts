/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages" +
 * "Resolution de fils de commentaires") - every comment composer in this
 * feature (the bubble-menu create popup in `packages/editor`, and the
 * reply/edit composer here) is a plain `<textarea>`, not a nested Tiptap
 * instance - a deliberate scope trade-off documented in this feature's
 * build report (embedding a second rich-text editor inside the bubble
 * menu, or standing up a whole separate editor instance per composer in
 * the gutter, is a substantially larger and riskier surface than this
 * feature's real hard problem, the gutter's positioning algorithm).
 * `comment_html` is therefore built by escaping the plain text and
 * wrapping it in a single `<p>`, turning line breaks into `<br />` -
 * `comment_stripped` is computed server-side regardless.
 */
export function escapeHtmlToParagraph(text: string): string {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return `<p>${escaped.replace(/\n/g, "<br />")}</p>`;
}
