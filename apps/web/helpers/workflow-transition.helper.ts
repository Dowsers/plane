/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TIssueTransitionDeniedError } from "@plane/types";

/**
 * Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
 * section 4 in plane-selfhost) - phase 2 of the backend changed the
 * state-changing issue PATCH endpoints to return a 403 with
 * `{"error_code": "TRANSITION_NOT_ALLOWED", "reason": "..."}` when a
 * transition is denied, instead of the usual validation-error shape. Every
 * issue-state-changing call site in the frontend (state dropdown, kanban/list
 * drag-and-drop, inline block/spreadsheet state cell) throws this object
 * as-is (see `IssueService.patchIssue`'s `.catch((error) => { throw
 * error?.response?.data; })`), so this same narrow check is needed
 * everywhere a generic "update failed" toast is shown today, to surface the
 * real reason instead of a meaningless generic message.
 */
export const isTransitionDeniedError = (error: unknown): error is TIssueTransitionDeniedError =>
  typeof error === "object" &&
  error !== null &&
  (error as Partial<TIssueTransitionDeniedError>).error_code === "TRANSITION_NOT_ALLOWED";

/** Returns the backend's own denial reason when `error` is a governed-
 * workflow denial, otherwise `fallback`. */
export const getIssueUpdateErrorMessage = (error: unknown, fallback: string): string =>
  isTransitionDeniedError(error) ? error.reason : fallback;
