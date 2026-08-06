/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkflowTransition } from "@plane/types";

/**
 * CRITICAL, load-bearing warning logic - see
 * apps/api/plane/utils/workflow_transition_engine.py::evaluate_transition
 * ("Step 2" / "Step 3" of that function's own comments) and
 * apps/api/plane/db/models/workflow_transition.py's `WorkflowTransition`
 * docstring: deactivating (or deleting) a project's LAST currently-ACTIVE
 * `WorkflowTransition` row for an issue-type "bucket" does NOT reopen that
 * bucket's workflow to "anything goes" - it freezes ALL transitions for it
 * instead. This is because the engine's "is this bucket governed at all"
 * check counts row EXISTENCE regardless of `is_active` (so the bucket stays
 * CLOSED as long as any row, active or not, still exists for it), while the
 * actual transition-matching step only ever considers `is_active: true`
 * rows (so once none remain, literally nothing matches and every attempted
 * transition is denied with `TRANSITION_NOT_IN_GRAPH`).
 *
 * This mirrors the backend's own `type_filter` construction exactly
 * (`Q(issue_type__isnull=True) | Q(issue_type=<the issue's type>)`) to
 * answer: "after deactivating/deleting `target`, would ANY active row still
 * exist that a governed issue of `target.issue_type` could match against?"
 * - `true` means the change is safe (some other active row still covers
 * it), `false` means this is exactly the freezing trap described above and
 * a prominent warning must be shown before proceeding.
 *
 * NOTE: this only answers the question for issues whose type is exactly
 * `target.issue_type` (or, when `target.issue_type` is itself `null`, for
 * every issue type that has no active type-specific row of its own - this
 * function does not attempt to enumerate every `IssueType` in the project
 * to give a fully precise answer for that broader case, since Issue Types
 * have no usable UI anywhere in this Community-edition build - see
 * `WorkflowTransitionFormModal`'s own module docstring). Deliberately
 * errs toward warning (a false positive is a minor annoyance; a false
 * negative silently freezes a project's workflow) - EXCEPT for the one
 * case `action` exists to distinguish, see below.
 *
 * `action` matters because "existence" (Step 2 above) and "is there an
 * active match" (Step 3) diverge differently depending on what actually
 * happens to `target`'s row:
 * - `"deactivate"`: the row survives (`is_active: false`, still a live,
 *   non-deleted row) - existence for the bucket is unaffected, so this
 *   freezes iff no OTHER row in the bucket is still active.
 * - `"delete"`: `WorkflowTransitionViewSet.destroy` soft-deletes the row
 *   (`SoftDeletionManager` excludes `deleted_at__isnull=False` rows, so a
 *   deleted row stops counting towards Step 2's existence check too - see
 *   plane/db/mixins.py::SoftDeletionManager). If `target` was the ONLY row
 *   left in its bucket (no sibling row of any active status), deleting it
 *   makes the bucket's row count drop to zero, which REOPENS the graph
 *   (`graph_is_open` flips back to `true`, matching the always-allowed
 *   backward-compatible default) - the opposite of freezing. Reusing the
 *   `"deactivate"` formula for this case would show a warning that gets the
 *   actual outcome backwards, not just an overly-cautious one - so this is
 *   the one branch that is NOT allowed to lean on the "false positives are
 *   fine" default above.
 */
export const wouldFreezeIssueTypeBucket = (
  allTransitions: TWorkflowTransition[],
  target: TWorkflowTransition,
  action: "deactivate" | "delete"
): boolean => {
  const sameBucket = (candidate: TWorkflowTransition) =>
    candidate.id !== target.id && (candidate.issue_type === null || candidate.issue_type === target.issue_type);
  const remainingInBucket = allTransitions.filter(sameBucket);
  const remainingActiveInBucket = remainingInBucket.filter((candidate) => candidate.is_active);

  if (action === "delete" && remainingInBucket.length === 0) {
    // Target was the last row of any kind in this bucket - deleting it
    // reopens the graph entirely, it does not freeze it.
    return false;
  }
  return remainingActiveInBucket.length === 0;
};

export const FREEZE_WARNING_MESSAGE =
  "This is the last active rule that still covers this issue type. Turning it off will NOT reopen the workflow to " +
  "“anything goes” - since a rule was ever configured, EVERY transition for this issue type will be blocked " +
  "instead of allowed, until you add another active rule (or remove every rule for this issue type to fully reopen it).";
