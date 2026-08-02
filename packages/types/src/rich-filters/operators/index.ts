/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TCoreSupportedOperators } from "./core";
import {
  CORE_LOGICAL_OPERATOR,
  CORE_EQUALITY_OPERATOR,
  CORE_COLLECTION_OPERATOR,
  CORE_COMPARISON_OPERATOR,
  CORE_MULTI_VALUE_OPERATORS,
} from "./core";
import type { TExtendedSupportedOperators } from "./extended";
import {
  EXTENDED_LOGICAL_OPERATOR,
  EXTENDED_EQUALITY_OPERATOR,
  EXTENDED_COLLECTION_OPERATOR,
  EXTENDED_COMPARISON_OPERATOR,
  EXTENDED_TEXT_OPERATOR,
  EXTENDED_RELATIONAL_OPERATOR,
  EXTENDED_MULTI_VALUE_OPERATORS,
} from "./extended";

// -------- COMPOSED OPERATORS --------

export const LOGICAL_OPERATOR = {
  ...CORE_LOGICAL_OPERATOR,
  ...EXTENDED_LOGICAL_OPERATOR,
} as const;

export const EQUALITY_OPERATOR = {
  ...CORE_EQUALITY_OPERATOR,
  ...EXTENDED_EQUALITY_OPERATOR,
} as const;

export const COLLECTION_OPERATOR = {
  ...CORE_COLLECTION_OPERATOR,
  ...EXTENDED_COLLECTION_OPERATOR,
} as const;

export const COMPARISON_OPERATOR = {
  ...CORE_COMPARISON_OPERATOR,
  ...EXTENDED_COMPARISON_OPERATOR,
} as const;

/**
 * Text operators - substring matching (e.g. "contains"). Extended-only today.
 */
export const TEXT_OPERATOR = {
  ...EXTENDED_TEXT_OPERATOR,
} as const;

/**
 * Relational operators - emptiness checks on FK/M2M fields (e.g. "is empty"). Extended-only today.
 */
export const RELATIONAL_OPERATOR = {
  ...EXTENDED_RELATIONAL_OPERATOR,
} as const;

/**
 * All operators (core + extended), across every operator category.
 */
export const OPERATORS = {
  ...EQUALITY_OPERATOR,
  ...COLLECTION_OPERATOR,
  ...COMPARISON_OPERATOR,
  ...TEXT_OPERATOR,
  ...RELATIONAL_OPERATOR,
} as const;

export const MULTI_VALUE_OPERATORS: ReadonlyArray<TSupportedOperators> = [
  ...CORE_MULTI_VALUE_OPERATORS,
  ...EXTENDED_MULTI_VALUE_OPERATORS,
] as const;

// -------- COMPOSED TYPES --------

export type TLogicalOperator = (typeof LOGICAL_OPERATOR)[keyof typeof LOGICAL_OPERATOR];
export type TEqualityOperator = (typeof EQUALITY_OPERATOR)[keyof typeof EQUALITY_OPERATOR];
export type TCollectionOperator = (typeof COLLECTION_OPERATOR)[keyof typeof COLLECTION_OPERATOR];
export type TComparisonOperator = (typeof COMPARISON_OPERATOR)[keyof typeof COMPARISON_OPERATOR];
export type TTextOperator = (typeof TEXT_OPERATOR)[keyof typeof TEXT_OPERATOR];
export type TRelationalOperator = (typeof RELATIONAL_OPERATOR)[keyof typeof RELATIONAL_OPERATOR];

/**
 * Union type representing all operators that can be used in a filter condition.
 * Combines core and extended operators.
 */
export type TSupportedOperators = TCoreSupportedOperators | TExtendedSupportedOperators;

// -------- NEGATION --------
// Negation is structural on the wire (a leaf's payload is wrapped in `{ not: {...} }`), so negated
// operators are NOT part of `TSupportedOperators`/`supportedOperatorConfigsMap` keys - they only exist
// as UI-facing "display" identifiers that `getOperatorForPayload` resolves back to a base operator plus
// an `isNegation` flag. Only operators with a meaningful, unambiguous negation are represented here.

/**
 * Display-only identifiers for negated operators.
 */
export const NEGATED_OPERATOR = {
  NOT_EXACT: "not_exact",
  NOT_IN: "not_in",
  NOT_RANGE: "not_range",
  NOT_ICONTAINS: "not_icontains",
} as const;

export type TNegatedSupportedOperators = (typeof NEGATED_OPERATOR)[keyof typeof NEGATED_OPERATOR];

/**
 * All operators available for use in rich filters UI, including negated versions.
 */
export type TAllAvailableOperatorsForDisplay = TSupportedOperators | TNegatedSupportedOperators;

/**
 * Maps each negatable base operator to its negated display-only identifier.
 */
export const NEGATABLE_OPERATOR_TO_NEGATED_MAP: Partial<Record<TSupportedOperators, TNegatedSupportedOperators>> = {
  [CORE_EQUALITY_OPERATOR.EXACT]: NEGATED_OPERATOR.NOT_EXACT,
  [CORE_COLLECTION_OPERATOR.IN]: NEGATED_OPERATOR.NOT_IN,
  [CORE_COMPARISON_OPERATOR.RANGE]: NEGATED_OPERATOR.NOT_RANGE,
  [EXTENDED_TEXT_OPERATOR.ICONTAINS]: NEGATED_OPERATOR.NOT_ICONTAINS,
};

/**
 * Reverse of `NEGATABLE_OPERATOR_TO_NEGATED_MAP` - maps a negated display identifier back to its base operator.
 */
export const NEGATED_OPERATOR_TO_BASE_MAP: Record<TNegatedSupportedOperators, TSupportedOperators> = {
  [NEGATED_OPERATOR.NOT_EXACT]: CORE_EQUALITY_OPERATOR.EXACT,
  [NEGATED_OPERATOR.NOT_IN]: CORE_COLLECTION_OPERATOR.IN,
  [NEGATED_OPERATOR.NOT_RANGE]: CORE_COMPARISON_OPERATOR.RANGE,
  [NEGATED_OPERATOR.NOT_ICONTAINS]: EXTENDED_TEXT_OPERATOR.ICONTAINS,
};

/**
 * Type guard to check whether a display operator is a negated variant.
 * @param operator - The display operator to check
 * @returns True if the operator is a negated display identifier
 */
export const isNegatedOperator = (operator: TAllAvailableOperatorsForDisplay): operator is TNegatedSupportedOperators =>
  Object.prototype.hasOwnProperty.call(NEGATED_OPERATOR_TO_BASE_MAP, operator);

// -------- RE-EXPORTS --------

export * from "./core";
export * from "./extended";
