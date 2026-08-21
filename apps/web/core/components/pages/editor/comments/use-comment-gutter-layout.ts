/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import type { EditorRefApi } from "@plane/editor";

const CARD_GAP_PX = 12;
const DEFAULT_CARD_HEIGHT_PX = 96;

export type TGutterAnchor = {
  id: string;
  anchorId: string;
};

type Args = {
  containerRef: React.RefObject<HTMLDivElement | null>;
  cardRefs: React.RefObject<Map<string, HTMLDivElement>>;
  anchors: TGutterAnchor[];
  editorRef: EditorRefApi | null;
};

/**
 * Finds the nearest scrollable ancestor of `element` by walking up
 * `parentElement` and checking computed `overflow-y`, falling back to
 * `window`. A native `scroll` event never bubbles past the element it
 * fires on, so the gutter's scroll listener has to be attached directly
 * to whichever element actually scrolls the Page's content (the `Row`
 * wrapper in `editor-body.tsx`, `overflow-y-auto`) - walking up from our
 * own container ref avoids threading a extra DOM ref down through
 * `editor-body.tsx` just for this.
 */
function getScrollableAncestor(element: HTMLElement | null): HTMLElement | Window {
  let current = element?.parentElement ?? null;
  while (current) {
    const { overflowY } = window.getComputedStyle(current);
    if (overflowY === "auto" || overflowY === "scroll") return current;
    current = current.parentElement;
  }
  return window;
}

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages"
 * + "Resolution de fils de commentaires") - the comment gutter's real
 * visual-alignment positioning, per this feature's explicit build brief
 * (the user chose real continuous alignment over a flat list).
 *
 * Algorithm:
 * 1. For every live (non-orphaned) anchor, ask the editor for the current
 *    viewport rect of its FIRST rendered occurrence
 *    (`EditorRefApi.getCommentAnchorRect`).
 * 2. Convert each rect's `top` into a position relative to the gutter's
 *    own container (`rect.top - containerRect.top`) - both read via
 *    `getBoundingClientRect()` at the same instant, so the delta is valid
 *    regardless of the current scroll offset (the container scrolls
 *    together with the document, it isn't `position: fixed`).
 * 3. Sort by that raw position, then greedily stack: walk the sorted list
 *    keeping a running `cursor` (the first free pixel row below every
 *    card placed so far); each card's final `top` is
 *    `max(rawTop, cursor)`, and `cursor` advances to
 *    `top + measuredHeight + CARD_GAP_PX` - the standard Notion/Google
 *    Docs greedy vertical-stacking collision-avoidance scheme this
 *    feature's build brief asks for, nothing fancier.
 * 4. Apply the computed `top` via `transform: translateY(px)` directly on
 *    each card's DOM node (bypassing React state/re-render for this) -
 *    `transform` is compositor-only, so this stays smooth even when
 *    recomputed frequently, and avoids a React render pass on every
 *    scroll/resize tick.
 *
 * Recomputes: synchronously (via `useLayoutEffect`, before paint - avoids
 * a visible flash) whenever the set of anchors or the editor ref changes;
 * and rAF-throttled (never synchronously on every raw event - would jank)
 * on scroll (of the actual scrolling ancestor, found via
 * `getScrollableAncestor` - `scroll` events don't bubble), window resize,
 * a `ResizeObserver` on the gutter container itself (content reflow, e.g.
 * a card's own height changing as its content wraps differently), and
 * editor transactions (`EditorRefApi.onStateChange` - concurrent
 * collaborative edits reflowing the document).
 */
export function useCommentGutterLayout({ containerRef, cardRefs, anchors, editorRef }: Args) {
  const rafRef = useRef<number | null>(null);

  const recompute = useCallback(() => {
    const container = containerRef.current;
    if (!container || !editorRef) return;
    const containerTop = container.getBoundingClientRect().top;

    const positioned: { id: string; top: number; height: number }[] = [];
    anchors.forEach(({ id, anchorId }) => {
      const rect = editorRef.getCommentAnchorRect(anchorId);
      if (!rect) return; // orphaned, or not synced into the DOM yet - skip this tick
      const cardElement = cardRefs.current?.get(id);
      const height = cardElement?.getBoundingClientRect().height ?? DEFAULT_CARD_HEIGHT_PX;
      positioned.push({ id, top: rect.top - containerTop, height });
    });

    positioned.sort((a, b) => a.top - b.top);

    let cursor = 0;
    positioned.forEach((item) => {
      const top = Math.max(item.top, cursor, 0);
      const cardElement = cardRefs.current?.get(item.id);
      if (cardElement) cardElement.style.transform = `translateY(${top}px)`;
      cursor = top + item.height + CARD_GAP_PX;
    });
  }, [anchors, cardRefs, containerRef, editorRef]);

  const scheduleRecompute = useCallback(() => {
    if (rafRef.current !== null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      recompute();
    });
  }, [recompute]);

  useLayoutEffect(() => {
    recompute();
  }, [recompute]);

  useEffect(() => {
    const scrollParent = getScrollableAncestor(containerRef.current);
    const resizeObserver = new ResizeObserver(() => scheduleRecompute());
    if (containerRef.current) resizeObserver.observe(containerRef.current);

    scrollParent.addEventListener("scroll", scheduleRecompute, { passive: true });
    window.addEventListener("resize", scheduleRecompute);
    const stopListeningToEditor = editorRef?.onStateChange(() => scheduleRecompute());

    return () => {
      scrollParent.removeEventListener("scroll", scheduleRecompute);
      window.removeEventListener("resize", scheduleRecompute);
      resizeObserver.disconnect();
      stopListeningToEditor?.();
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // `containerRef`/`cardRefs` are stable ref objects - only `editorRef`
    // and `scheduleRecompute` ever actually change identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorRef, scheduleRecompute]);

  return { scheduleRecompute };
}
