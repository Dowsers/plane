/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Copy, X } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
// local imports
import { DuplicateCheckCard } from "./card";
import { useDuplicateCheck } from "./use-duplicate-check";

type Props = {
  workspaceSlug: string | undefined;
  projectId: string | undefined;
  title: string;
  descriptionPlainText: string;
};

// Exigence 3 - "au plus 5 candidats" - the backend already caps this
// itself, `.slice` here is only a defensive display-layer mirror of that
// same cap, never the primary enforcement.
const MAX_CARDS = 5;

/**
 * Category 9, feature 2 - "Detection de doublons/similarite"
 * (docs/feature-specs/09-ai-features.md in plane-selfhost). Non-blocking
 * "Tickets similaires detectes" banner rendered below the title field in
 * the issue creation modal (`issue-modal/form.tsx`) - spec's own wording,
 * "Considerations API/UX": "sous le champ titre, un bandeau non-bloquant...
 * avec jusqu'a 5 cartes... possibilite de continuer la creation malgre
 * tout". Never disables or blocks form submission - it is purely
 * informational, dismissible locally, and re-appears if the draft later
 * changes towards a different set of likely duplicates.
 *
 * Deliberately NOT built on top of the pre-existing (always-empty in this
 * Community fork) upstream "de-dupe" scaffold already wired into this
 * exact form (`DeDupeButtonRoot`/`DuplicateModalRoot`,
 * `useDebouncedDuplicateIssues` in `apps/web/ce/`) - that scaffold's own
 * `TDeDupeIssue` type has no similarity score or "why" explanation at all
 * (a different, never-implemented upstream Commercial mechanism), and its
 * UX shape (a small button that opens a side panel) doesn't match this
 * spec's literal "inline banner directly under the title" requirement.
 * See `packages/types/src/issue-duplicate-suggestion.ts`'s own docstring
 * for the full reasoning.
 */
export const DuplicateCheckBanner = observer(function DuplicateCheckBanner(props: Props) {
  const { workspaceSlug, projectId, title, descriptionPlainText } = props;
  const { t } = useTranslation();
  const { results } = useDuplicateCheck(workspaceSlug, projectId, title, descriptionPlainText);
  const [isDismissed, setIsDismissed] = useState(false);

  const resultIssueIdsKey = results.map((result) => result.issue_id).join(",");

  // A dismiss is local/session-only (never persisted - unlike a real
  // `IssueDuplicateSuggestion` dismiss, this draft has no suggestion row to
  // dismiss yet) and scoped to the CURRENT set of candidates - if the user
  // keeps editing and a materially different candidate set comes back,
  // the banner should reappear rather than staying hidden forever.
  useEffect(() => {
    setIsDismissed(false);
  }, [resultIssueIdsKey]);

  if (results.length === 0 || isDismissed || !workspaceSlug) return null;

  return (
    <div className="mt-2 flex flex-col gap-2 rounded-md border border-subtle bg-surface-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-13 font-medium text-primary">
          <Copy className="size-3.5 text-tertiary" aria-hidden="true" />
          {t("issue_duplicate_check.banner_title")}
        </div>
        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="text-tertiary hover:text-secondary"
          aria-label={t("issue_duplicate_check.dismiss_banner")}
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex flex-col gap-2">
        {results.slice(0, MAX_CARDS).map((result) => (
          <DuplicateCheckCard key={result.issue_id} workspaceSlug={workspaceSlug} result={result} />
        ))}
      </div>
    </div>
  );
});
