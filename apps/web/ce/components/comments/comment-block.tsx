/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useRef } from "react";
import { observer } from "mobx-react";
// plane imports
import { CommentReplyIcon } from "@plane/propel/icons";
import type { TIssueComment } from "@plane/types";
import { cn } from "@plane/utils";
// hooks

type TCommentBlock = {
  comment: TIssueComment;
  ends: "top" | "bottom" | undefined;
  children: ReactNode;
  // Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
  // plane-selfhost), feature 6 ("Recherche approfondie dans la Command
  // Palette"), exigence 5 - true for ~2s right after landing on this
  // comment from a "Comments" search result (or a copied comment link -
  // see `IssueActivityCommentRoot`, apps/web/core/components/issues/
  // issue-detail/issue-activity/activity-comment-root.tsx, which owns the
  // timer). Reuses the same `ring-accent-primary ring-2` flash-highlight
  // style already established for Page comment threads
  // (`ThreadCard`'s `isActive`, apps/web/core/components/pages/editor/
  // comments/thread-card.tsx) for visual consistency.
  highlighted?: boolean;
};

export const CommentBlock = observer(function CommentBlock(props: TCommentBlock) {
  const { comment, ends, children, highlighted = false } = props;
  const commentBlockRef = useRef<HTMLDivElement>(null);

  if (!comment) return null;
  return (
    <div
      id={comment.id}
      className={`relative flex gap-3 ${ends === "top" ? `pb-2` : ends === "bottom" ? `pt-2` : `py-2`}`}
      ref={commentBlockRef}
    >
      <div
        className="transition-border absolute top-0 bottom-0 left-[13px] w-px bg-layer-3 duration-1000"
        aria-hidden
      />
      <div
        className={cn(
          "transition-border relative z-[3] flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-lg border border-subtle bg-layer-2 uppercase shadow-raised-100 duration-1000"
        )}
      >
        <CommentReplyIcon width={14} height={14} className="text-secondary" aria-hidden="true" />
      </div>
      <div className="flex flex-grow flex-col gap-3 truncate">
        <div
          className={cn(
            "mb-2 rounded-lg border border-subtle bg-layer-2 p-3 text-body-sm-regular shadow-raised-100 transition-shadow duration-300",
            { "ring-accent-primary ring-2": highlighted }
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
});
