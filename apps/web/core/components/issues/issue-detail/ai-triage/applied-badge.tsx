/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Sparkles } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, EPillVariant, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { cn } from "@plane/utils";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local imports
import { useAITriageSuggestion } from "./use-ai-triage-suggestion";
import type { TIssueOperations } from "../root";
import type { TIssueTriageSuggestionField } from "@plane/types";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  field: TIssueTriageSuggestionField;
  issueOperations: TIssueOperations;
  disabled?: boolean;
};

/**
 * Small "IA" badge rendered next to the Module/Assignees/Labels property
 * label once that field has been auto-applied or human-accepted (spec's
 * own wording, "Considerations API/UX": "les champs auto-appliques
 * affichent un badge IA; au survol, un lien 'Annuler' revient a l'etat
 * precedent"). Reads from the SAME SWR cache entry as
 * `AITriageSuggestionSection` (`useAITriageSuggestion`) - no extra request.
 *
 * "Undo" (shown on hover, matching the spec's own "au survol") removes
 * exactly the AI-suggested value ids for this field via the SAME update
 * calls the real Module/Assignee/Label selectors already use
 * (`issueOperations.update`/`changeModulesInIssue`) - not a bespoke revert
 * mechanism, and not a blanket "clear the whole field" (application is
 * additive - see `_apply_field_ids_to_issue`,
 * apps/api/plane/utils/issue_triage_suggestion.py - so a human may have
 * added further values on top since). There is no dedicated backend "undo"
 * endpoint; this is a normal field edit like any other, just pre-filled
 * with the AI's own contribution as the removal target.
 */
export const AITriageAppliedBadge = observer(function AITriageAppliedBadge(props: Props) {
  const { workspaceSlug, projectId, issueId, field, issueOperations, disabled = false } = props;
  const { t } = useTranslation();
  const {
    issue: { getIssueById },
  } = useIssueDetail();
  const { suggestion } = useAITriageSuggestion(workspaceSlug, projectId, issueId, true);

  if (!suggestion || !suggestion.applied_fields.includes(field)) return null;

  const issue = getIssueById(issueId);
  const suggestedIds =
    field === "module"
      ? suggestion.suggested_module_ids
      : field === "assignees"
        ? suggestion.suggested_assignee_ids
        : suggestion.suggested_label_ids;

  const handleUndo = async () => {
    if (!issue || suggestedIds.length === 0) return;
    try {
      if (field === "module") {
        await issueOperations.changeModulesInIssue?.(workspaceSlug, projectId, issueId, [], suggestedIds);
      } else if (field === "assignees") {
        await issueOperations.update(workspaceSlug, projectId, issueId, {
          assignee_ids: (issue.assignee_ids ?? []).filter((id) => !suggestedIds.includes(id)),
        });
      } else {
        await issueOperations.update(workspaceSlug, projectId, issueId, {
          label_ids: (issue.label_ids ?? []).filter((id) => !suggestedIds.includes(id)),
        });
      }
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: t("ai.triage.undo_error") });
    }
  };

  return (
    <span className="group/ai-badge inline-flex items-center gap-1">
      <Tooltip tooltipContent={t("ai.triage.applied_badge_tooltip")} position="top">
        <span>
          <Pill variant={EPillVariant.INFO} size={EPillSize.XS} className="inline-flex shrink-0 items-center gap-0.5">
            <Sparkles className="size-2.5" aria-hidden="true" />
            {t("ai.triage.applied_badge_label")}
          </Pill>
        </span>
      </Tooltip>
      {!disabled && (
        <button
          type="button"
          onClick={handleUndo}
          className={cn(
            "hidden text-11 text-tertiary group-hover/ai-badge:inline hover:text-accent-primary hover:underline"
          )}
        >
          {t("ai.triage.undo")}
        </button>
      )}
    </span>
  );
});
