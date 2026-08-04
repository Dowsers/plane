/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TWorkflowAction, TWorkflowRuleCondition } from "@plane/types";

/** `TWorkflowAction` plus a stable local React key - needed because
 * actions are only persisted as a nested array on the rule itself (no
 * per-action id until the rule is saved), so drag-reordering and removal
 * need an identity that survives array mutations even before any `id`
 * exists. */
export type TLocalWorkflowAction = TWorkflowAction & { _key: string };

/** `TWorkflowRuleCondition` plus a stable local React key - conditions have
 * no `id` at all (they're a plain JSON array on the rule, not a related
 * model), and two conditions can otherwise be structurally identical, so
 * array index is the only other candidate key and breaks on removal from
 * the middle of the list. */
export type TLocalWorkflowCondition = TWorkflowRuleCondition & { _key: string };
