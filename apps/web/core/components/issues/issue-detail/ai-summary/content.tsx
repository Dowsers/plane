/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Loader2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueCommentSummary, TIssueCommentSummaryCitation } from "@plane/types";
// components
import { HIGHLIGHT_CLASS } from "@/components/issues/issue-layouts/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";

type Props = {
  summary: TIssueCommentSummary;
};

// How long the scrolled-to comment stays highlighted (spec exigence 4:
// "~2 secondes"). The `.highlight` utility itself
// (packages/tailwind-config/index.css) has no built-in fade/duration, so
// removal is done manually here, same as every other `HIGHLIGHT_CLASS`
// consumer in this codebase (issue-layouts/utils.tsx and friends).
const CITATION_HIGHLIGHT_DURATION_MS = 2000;

/**
 * Splits `summary_text` on inline `[n]` citation markers and renders each
 * one as a clickable chip cross-referenced against `citations` by
 * `marker`. A marker with no matching citation entry (should not happen -
 * the backend only ever emits markers it also emits a citation for, see
 * `plane.utils.issue_comment_summary`'s own docstring - but defended
 * against anyway) renders as plain literal text instead of a chip.
 */
export const AISummaryContent = observer(function AISummaryContent(props: Props) {
  const { summary } = props;
  const { t } = useTranslation();
  const {
    comment: { getCommentById },
  } = useIssueDetail();

  const handleCitationClick = (citation: TIssueCommentSummaryCitation) => {
    const commentExists = !!getCommentById(citation.comment_id);
    const element = document.getElementById(citation.comment_id);
    if (!commentExists || !element) {
      setToast({ type: TOAST_TYPE.INFO, title: t("ai.summary.comment_deleted") });
      return;
    }
    element.classList.add(HIGHLIGHT_CLASS);
    element.scrollIntoView({ behavior: "smooth", block: "center" });
    setTimeout(() => element.classList.remove(HIGHLIGHT_CLASS), CITATION_HIGHLIGHT_DURATION_MS);
  };

  if (summary.status === "PENDING") {
    return (
      <div className="flex items-center gap-2 text-13 text-tertiary">
        <Loader2 className="size-3.5 animate-spin" />
        <span>{t("ai.summary.generating")}</span>
      </div>
    );
  }

  if (summary.status === "FAILED") {
    return <p className="text-danger text-13">{t("ai.summary.failed")}</p>;
  }

  const citationByMarker = new Map(summary.citations.map((citation) => [citation.marker, citation]));

  // Each segment's key is its start offset within `summary_text`, not the
  // `.map()` loop index - stable and unique per segment without relying on
  // array position (oxlint's `no-array-index-key`).
  let cursor = 0;
  const segments = summary.summary_text.split(/(\[\d+\])/g).map((segment) => {
    const start = cursor;
    cursor += segment.length;
    return { segment, key: start };
  });

  return (
    <p className="text-13 whitespace-pre-wrap text-primary">
      {segments.map(({ segment, key }) => {
        const match = /^\[(\d+)\]$/.exec(segment);
        if (!match) return <span key={key}>{segment}</span>;

        const marker = Number(match[1]);
        const citation = citationByMarker.get(marker);
        if (!citation) return <span key={key}>{segment}</span>;

        return (
          <button
            key={key}
            type="button"
            onClick={() => handleCitationClick(citation)}
            title={citation.snippet}
            className="hover:bg-layer-4 mx-0.5 inline-flex size-4 items-center justify-center rounded-full bg-layer-3 align-text-top text-11 font-medium text-accent-primary"
          >
            {marker}
          </button>
        );
      })}
    </p>
  );
});
