/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { ChevronDown, Sparkles } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TIssueTriageSuggestionField } from "@plane/types";
import { Button } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IssueTriageSuggestionService } from "@/services/issue-triage-suggestion.service";
// local imports
import { AITriageFieldSuggestionRow, FIELD_LABEL_I18N } from "./field-suggestion-row";
import { useAITriageSuggestion } from "./use-ai-triage-suggestion";
import type { TIssueOperations } from "../root";

const issueTriageSuggestionService = new IssueTriageSuggestionService();

const FIELDS: TIssueTriageSuggestionField[] = ["module", "assignees", "labels"];

// Terminal state groups a regenerate is blocked for - mirrors
// `_TERMINAL_STATE_GROUPS` (apps/api/plane/app/views/issue_triage_suggestion.py)
// verbatim, checked client-side purely to disable/hide the button before
// even making the call (the backend still enforces this itself on a 400).
const TERMINAL_STATE_GROUPS = new Set(["completed", "cancelled"]);

// This backend has no websocket/SSE push for the regenerate job - same
// polling convention as `AISummarySection` (category 9, feature 4)'s own
// `POLL_INTERVAL_MS`.
const POLL_INTERVAL_MS = 4000;

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * Category 9, feature 1 - "AI-assisted auto-triage"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). "Suggestions
 * IA" card rendered in the issue detail sidebar, near the Module/Assignees/
 * Labels properties (spec's own wording, "Considerations API/UX").
 *
 * Only ever rendered when a suggestion exists (`GET` returns 200) - a 404
 * (AI triage disabled, or too few historical issues, exigence 10) is
 * "nothing to show", not an error state, and per this feature's own build
 * scope, the "Re-suggerer" action only ever appears once a suggestion
 * already exists to refresh (there's no manual "generate the first
 * suggestion" affordance - generation is always triggered automatically on
 * issue creation, `IssueViewSet.create`'s unconditional `.delay()` call).
 *
 * Guest gating (exigence 8): `GET` is available to every project role
 * including Guest (read-only visibility), but only Member/Admin ever see
 * the accept/reject/regenerate actions - same
 * `getProjectRoleByWorkspaceSlugAndProjectId` pattern `AISummarySection`
 * (feature 4) already established for this exact Guest-vs-Member/Admin
 * split.
 */
export const AITriageSuggestionSection = observer(function AITriageSuggestionSection(props: Props) {
  const { workspaceSlug, projectId, issueId, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { getStateById } = useProjectState();

  const [isOpen, setIsOpen] = useState(true);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateBaselineUpdatedAt, setRegenerateBaselineUpdatedAt] = useState<string | null>(null);

  const { suggestion, isLoading, mutate } = useAITriageSuggestion(workspaceSlug, projectId, issueId, true);

  // Poll while a regeneration is in flight, stopping once the row's own
  // `updated_at` moves past the pre-regenerate snapshot - this backend has
  // no dedicated "generation in progress" status for suggestions (unlike
  // `IssueCommentSummary.status`), so a timestamp diff is the signal.
  useEffect(() => {
    if (!isRegenerating) return;
    const interval = setInterval(() => mutate(), POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isRegenerating, mutate]);

  useEffect(() => {
    if (isRegenerating && suggestion && suggestion.updated_at !== regenerateBaselineUpdatedAt) {
      setIsRegenerating(false);
    }
  }, [isRegenerating, suggestion, regenerateBaselineUpdatedAt]);

  if (isLoading || !suggestion) return null;

  const issue = getIssueById(issueId);
  const stateDetails = issue?.state_id ? getStateById(issue.state_id) : undefined;
  const isTerminalState = !!stateDetails?.group && TERMINAL_STATE_GROUPS.has(stateDetails.group);

  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const canResolve = !disabled && !!currentUserProjectRole && currentUserProjectRole !== EUserPermissions.GUEST;

  const isFieldResolved = (field: TIssueTriageSuggestionField) =>
    suggestion.applied_fields.includes(field) ||
    suggestion.rejected_fields.includes(field) ||
    suggestion.expired_fields.includes(field);

  const suggestedIdsFor = (field: TIssueTriageSuggestionField) =>
    field === "module"
      ? suggestion.suggested_module_ids
      : field === "assignees"
        ? suggestion.suggested_assignee_ids
        : suggestion.suggested_label_ids;

  const pendingFields = FIELDS.filter((field) => !isFieldResolved(field) && suggestedIdsFor(field).length > 0);

  const handleRegenerate = async () => {
    setRegenerateBaselineUpdatedAt(suggestion.updated_at);
    try {
      await issueTriageSuggestionService.regenerateSuggestion(workspaceSlug, projectId, issueId);
      setIsRegenerating(true);
    } catch (error: unknown) {
      const err = error as { error?: string; status?: number };
      if (err?.status === 429) {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.triage.rate_limited") });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: err?.error ?? t("ai.triage.regenerate_error") });
      }
    }
  };

  const regenerateButton = canResolve && (
    <Button
      size="sm"
      variant="neutral-primary"
      onClick={handleRegenerate}
      loading={isRegenerating}
      disabled={isTerminalState}
    >
      {t("ai.triage.regenerate")}
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
          <span className="text-14 font-medium text-primary">{t("ai.triage.title")}</span>
        </button>
        {regenerateButton &&
          (isTerminalState ? (
            <Tooltip tooltipContent={t("ai.triage.terminal_state_tooltip")} position="top">
              <span>{regenerateButton}</span>
            </Tooltip>
          ) : (
            regenerateButton
          ))}
      </div>
      {isOpen && (
        <div className="divide-y divide-subtle border-t border-subtle px-3 py-1">
          {pendingFields.length === 0 && <p className="py-2 text-13 text-tertiary">{t("ai.triage.all_resolved")}</p>}
          {pendingFields.map((field) => (
            <AITriageFieldSuggestionRow
              key={field}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              field={field}
              suggestion={suggestion}
              canResolve={canResolve}
              issueOperations={issueOperations}
              onSuggestionChange={(updated) => mutate(updated, { revalidate: false })}
            />
          ))}
          {suggestion.rejected_fields.length > 0 && (
            <p className="py-1.5 text-12 text-tertiary">
              {t("ai.triage.dismissed_trace", {
                fields: suggestion.rejected_fields.map((field) => t(FIELD_LABEL_I18N[field])).join(", "),
              })}
            </p>
          )}
        </div>
      )}
    </div>
  );
});
