/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IWorkspaceSearchSnippet } from "@plane/types";

type Props = {
  snippet: IWorkspaceSearchSnippet | null | undefined;
};

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 6 ("Recherche approfondie dans la Command
 * Palette"), exigence 4 - renders a `snippet` (pre-truncated, HTML-free
 * excerpt + a `highlight_start`/`highlight_end` offset pair - see
 * `GlobalSearchEndpoint._build_snippet`, apps/api/plane/app/views/search/base.py)
 * with its matched term bolded/highlighted, by slicing `text` at the given
 * offsets - never `dangerouslySetInnerHTML`, since `text` is plain text,
 * never HTML.
 *
 * Visually reuses the `<mark>` styling already established by
 * `HighlightedExcerpt` (apps/web/core/components/issues/duplicate-detection/
 * highlighted-excerpt.tsx, category 9's duplicate-detection feature) for
 * consistency, even though that component's term-list-based regex
 * highlighting isn't reusable as-is here (this feature's backend hands back
 * an exact offset pair instead of a list of terms to re-locate client-side).
 */
export function PowerKSearchResultSnippet(props: Props) {
  const { snippet } = props;
  if (!snippet || !snippet.text) return null;

  const { text, highlight_start, highlight_end } = snippet;
  const start = Math.max(0, Math.min(highlight_start, text.length));
  const end = Math.max(start, Math.min(highlight_end, text.length));

  return (
    <p className="mt-0.5 w-full truncate text-11 text-tertiary">
      {text.slice(0, start)}
      {end > start && (
        <mark className="rounded-sm bg-accent-primary/20 px-0.5 text-primary">{text.slice(start, end)}</mark>
      )}
      {text.slice(end)}
    </p>
  );
}
