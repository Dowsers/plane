/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { EUserPermissions } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { TIssueServiceType } from "@plane/types";
import { EIssueServiceType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { DuplicateSuggestionCard } from "./card";
import { useDuplicateSuggestions } from "./use-duplicate-suggestions";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  issueServiceType?: TIssueServiceType;
};

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). "Doublons
 * suggeres" sub-section - spec's own wording, "Considerations API/UX":
 * "nouvelle sous-section... dans le panneau lateral existant
 * 'Relations'/'Related work', visible uniquement s'il existe des
 * suggestions pending". Mounted inside `RelationsCollapsibleContent`
 * (`../content.tsx`), rendering nothing at all (not even a heading) when
 * there are zero pending suggestions - `IssueDetailWidgetCollapsibles`
 * also consults the SAME shared hook to decide whether to render the
 * parent "Relations" collapsible at all, so this section is never hidden
 * behind a collapsed/absent parent (see that file's own comment).
 *
 * Guest gating mirrors the sibling category 9 feature's own
 * `AITriageSuggestionSection`: every project role (including Guest) can
 * see the list (matches the backend's own GET permission,
 * `IssueDuplicateSuggestionListEndpoint`), but the three resolve actions
 * (Ignorer/Marquer comme doublon/Marquer comme lie) are Member/Admin only,
 * matching `IssueDuplicateSuggestionDismissEndpoint`/
 * `IssueDuplicateSuggestionConfirmEndpoint`'s own RBAC.
 */
export const DuplicateSuggestionsSection = observer(function DuplicateSuggestionsSection(props: Props) {
  const { workspaceSlug, projectId, issueId, issueServiceType = EIssueServiceType.ISSUES } = props;
  const { t } = useTranslation();
  const { getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const {
    relation: { fetchRelations },
  } = useIssueDetail(issueServiceType);

  const { suggestions, mutate } = useDuplicateSuggestions(workspaceSlug, projectId, issueId, true);

  if (suggestions.length === 0) return null;

  const currentUserProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const canResolve = !!currentUserProjectRole && currentUserProjectRole !== EUserPermissions.GUEST;

  const handleResolved = (suggestionId: string, relationCreated: boolean) => {
    // Optimistic removal - a resolved suggestion is terminal, it never
    // reappears in this pending list (matches the backend's own status
    // transition, exigence 5).
    mutate((current) => (current ?? []).filter((suggestion) => suggestion.id !== suggestionId), {
      revalidate: false,
    });
    if (relationCreated) {
      // Confirming created a real `IssueRelation` - refresh the relations
      // groups ABOVE this section so it shows up immediately, matching the
      // spec's own "garantit que l'UI Related work existante affiche aussi
      // ces liaisons issues de l'IA".
      fetchRelations(workspaceSlug, projectId, issueId);
    }
  };

  return (
    <div className="flex flex-col gap-2 border-t border-subtle px-2.5 py-3">
      <span className="text-13 font-medium text-primary">{t("issue_duplicate_suggestions.title")}</span>
      <div className="flex flex-col gap-2">
        {suggestions.map((suggestion) => (
          <DuplicateSuggestionCard
            key={suggestion.id}
            workspaceSlug={workspaceSlug}
            projectId={projectId}
            issueId={issueId}
            suggestion={suggestion}
            canResolve={canResolve}
            onResolved={handleResolved}
          />
        ))}
      </div>
    </div>
  );
});
