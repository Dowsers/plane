/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { TFilterProperty } from "@plane/types";
// local imports
import type { TCreateFilterConfig, TCreateTextFilterParams } from "../../../rich-filters";
import { createFilterConfig, getSupportedTextOperators } from "../../../rich-filters";

// ------------ Name filter ------------

/**
 * Get the name filter config
 * @template K - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the name filter config
 */
export const getNameFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateTextFilterParams> =>
  (params: TCreateTextFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Name",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: getSupportedTextOperators(params),
    });
