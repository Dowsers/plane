/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IModule, TFilterProperty, TSupportedOperators } from "@plane/types";
import { COLLECTION_OPERATOR, EQUALITY_OPERATOR, RELATIONAL_OPERATOR } from "@plane/types";
// local imports
import type { TCreateFilterConfigParams, IFilterIconConfig, TCreateFilterConfig } from "../../../rich-filters";
import { createFilterConfig, getMultiSelectConfig, createOperatorConfigEntry } from "../../../rich-filters";

/**
 * Module filter specific params
 */
export type TCreateModuleFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<undefined> & {
    modules: IModule[];
  };

/**
 * Helper to get the module multi select config
 * @param params - The filter params
 * @param singleValueOperator - Operator to show when a single value is selected
 * @returns The module multi select config
 */
export const getModuleMultiSelectConfig = (
  params: TCreateModuleFilterParams,
  singleValueOperator: TSupportedOperators = EQUALITY_OPERATOR.EXACT
) =>
  getMultiSelectConfig<IModule, string, undefined>(
    {
      items: params.modules,
      getId: (module) => module.id,
      getLabel: (module) => module.name,
      getValue: (module) => module.id,
      getIconData: () => undefined,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      ...params,
    }
  );

/**
 * Get the module filter config
 * @template K - The filter key
 * @param key - The filter key to use
 * @returns A function that takes parameters and returns the module filter config
 */
export const getModuleFilterConfig =
  <P extends TFilterProperty>(key: P): TCreateFilterConfig<P, TCreateModuleFilterParams> =>
  (params: TCreateModuleFilterParams) =>
    createFilterConfig<P>({
      id: key,
      label: "Module",
      ...params,
      icon: params.filterIcon,
      supportedOperatorConfigsMap: new Map([
        createOperatorConfigEntry(COLLECTION_OPERATOR.IN, params, (updatedParams) =>
          getModuleMultiSelectConfig(updatedParams)
        ),
        createOperatorConfigEntry(RELATIONAL_OPERATOR.ISNULL, params, (updatedParams) =>
          getModuleMultiSelectConfig({ ...updatedParams, allowNegative: false }, RELATIONAL_OPERATOR.ISNULL)
        ),
      ]),
    });
