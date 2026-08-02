/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TAllAvailableOperatorsForDisplay, TSupportedOperators } from "@plane/types";
import { NEGATABLE_OPERATOR_TO_NEGATED_MAP } from "@plane/types";

/**
 * Helper function to get the display operator for a condition.
 * Negation is tracked directly on the condition (`isNegation`), so this simply resolves the
 * base operator to its negated display identifier (e.g. "exact" -> "not_exact") when applicable.
 * @param operator - The condition's base (positive) operator
 * @param isNegation - Whether the condition is negated
 * @returns The display operator (possibly negated)
 */
export const getDisplayOperator = (
  operator: TSupportedOperators,
  isNegation?: boolean
): TAllAvailableOperatorsForDisplay => {
  if (!isNegation) return operator;
  return NEGATABLE_OPERATOR_TO_NEGATED_MAP[operator] ?? operator;
};
