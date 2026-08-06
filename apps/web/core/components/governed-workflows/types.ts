/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkflowTransitionAction, TWorkflowTransitionApprover, TWorkflowTransitionCondition } from "@plane/types";

/** `TWorkflowTransitionApprover` plus a stable local React key - needed
 * because approvers only get a persisted `id` once the transition is saved,
 * so the in-progress edit form needs an identity that survives array
 * mutations (add/remove) even before any `id` exists - same convention as
 * the sibling workflow-rules feature's `TLocalWorkflowAction`. */
export type TLocalWorkflowTransitionApprover = TWorkflowTransitionApprover & { _key: string };

export type TLocalWorkflowTransitionCondition = TWorkflowTransitionCondition & { _key: string };

export type TLocalWorkflowTransitionAction = TWorkflowTransitionAction & { _key: string };
