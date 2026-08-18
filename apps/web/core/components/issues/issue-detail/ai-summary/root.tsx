/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// services
import { AIConfigService } from "@/services/ai-config.service";
import { IssueCommentSummaryService } from "@/services/issue-comment-summary.service";
// local imports
import { AISummaryContent } from "./content";

const issueCommentSummaryService = new IssueCommentSummaryService();
const aiConfigService = new AIConfigService();

// Mirrors `MIN_COMMENTS_FOR_SUMMARY` (apps/api/plane/utils/issue_comment_summary.py).
// No backend field exposes this today, so it's duplicated here deliberately
// rather than guessed - if the backend constant ever changes, this needs
// to change with it. Only gates the FIRST "Generate" click (spec exigence
// 1); once a summary already exists, "Regenerate" is always offered and
// relies on the backend's own re-check + 400 error for the rare case where
// comments were since deleted below the threshold again.
const MIN_COMMENTS_FOR_SUMMARY = 3;

// PENDING summaries are polled at this interval until the Celery task
// finishes - this backend has no websocket/SSE push for this job (see
// `exporter/prev-exports.tsx` for the same polling convention elsewhere in
// this codebase).
const POLL_INTERVAL_MS = 4000;

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
};

/**
 * Category 9, feature 4 - "AI thread summary"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Collapsible
 * banner rendered above the comment list in the issue detail sidebar's
 * Comments/Activity tab (spec's own wording, "Considerations API/UX").
 *
 * Visibility rules (exigences 6/7/8):
 * - Hidden entirely if the workspace hasn't turned on
 *   `is_ai_summary_enabled` - conservative by design, matching the
 *   backend's own "no data ever leaves this workspace until explicitly
 *   enabled" intent (see `Workspace.is_ai_summary_enabled`'s own comment).
 * - Guest: read-only. If no summary has ever been generated for this
 *   issue, nothing is rendered at all (no error, no empty state) - only an
 *   already-cached summary is shown, with no Generate/Regenerate button.
 * - Member/Admin: can trigger generation once the issue has enough
 *   comments. Admins additionally see why the button is disabled (and a
 *   link to Settings > AI) when no AI provider is configured yet - Members
 *   can't read that config (Admin-only endpoint) so they just get the
 *   backend's own 400 error as a toast if they click too early.
 */
export const AISummarySection = observer(function AISummarySection(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false } = props;
  const { t } = useTranslation();
  const { currentWorkspace } = useWorkspace();
  const { getProjectRoleByWorkspaceSlugAndProjectId, allowPermissions } = useUserPermissions();
  const {
    comment: { getCommentsByIssueId },
  } = useIssueDetail();

  const [isOpen, setIsOpen] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);

  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const isGuest = currentUserProjectRole === EUserPermissions.GUEST;
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);

  const isAISummaryEnabled = !!currentWorkspace?.is_ai_summary_enabled;

  const summaryKey = isAISummaryEnabled ? `issue-comment-summary-${workspaceSlug}-${projectId}-${issueId}` : null;
  const {
    data: summary,
    isLoading: isSummaryLoading,
    mutate: mutateSummary,
  } = useSWR(summaryKey, () => issueCommentSummaryService.getSummary(workspaceSlug, projectId, issueId));

  // Only admins can read `/ai-config/` (Admin-only endpoint on the
  // backend) - fetched only for them, purely to power the "not configured"
  // tooltip/link. Members/Guests never attempt this call.
  const aiConfigKey = isAISummaryEnabled && isWorkspaceAdmin ? `ai-config-${workspaceSlug}` : null;
  const { data: aiConfig } = useSWR(aiConfigKey, () => aiConfigService.getConfig(workspaceSlug));

  // Poll while a generation is in flight - this backend has no push
  // mechanism for this job.
  useEffect(() => {
    if (summary?.status !== "PENDING") return;
    const interval = setInterval(() => mutateSummary(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [summary?.status, mutateSummary]);

  if (!isAISummaryEnabled || isSummaryLoading) return null;
  if (isGuest && !summary) return null;

  const commentCount = getCommentsByIssueId(issueId)?.length ?? 0;
  const hasEnoughComments = !!summary || commentCount >= MIN_COMMENTS_FOR_SUMMARY;
  const isProviderNotConfigured = isWorkspaceAdmin && !!aiConfig && !(aiConfig.is_configured && aiConfig.is_enabled);
  const canAttemptGenerate = !isGuest && !disabled && hasEnoughComments && summary?.status !== "PENDING";

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const result = await issueCommentSummaryService.generateSummary(workspaceSlug, projectId, issueId);
      mutateSummary(result, { revalidate: false });
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("ai.summary.error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateButton = canAttemptGenerate && (
    <Button
      size="sm"
      variant="neutral-primary"
      onClick={(e) => {
        e.stopPropagation();
        handleGenerate();
      }}
      loading={isGenerating}
      disabled={isProviderNotConfigured}
    >
      {summary ? t("ai.summary.regenerate") : t("ai.summary.generate")}
    </Button>
  );

  return (
    <div className="rounded-md border border-subtle">
      <div className="flex items-center justify-between gap-3 px-3 py-2.5">
        <button
          type="button"
          className="flex flex-1 items-center gap-2 text-left"
          onClick={() => setIsOpen((prev) => !prev)}
        >
          <ChevronDown className={cn("size-3.5 text-tertiary transition-transform", { "-rotate-90": !isOpen })} />
          <Sparkles className="size-4 text-tertiary" />
          <span className="text-14 font-medium text-primary">{t("ai.summary.title")}</span>
          {summary?.is_stale && (
            <span className="rounded-full bg-layer-3 px-2 py-0.5 text-11 font-medium text-secondary">
              {t("ai.summary.stale_badge")}
            </span>
          )}
        </button>
        {generateButton &&
          (isProviderNotConfigured ? (
            <Tooltip tooltipContent={t("ai.summary.not_configured_admin")} position="top">
              <span>{generateButton}</span>
            </Tooltip>
          ) : (
            generateButton
          ))}
      </div>
      {isOpen && (summary || isProviderNotConfigured || !hasEnoughComments) && (
        <div className="border-t border-subtle px-3 py-2.5">
          {summary ? (
            <AISummaryContent summary={summary} />
          ) : isProviderNotConfigured ? (
            <p className="text-13 text-tertiary">
              {t("ai.summary.not_configured_admin")}{" "}
              <Link href={`/${workspaceSlug}/settings/ai`} className="text-accent-primary hover:underline">
                {t("ai.summary.not_configured_link")}
              </Link>
            </p>
          ) : (
            <p className="text-13 text-tertiary">{t("ai.summary.not_enough_comments")}</p>
          )}
        </div>
      )}
    </div>
  );
});
