/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TDateFilterFieldConfig, TMultiSelectFilterFieldConfig, TTextFilterFieldConfig } from "../field-types";
import type { EXTENDED_COMPARISON_OPERATOR, EXTENDED_RELATIONAL_OPERATOR, EXTENDED_TEXT_OPERATOR } from "../operators";

// ----------------------------- EXACT Operator -----------------------------
// EXACT stays core-only - negation (not creating a new operator) is how "is not" is achieved.
export type TExtendedExactOperatorConfigs = never;

// ----------------------------- IN Operator -----------------------------
// IN stays core-only - negation is how "is not any of" is achieved.
export type TExtendedInOperatorConfigs = never;

// ----------------------------- RANGE Operator -----------------------------
// RANGE stays core-only - negation is how "not between" is achieved.
export type TExtendedRangeOperatorConfigs = never;

// ----------------------------- GT/GTE/LT/LTE Operators -----------------------------
export type TExtendedComparisonOperatorConfigs = TDateFilterFieldConfig<TFilterValue>;

// ----------------------------- ICONTAINS Operator -----------------------------
export type TExtendedTextOperatorConfigs = TTextFilterFieldConfig<TFilterValue>;

// ----------------------------- ISNULL Operator -----------------------------
export type TExtendedRelationalOperatorConfigs = TMultiSelectFilterFieldConfig<TFilterValue>;

// ----------------------------- Extended Operator Specific Configs -----------------------------
export type TExtendedOperatorSpecificConfigs = {
  [EXTENDED_COMPARISON_OPERATOR.GT]: TExtendedComparisonOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.GTE]: TExtendedComparisonOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.LT]: TExtendedComparisonOperatorConfigs;
  [EXTENDED_COMPARISON_OPERATOR.LTE]: TExtendedComparisonOperatorConfigs;
  [EXTENDED_TEXT_OPERATOR.ICONTAINS]: TExtendedTextOperatorConfigs;
  [EXTENDED_RELATIONAL_OPERATOR.ISNULL]: TExtendedRelationalOperatorConfigs;
};
