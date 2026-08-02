/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// plane imports
import type { IProject, IUserLite, TOperatorConfigMap, TSupportedOperators } from "@plane/types";
import { COMPARISON_OPERATOR, EQUALITY_OPERATOR, TEXT_OPERATOR } from "@plane/types";
// local imports
import { getDatePickerConfig, getDateRangePickerConfig, getMultiSelectConfig, getTextFilterConfig } from "../core";
import type {
  IFilterIconConfig,
  TCreateDateFilterParams,
  TCreateFilterConfigParams,
  TCreateTextFilterParams,
  TFilterIconType,
} from "../shared";
import { createOperatorConfigEntry } from "../shared";

// ------------ Base User Filter Types ------------

/**
 * User filter specific params
 */
export type TCreateUserFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<IUserLite> & {
    members: IUserLite[];
  };

/**
 * Helper to get the member multi select config
 * @param params - The filter params
 * @returns The member multi select config
 */
export const getMemberMultiSelectConfig = (params: TCreateUserFilterParams, singleValueOperator: TSupportedOperators) =>
  getMultiSelectConfig<IUserLite, string, IUserLite>(
    {
      items: params.members,
      getId: (member) => member.id,
      getLabel: (member) => member.display_name,
      getValue: (member) => member.id,
      getIconData: (member) => member,
    },
    {
      singleValueOperator,
      ...params,
    },
    {
      ...params,
    }
  );

// ------------ Date Operators ------------

/**
 * Gets the supported date operators for a date field.
 * GT/GTE/LT/LTE ("after"/"after or on"/"before"/"before or on") never support negation - their
 * `not_*` variants would be semantically redundant with an existing operator (e.g. "not after"
 * is exactly "before or on", already covered by LTE), unlike exact/range whose negations
 * ("is not"/"not between") don't have an equivalent positive operator.
 * @param params - The filter params
 * @returns The supported date operators config map
 */
export const getSupportedDateOperators = (params: TCreateDateFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(EQUALITY_OPERATOR.EXACT, params, (updatedParams) => getDatePickerConfig(updatedParams)),
    createOperatorConfigEntry(COMPARISON_OPERATOR.RANGE, params, (updatedParams) =>
      getDateRangePickerConfig(updatedParams)
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.GT, params, (updatedParams) =>
      getDatePickerConfig({ ...updatedParams, allowNegative: false })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.GTE, params, (updatedParams) =>
      getDatePickerConfig({ ...updatedParams, allowNegative: false })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.LT, params, (updatedParams) =>
      getDatePickerConfig({ ...updatedParams, allowNegative: false })
    ),
    createOperatorConfigEntry(COMPARISON_OPERATOR.LTE, params, (updatedParams) =>
      getDatePickerConfig({ ...updatedParams, allowNegative: false })
    ),
  ]);

// ------------ Text Operators ------------

/**
 * Gets the supported text operators for a free-text field (e.g. "name").
 * @param params - The filter params
 * @returns The supported text operators config map
 */
export const getSupportedTextOperators = (params: TCreateTextFilterParams): TOperatorConfigMap =>
  new Map([
    createOperatorConfigEntry(TEXT_OPERATOR.ICONTAINS, params, (updatedParams) => getTextFilterConfig(updatedParams)),
  ]);

// ------------ Project filter ------------

/**
 * Project filter specific params
 */
export type TCreateProjectFilterParams = TCreateFilterConfigParams &
  IFilterIconConfig<IProject> & {
    projects: IProject[];
  };

/**
 * Helper to get the project multi select config
 * @param params - The filter params
 * @returns The member multi select config
 */
export const getProjectMultiSelectConfig = (
  params: TCreateProjectFilterParams,
  singleValueOperator: TSupportedOperators
) =>
  getMultiSelectConfig<IProject, string, IProject>(
    {
      items: params.projects,
      getId: (project) => project.id,
      getLabel: (project) => project.name,
      getValue: (project) => project.id,
      getIconData: (project) => project,
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
 * Custom property filter specific params
 */
export type TCustomPropertyFilterParams<T extends TFilterIconType> = TCreateFilterConfigParams &
  IFilterIconConfig<T> & {
    propertyDisplayName: string;
  };
