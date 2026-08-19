/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
// plane imports
import type { TIssueDuplicateCheckResult } from "@plane/types";
// hooks
import useDebounce from "@/hooks/use-debounce";
// services
import { IssueDuplicateSuggestionService } from "@/services/issue-duplicate-suggestion.service";

const issueDuplicateSuggestionService = new IssueDuplicateSuggestionService();

// Exigence 1, docs/feature-specs/09-ai-features.md ("2. Detection de
// doublons/similarite") in plane-selfhost - "des que le champ titre
// contient au moins N caracteres (N=10)... apres un debounce de 500 ms".
// Entirely a FRONTEND concern - nothing server-side enforces either
// threshold, `IssueDuplicateCheckEndpoint` will happily embed a 1-character
// title if asked to.
const MIN_TITLE_LENGTH = 10;
const DEBOUNCE_MS = 500;

/**
 * Category 9, feature 2 - "Detection de doublons/similarite". Live "draft"
 * duplicate check for the issue creation modal - debounces `title`/
 * `descriptionPlainText` independently via this fork's own existing
 * `useDebounce` hook (`apps/web/core/hooks/use-debounce.tsx`) rather than
 * hand-rolling a new debounce utility, then fires
 * `IssueDuplicateSuggestionService.checkDraft` once the DEBOUNCED title
 * reaches `MIN_TITLE_LENGTH`. Firing on the debounced values (not the raw
 * ones) means a keystroke in either field restarts the 500ms window for
 * both, matching the spec's own "500ms sans frappe" wording across the
 * whole title+description input, not just the title field in isolation.
 *
 * Never throws to the caller - `checkDraft` itself never errors
 * (exigence 12, `{ results: [] }` on any backend-side failure), and a
 * genuine network failure here is swallowed to `[]` too, since this is a
 * purely advisory, non-blocking affordance (spec's own wording:
 * "possibilite de continuer la creation malgre tout") - it must never
 * surface an error toast that could be mistaken for a real form problem.
 *
 * A monotonic request id guards against an out-of-order response (a slow
 * earlier request resolving after a faster later one) clobbering the
 * latest result with stale data.
 */
export function useDuplicateCheck(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  title: string,
  descriptionPlainText: string
) {
  const debouncedTitle = useDebounce(title, DEBOUNCE_MS);
  const debouncedDescription = useDebounce(descriptionPlainText, DEBOUNCE_MS);

  const [results, setResults] = useState<TIssueDuplicateCheckResult[]>([]);
  const [isChecking, setIsChecking] = useState(false);
  const latestRequestId = useRef(0);

  useEffect(() => {
    if (!workspaceSlug || !projectId || debouncedTitle.trim().length < MIN_TITLE_LENGTH) {
      setResults([]);
      return;
    }

    const requestId = ++latestRequestId.current;
    setIsChecking(true);
    issueDuplicateSuggestionService
      .checkDraft(workspaceSlug, projectId, { title: debouncedTitle, description: debouncedDescription })
      .then((response) => {
        if (latestRequestId.current !== requestId) return;
        setResults(response?.results ?? []);
        return;
      })
      .catch(() => {
        if (latestRequestId.current !== requestId) return;
        setResults([]);
      })
      .finally(() => {
        if (latestRequestId.current === requestId) setIsChecking(false);
      });
  }, [workspaceSlug, projectId, debouncedTitle, debouncedDescription]);

  return { results, isChecking };
}
