/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type {
  TExtendedSupportedDateFilterOperators,
  TExtendedSupportedOperators,
  TNegatedSupportedOperators,
} from "@plane/types";
import {
  EXTENDED_COMPARISON_OPERATOR,
  EXTENDED_RELATIONAL_OPERATOR,
  EXTENDED_TEXT_OPERATOR,
  NEGATED_OPERATOR,
} from "@plane/types";

/**
 * Extended operator labels
 *
 * NOTE: these labels are plain strings (not routed through `t()`) to match the existing
 * `CORE_OPERATOR_LABELS_MAP` convention. Wiring real i18n here would require `@plane/utils`
 * (which `getOperatorLabel` lives in) to depend on `@plane/i18n` - but `@plane/i18n` already
 * depends on `@plane/utils`, so that would introduce a circular package dependency. See the
 * feature report for details; this is a pre-existing architectural gap, not introduced here.
 */
export const EXTENDED_OPERATOR_LABELS_MAP: Record<TExtendedSupportedOperators, string> = {
  [EXTENDED_COMPARISON_OPERATOR.GT]: "after",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "after or on",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "before",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "before or on",
  [EXTENDED_TEXT_OPERATOR.ICONTAINS]: "contains",
  [EXTENDED_RELATIONAL_OPERATOR.ISNULL]: "is empty",
} as const;

/**
 * Extended date-specific operator labels
 */
export const EXTENDED_DATE_OPERATOR_LABELS_MAP: Record<TExtendedSupportedDateFilterOperators, string> = {
  [EXTENDED_COMPARISON_OPERATOR.GT]: "after",
  [EXTENDED_COMPARISON_OPERATOR.GTE]: "after or on",
  [EXTENDED_COMPARISON_OPERATOR.LT]: "before",
  [EXTENDED_COMPARISON_OPERATOR.LTE]: "before or on",
} as const;

/**
 * Negated operator labels for all operators.
 * Only operators with `allowNegative: true` (exact/in/range/icontains) ever surface these.
 */
export const NEGATED_OPERATOR_LABELS_MAP: Record<TNegatedSupportedOperators, string> = {
  [NEGATED_OPERATOR.NOT_EXACT]: "is not",
  [NEGATED_OPERATOR.NOT_IN]: "is not any of",
  [NEGATED_OPERATOR.NOT_RANGE]: "not between",
  [NEGATED_OPERATOR.NOT_ICONTAINS]: "does not contain",
} as const;

/**
 * Negated date operator labels for all date operators.
 * Left empty intentionally: the generic negated labels above ("is not", "not between") already read
 * correctly for date fields, so no date-specific overrides are needed.
 */
export const NEGATED_DATE_OPERATOR_LABELS_MAP: Record<never, string> = {} as const;
