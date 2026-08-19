/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { LabelFilledIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIssueTriageSuggestion, TIssueTriageSuggestionField } from "@plane/types";
import { cn } from "@plane/utils";
// components
import { ButtonAvatars } from "@/components/dropdowns/member/avatar";
// hooks
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
// services
import { IssueTriageSuggestionService } from "@/services/issue-triage-suggestion.service";
// local imports
import { SimilarIssuesPopover } from "./similar-issues-popover";
import type { TIssueOperations } from "../root";

const issueTriageSuggestionService = new IssueTriageSuggestionService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  field: TIssueTriageSuggestionField;
  suggestion: TIssueTriageSuggestion;
  canResolve: boolean;
  issueOperations: TIssueOperations;
  onSuggestionChange: (suggestion: TIssueTriageSuggestion) => void;
};

export const FIELD_LABEL_I18N: Record<TIssueTriageSuggestionField, string> = {
  module: "ai.triage.fields.module",
  assignees: "ai.triage.fields.assignees",
  labels: "ai.triage.fields.labels",
};

/**
 * One pending field's row inside the "Suggestions IA" section (spec's own
 * wording, "Considerations API/UX" section, "chaque champ suggere porte une
 * icone distinctive... avec actions inline accepter/rejeter"). Only ever
 * rendered by `AITriageSuggestionSection` for a field that (a) has a
 * non-empty suggested-ids array and (b) isn't already in `applied_fields`/
 * `rejected_fields`/`expired_fields` - resolved fields are handled
 * elsewhere (`AITriageAppliedBadge` next to the real property value).
 *
 * Accept/reject calls `.../resolve/` for JUST this one field (exigence 7 -
 * per-field partial resolution, never the whole suggestion at once). A
 * successful accept also re-fetches the issue itself
 * (`issueOperations.fetch`) - `resolve_suggestion_fields` on the backend
 * directly applies the value to `ModuleIssue`/`IssueAssignee`/`IssueLabel`
 * (additive, same as auto-apply), so the issue's own `module_ids`/
 * `assignee_ids`/`label_ids` are now stale in the store until refetched.
 */
export const AITriageFieldSuggestionRow = observer(function AITriageFieldSuggestionRow(props: Props) {
  const { workspaceSlug, projectId, issueId, field, suggestion, canResolve, issueOperations, onSuggestionChange } =
    props;
  const { t } = useTranslation();
  const { getModuleById } = useModule();
  const { getLabelById } = useLabel();
  const { getUserDetails } = useMember();

  const [isResolving, setIsResolving] = useState<"accept" | "reject" | null>(null);

  const valueIds =
    field === "module"
      ? suggestion.suggested_module_ids
      : field === "assignees"
        ? suggestion.suggested_assignee_ids
        : suggestion.suggested_label_ids;
  const confidenceMap =
    field === "module"
      ? suggestion.confidence_modules
      : field === "assignees"
        ? suggestion.confidence_assignees
        : suggestion.confidence_labels;

  const handleResolve = async (action: "accept" | "reject") => {
    setIsResolving(action);
    try {
      const response = await issueTriageSuggestionService.resolveSuggestion(workspaceSlug, projectId, issueId, action, [
        field,
      ]);
      onSuggestionChange(response.suggestion);
      if (action === "accept") await issueOperations.fetch(workspaceSlug, projectId, issueId, false);
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? t("ai.triage.resolve_error");
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsResolving(null);
    }
  };

  const renderValueChip = (id: string) => {
    const confidence = confidenceMap[id];
    const confidenceLabel = typeof confidence === "number" ? ` (${Math.round(confidence * 100)}%)` : undefined;

    if (field === "module") {
      const mod = getModuleById(id);
      if (!mod) return null;
      return (
        <span key={id} className="inline-flex items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-12">
          {mod.name}
          {confidenceLabel && <span className="text-tertiary">{confidenceLabel}</span>}
        </span>
      );
    }

    if (field === "assignees") {
      const user = getUserDetails(id);
      if (!user) return null;
      return (
        <span key={id} className="inline-flex items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-12">
          <ButtonAvatars userIds={id} size="sm" showTooltip={false} />
          {user.display_name}
          {confidenceLabel && <span className="text-tertiary">{confidenceLabel}</span>}
        </span>
      );
    }

    const label = getLabelById(id);
    if (!label) return null;
    return (
      <span key={id} className="inline-flex items-center gap-1 rounded-sm bg-layer-2 px-1.5 py-0.5 text-12">
        <LabelFilledIcon className="size-2.5" color={label.color ?? "#000000"} />
        {label.name}
        {confidenceLabel && <span className="text-tertiary">{confidenceLabel}</span>}
      </span>
    );
  };

  const chips = valueIds.map(renderValueChip).filter(Boolean);
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-col gap-1.5 py-1.5">
      <div className="flex items-center gap-1.5 text-12 text-tertiary">
        <Sparkles className="size-3 shrink-0 text-accent-primary" aria-hidden="true" />
        <span>{t(FIELD_LABEL_I18N[field])}</span>
        <SimilarIssuesPopover
          workspaceSlug={workspaceSlug}
          projectId={projectId}
          similarIssueIds={suggestion.similar_issue_ids}
        />
      </div>
      <div className="flex flex-wrap items-center gap-1 pl-4.5">
        {chips}
        {canResolve && (
          <span className="ml-1 flex items-center gap-0.5">
            <button
              type="button"
              title={t("ai.triage.accept")}
              disabled={isResolving !== null}
              onClick={() => handleResolve("accept")}
              className={cn(
                "text-success grid size-5 place-items-center rounded-sm hover:bg-layer-2",
                isResolving && "opacity-50"
              )}
            >
              <Check className="size-3.5" />
            </button>
            <button
              type="button"
              title={t("ai.triage.reject")}
              disabled={isResolving !== null}
              onClick={() => handleResolve("reject")}
              className={cn(
                "text-danger grid size-5 place-items-center rounded-sm hover:bg-layer-2",
                isResolving && "opacity-50"
              )}
            >
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </div>
    </div>
  );
});
