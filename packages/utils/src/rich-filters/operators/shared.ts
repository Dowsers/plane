/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TAllAvailableOperatorsForDisplay, TFilterValue, TSupportedOperators } from "@plane/types";
import { isNegatedOperator, NEGATED_OPERATOR_TO_BASE_MAP, RELATIONAL_OPERATOR } from "@plane/types";

/**
 * Result type for operator conversion
 */
export type TOperatorForPayload = {
  operator: TSupportedOperators;
  isNegation: boolean;
};

/**
 * Converts a display operator to the format needed for supported by filter expression condition.
 * Negated display operators (e.g. "not_exact") are resolved back to their base operator ("exact")
 * plus an `isNegation` flag - negation itself is applied structurally (wrapping the leaf in `{ not: {} }`)
 * rather than being a distinct operator/lookup on the wire.
 * @param displayOperator - The operator from the UI
 * @returns Object with supported operator and negation flag
 */
export const getOperatorForPayload = (displayOperator: TAllAvailableOperatorsForDisplay): TOperatorForPayload => {
  if (isNegatedOperator(displayOperator)) {
    return {
      operator: NEGATED_OPERATOR_TO_BASE_MAP[displayOperator],
      isNegation: true,
    };
  }

  return {
    operator: displayOperator,
    isNegation: false,
  };
};

/**
 * Returns the default value a condition should take on when its operator changes/resets.
 * Every operator defaults to `undefined` (no value yet) except ISNULL, whose value is a fixed
 * boolean and requires no user input - it's implicitly "true" the moment the operator is selected.
 * @param operator - The (base, non-negated) operator to get the default value for
 * @returns The default value for the operator
 */
export const getDefaultValueForOperator = (operator: TSupportedOperators): TFilterValue | undefined =>
  operator === RELATIONAL_OPERATOR.ISNULL ? true : undefined;
