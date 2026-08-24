/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useLocation } from "react-router";
// plane imports
import type { E_SORT_ORDER, TActivityFilters, EActivityFilterType } from "@plane/constants";
import { BASE_ACTIVITY_FILTER_TYPES, filterActivityOnSelectedFilters } from "@plane/constants";
import type { TCommentsOperations } from "@plane/types";
// components
import { CommentCard } from "@/components/comments/card/root";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// plane web components
import { IssueAdditionalPropertiesActivity } from "@/plane-web/components/issues/issue-details/issue-properties-activity";
import { IssueActivityWorklog } from "@/plane-web/components/issues/worklog/activity/root";
// local imports
import { IssueActivityItem } from "./activity/activity-list";
import { IssueActivityLoader } from "./loader";

// Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
// plane-selfhost), feature 6 ("Recherche approfondie dans la Command
// Palette"), exigence 5 - "~2s" flash-highlight duration for a comment
// reached via a "Comments" search result (or a copied comment link -
// `#comment-<id>`, see the `copyCommentLink` operation in ./helper.tsx,
// whose link this same effect now makes work end-to-end for the first
// time: it already generated a `#comment-<id>` URL, but nothing ever read
// that hash before this feature).
const COMMENT_HIGHLIGHT_DURATION_MS = 2000;
const COMMENT_HASH_PATTERN = /^#comment-(.+)$/;

type TIssueActivityCommentRoot = {
  workspaceSlug: string;
  projectId: string;
  isIntakeIssue: boolean;
  issueId: string;
  selectedFilters: TActivityFilters[];
  activityOperations: TCommentsOperations;
  showAccessSpecifier?: boolean;
  disabled?: boolean;
  sortOrder: E_SORT_ORDER;
};

export const IssueActivityCommentRoot = observer(function IssueActivityCommentRoot(props: TIssueActivityCommentRoot) {
  const {
    workspaceSlug,
    isIntakeIssue,
    issueId,
    selectedFilters,
    activityOperations,
    showAccessSpecifier,
    projectId,
    disabled,
    sortOrder,
  } = props;
  // store hooks
  const {
    activity: { getActivityAndCommentsByIssueId },
    comment: { getCommentById },
  } = useIssueDetail();
  // Category 12, feature 6, exigence 5 - the comment to flash-highlight
  // (from the current URL's `#comment-<id>` hash), and for how much longer.
  // Declared before the early returns below so these hooks always run,
  // regardless of loading state (mobx's `observer` re-renders this
  // component as `activityAndComments` goes from `undefined` to populated,
  // so the effect below still fires once the target comment actually
  // exists in the DOM).
  const location = useLocation();
  const [highlightedCommentId, setHighlightedCommentId] = useState<string | null>(null);
  const handledHashRef = useRef<string | null>(null);
  // derived values
  const activityAndComments = getActivityAndCommentsByIssueId(issueId, sortOrder);

  useEffect(() => {
    const hash = location.hash;
    if (!hash || handledHashRef.current === hash) return;
    const match = hash.match(COMMENT_HASH_PATTERN);
    if (!match) return;
    if (!activityAndComments || activityAndComments.length === 0) return;

    const targetCommentId = decodeURIComponent(match[1]);
    const targetElement = document.getElementById(targetCommentId);
    if (!targetElement) return;

    handledHashRef.current = hash;
    targetElement.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedCommentId(targetCommentId);
    const timeoutId = window.setTimeout(() => setHighlightedCommentId(null), COMMENT_HIGHLIGHT_DURATION_MS);
    return () => window.clearTimeout(timeoutId);
  }, [location.hash, activityAndComments]);

  if (!activityAndComments) return <IssueActivityLoader />;

  if (activityAndComments.length <= 0) return null;

  const filteredActivityAndComments = filterActivityOnSelectedFilters(activityAndComments, selectedFilters);

  return (
    <div>
      {filteredActivityAndComments.map((activityComment, index) => {
        const comment = getCommentById(activityComment.id);
        return activityComment.activity_type === "COMMENT" ? (
          <CommentCard
            key={activityComment.id}
            workspaceSlug={workspaceSlug}
            entityId={issueId}
            comment={comment}
            activityOperations={activityOperations}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
            showAccessSpecifier={!!showAccessSpecifier}
            showCopyLinkOption={!isIntakeIssue}
            disabled={disabled}
            projectId={projectId}
            enableReplies
            highlighted={!!comment && highlightedCommentId === comment.id}
          />
        ) : BASE_ACTIVITY_FILTER_TYPES.includes(activityComment.activity_type as EActivityFilterType) ? (
          <IssueActivityItem
            key={activityComment.id}
            activityId={activityComment.id}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : activityComment.activity_type === "ISSUE_ADDITIONAL_PROPERTIES_ACTIVITY" ? (
          <IssueAdditionalPropertiesActivity
            key={activityComment.id}
            activityId={activityComment.id}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : activityComment.activity_type === "WORKLOG" ? (
          <IssueActivityWorklog
            key={activityComment.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            activityComment={activityComment}
            ends={index === 0 ? "top" : index === filteredActivityAndComments.length - 1 ? "bottom" : undefined}
          />
        ) : (
          <></>
        );
      })}
    </div>
  );
});
