/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * What the current user owes on an inspection project (ISO/IEC 17020
 * §4.1/§4.2), shared by the non-compliance banner, the blocking screen and the
 * signing modal.
 *
 * Backed by `GET .../inspection/me/`, which is on the enforcement gate's
 * exemption list - so this hook keeps returning data for a member who is
 * otherwise fully blocked out of the project. That is the whole point: without
 * it the UI could not tell a blocked user what to sign.
 *
 * Deliberately a plain SWR hook rather than a MobX store: the data is scoped to
 * one project and one user, is read by three components inside the same subtree,
 * and has no cross-page lifetime worth caching globally. SWR's own cache already
 * dedupes the three callers onto one request.
 */
import useSWR from "swr";
import type { TInspectionMyDocument, TProjectInspectionMe } from "@plane/types";
// services
import { InspectionService } from "@/services/inspection.service";

const inspectionService = new InspectionService();

export const PROJECT_INSPECTION_ME = (workspaceSlug: string, projectId: string) =>
  `PROJECT_INSPECTION_ME_${workspaceSlug}_${projectId}`;

export type TInspectionObligationsState = {
  data: TProjectInspectionMe | undefined;
  isLoading: boolean;
  /** Documents with no signature at all, or whose signature is still awaiting
   * (or was refused) managerial review - PENDING does not discharge the
   * obligation, see `plane.utils.inspection_compliance`. */
  outstanding: TInspectionMyDocument[];
  /** Outstanding documents whose grace period has already elapsed. */
  blocked: TInspectionMyDocument[];
  refresh: () => void;
};

/** Review verdicts that let an obligation count as discharged. Mirrors
 * `SATISFYING_REVIEW_STATUSES` in `plane.utils.inspection_compliance` - PENDING
 * (a disclosed conflict nobody has assessed yet) and REJECTED deliberately do
 * NOT satisfy it, because §4.1 asks for a risk ANALYSIS and the analysis is the
 * human verdict, not the signature.
 *
 * Exported so the rule can be tested, and so a future drift from the backend's
 * own list shows up in one place rather than inside a hook. */
export const SATISFYING_REVIEW_STATUSES = ["NOT_REQUIRED", "ACCEPTED", "ACCEPTED_WITH_MEASURES"] as const;

export const isInspectionDocumentSatisfied = (document: TInspectionMyDocument): boolean => {
  const signature = document.signature;
  if (!signature) return false;
  return (SATISFYING_REVIEW_STATUSES as readonly string[]).includes(signature.review_status);
};

export function useInspectionObligations(
  workspaceSlug: string | undefined,
  projectId: string | undefined,
  /** Pass `false` to skip the request entirely - callers use the project's own
   * `is_inspection_enabled` flag so a normal project costs zero requests. */
  enabled = true
): TInspectionObligationsState {
  const shouldFetch = Boolean(enabled && workspaceSlug && projectId);

  const { data, isLoading, mutate } = useSWR(
    shouldFetch ? PROJECT_INSPECTION_ME(workspaceSlug as string, projectId as string) : null,
    shouldFetch ? () => inspectionService.getMyObligations(workspaceSlug as string, projectId as string) : null,
    { revalidateOnFocus: false }
  );

  const documents = data?.documents ?? [];
  const outstanding = documents.filter((document) => !isInspectionDocumentSatisfied(document));
  const blocked = outstanding.filter((document) => Boolean(document.blocked_since));

  return {
    data,
    isLoading: shouldFetch && isLoading,
    outstanding,
    blocked,
    refresh: () => void mutate(),
  };
}
