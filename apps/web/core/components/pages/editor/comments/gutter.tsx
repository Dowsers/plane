/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { MessageSquareText } from "lucide-react";
// plane imports
import { INLINE_COMMENT_ANCHOR_CLICK_EVENT, type TInlineCommentAnchorClickDetail } from "@plane/editor";
import type { TPageComment } from "@plane/types";
// store
import type { TPageInstance } from "@/store/pages/base-page";
// local imports
import { PageCommentThreadCard } from "./thread-card";
import { useCommentGutterLayout } from "./use-comment-gutter-layout";

const GUTTER_WIDTH_PX = 288;
const GUTTER_GAP_PX = 24;
// Half of `blockWidthClassName`'s `max-w-[720px]`/`max-w-[1152px]`
// (editor-body.tsx) - the gutter is anchored relative to the CENTER of
// `#page-content-container` (50%), which is also the center of the
// (separately) `mx-auto`-centered content column, so no DOM measurement
// is needed for the horizontal offset, only these two known constants.
const HALF_CONTENT_WIDTH_PX = 360;
const HALF_CONTENT_WIDTH_FULL_PX = 576;
// A light poll while the gutter is mounted, on top of focus/visibility
// revalidation - both explicitly allowed by this feature's own UX section
// ("Rafraichissement ... par revalidation SWR (polling leger ou
// invalidation au focus)"). Orphan-anchor status in particular can only
// change server-side (background reconciliation on every description
// save), so a passive fetch-on-focus alone would miss it if the user
// never blurs/refocuses the tab.
const POLL_INTERVAL_MS = 20_000;
const FLASH_DURATION_MS = 1500;

type Props = {
  page: TPageInstance;
  isFullWidth: boolean;
};

/**
 * Category 10, features 1+3 (merged, "Commentaires ancres sur les Pages"
 * + "Resolution de fils de commentaires") - the comment gutter root:
 * fetch/refresh lifecycle, the orphaned-threads fixed section (exigence
 * 6), the "Afficher les commentaires resolus" toggle (exigence 5/feature
 * 3), doc-highlight <-> gutter-card sync (feature 1's UX section), and
 * keeping the document's highlight dimming (`is_resolved`) in sync via
 * `EditorRefApi.setResolvedCommentAnchorIds`. The actual live-anchor
 * positioning/collision-avoidance is `use-comment-gutter-layout.ts`.
 */
export const PageCommentsGutter = observer(function PageCommentsGutter(props: Props) {
  const { page, isFullWidth } = props;
  const { comments } = page;
  // refs
  const containerRef = useRef<HTMLDivElement>(null);
  const cardRefsMapRef = useRef<Map<string, HTMLDivElement>>(new Map());
  // state
  const [flashThreadId, setFlashThreadId] = useState<string | null>(null);
  const flashTimeoutRef = useRef<number | null>(null);

  const registerCardRef = useCallback((id: string, element: HTMLDivElement | null) => {
    if (element) cardRefsMapRef.current.set(id, element);
    else cardRefsMapRef.current.delete(id);
  }, []);

  // --- fetch/refresh lifecycle -----------------------------------------

  useEffect(() => {
    void comments.fetchThreads();

    const revalidate = () => void comments.fetchThreads();
    window.addEventListener("focus", revalidate);
    document.addEventListener("visibilitychange", revalidate);
    const pollId = window.setInterval(revalidate, POLL_INTERVAL_MS);

    return () => {
      window.removeEventListener("focus", revalidate);
      document.removeEventListener("visibilitychange", revalidate);
      window.clearInterval(pollId);
    };
    // Re-runs whenever the page instance itself changes (navigating to a
    // different Page) - `comments` is a stable sub-store for a given
    // `page`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page.id]);

  // --- keep the document's highlight dimming in sync with resolution ---

  useEffect(() => {
    const resolvedAnchorIds = comments.threads
      .filter((thread) => thread.is_resolved && thread.anchor_id)
      .map((thread) => thread.anchor_id as string);
    page.editor.editorRef?.setResolvedCommentAnchorIds(resolvedAnchorIds);
  }, [comments.threads, page.editor.editorRef]);

  // --- document-highlight -> gutter-card sync ---------------------------

  useEffect(() => {
    const handleAnchorClick = (event: Event) => {
      const detail = (event as CustomEvent<TInlineCommentAnchorClickDetail>).detail;
      const thread = comments.threads.find((t) => t.anchor_id === detail.anchorId);
      if (!thread) return;

      comments.setActiveThreadId(thread.id);
      cardRefsMapRef.current.get(thread.id)?.scrollIntoView({ behavior: "smooth", block: "center" });

      setFlashThreadId(thread.id);
      if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
      flashTimeoutRef.current = window.setTimeout(() => setFlashThreadId(null), FLASH_DURATION_MS);
    };

    window.addEventListener(INLINE_COMMENT_ANCHOR_CLICK_EVENT, handleAnchorClick);
    return () => {
      window.removeEventListener(INLINE_COMMENT_ANCHOR_CLICK_EVENT, handleAnchorClick);
      if (flashTimeoutRef.current !== null) window.clearTimeout(flashTimeoutRef.current);
    };
  }, [comments]);

  // --- gutter-card -> document-highlight sync ---------------------------

  const handleCardClick = useCallback(
    (thread: TPageComment) => {
      if (thread.is_orphaned || !thread.anchor_id) return;
      comments.setActiveThreadId(thread.id);
      page.editor.editorRef?.scrollToCommentAnchor(thread.anchor_id);
    },
    [comments, page.editor]
  );

  // --- live-anchor positioning -------------------------------------------

  const liveAnchors = comments.liveThreads
    .filter((thread) => !!thread.anchor_id)
    .map((thread) => ({ id: thread.id, anchorId: thread.anchor_id as string }));

  useCommentGutterLayout({
    containerRef,
    cardRefs: cardRefsMapRef,
    anchors: liveAnchors,
    editorRef: page.editor.editorRef,
  });

  if (comments.threads.length === 0) return null;

  const isPageLockedOrArchived = page.is_locked || !!page.archived_at;
  const halfContentWidth = isFullWidth ? HALF_CONTENT_WIDTH_FULL_PX : HALF_CONTENT_WIDTH_PX;

  return (
    <div
      // `top-[64px]` matches the table-of-content rail's own offset right
      // above (editor-body.tsx) - both are absolutely positioned within
      // the same `#page-content-container`, clearing whatever occupies
      // its first 64px (the page header/toolbar row).
      className="pointer-events-none absolute top-[64px] z-[4] hidden xl:block"
      style={{ left: `calc(50% + ${halfContentWidth + GUTTER_GAP_PX}px)`, width: GUTTER_WIDTH_PX }}
    >
      {/*
        Deliberately NOT `position: sticky`/`overflow-y-auto`: every card
        below (live or orphaned) needs to live in the exact same scrolling
        coordinate space as the document content (a plain descendant of
        `#page-content-container`, itself scrolled by the `Row` wrapper in
        `editor-body.tsx`) so it scrolls together with its anchor - a
        sticky/independently-scrolling wrapper here would decouple the
        two and break the live-alignment this feature's build brief asks
        for. The trade-off: the header below (open count/"show resolved")
        scrolls away with the rest of the gutter rather than staying
        pinned - an accepted simplification, see this feature's build
        report.
      */}
      <div className="pointer-events-auto flex flex-col">
        <div className="mb-2 flex items-center justify-between px-0.5">
          <div className="flex items-center gap-1.5 text-12 font-medium text-secondary">
            <MessageSquareText className="size-3.5" />
            {comments.unresolvedCount} open
          </div>
          <label className="flex items-center gap-1.5 text-11 text-tertiary">
            <input
              type="checkbox"
              checked={comments.showResolved}
              onChange={(e) => comments.setShowResolved(e.target.checked)}
              className="size-3"
            />
            Show resolved
          </label>
        </div>

        {comments.orphanedThreads.length > 0 && (
          <div className="mb-3 flex flex-col">
            {comments.orphanedThreads.map((thread) => (
              <PageCommentThreadCard
                key={thread.id}
                page={page}
                thread={thread}
                layout="static"
                isActive={comments.activeThreadId === thread.id || flashThreadId === thread.id}
                isPageLockedOrArchived={isPageLockedOrArchived}
                registerCardRef={(el) => registerCardRef(thread.id, el)}
                onCardClick={() => handleCardClick(thread)}
              />
            ))}
          </div>
        )}

        {/*
          Collapses to ~0 height on its own (every child is `position:
          absolute`, so none contributes to normal flow) - that's fine,
          it isn't the scrolling viewport, only the positioning reference
          point `use-comment-gutter-layout.ts` measures `getBoundingClientRect()`
          against; cards render at whatever `translateY` the layout hook
          computes regardless of this box's own collapsed height.
        */}
        <div ref={containerRef} className="relative">
          {comments.liveThreads.map((thread) => (
            <PageCommentThreadCard
              key={thread.id}
              page={page}
              thread={thread}
              isActive={comments.activeThreadId === thread.id || flashThreadId === thread.id}
              isPageLockedOrArchived={isPageLockedOrArchived}
              registerCardRef={(el) => registerCardRef(thread.id, el)}
              onCardClick={() => handleCardClick(thread)}
            />
          ))}
        </div>
      </div>
    </div>
  );
});
