/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TFilterValue } from "../expression";
import type { TDateFilterFieldConfig } from "../field-types";
import type { TExtendedOperatorSpecificConfigs } from "../operator-configs";
import type { TFilterOperatorHelper } from "./shared";

// -------- DATE FILTER OPERATORS --------

/**
 * Union type representing all extended operators that support single date filter types
 * (gt/gte/lt/lte - "after"/"after or on"/"before"/"before or on").
 */
export type TExtendedSupportedDateFilterOperators<V extends TFilterValue = TFilterValue> = {
  [K in keyof TExtendedOperatorSpecificConfigs]: TFilterOperatorHelper<
    TExtendedOperatorSpecificConfigs,
    K,
    TDateFilterFieldConfig<V>
  >;
}[keyof TExtendedOperatorSpecificConfigs];

export type TExtendedAllAvailableDateFilterOperatorsForDisplay<V extends TFilterValue = TFilterValue> =
  TExtendedSupportedDateFilterOperators<V>;

// -------- SELECT FILTER OPERATORS --------

/**
 * Union type representing all extended operators that support select filter types.
 * Note: ISNULL also maps to a multi-select field config (see operator-configs/extended.ts), but it is
 * intentionally excluded here since nothing currently consumes this derived type for select filters
 * (unlike the date variant, which backs `DATE_OPERATOR_LABELS_MAP`/`isDateFilterOperator`).
 */
export type TExtendedSupportedSelectFilterOperators<_V extends TFilterValue = TFilterValue> = never;

export type TExtendedAllAvailableSelectFilterOperatorsForDisplay<_V extends TFilterValue = TFilterValue> = never;
