/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

export enum EGanttBlockType {
  EPIC = "epic",
  PROJECT = "project",
  ISSUE = "issue",
}
export interface IGanttBlock {
  data: any;
  id: string;
  name: string;
  position?: {
    marginLeft: number;
    width: number;
  };
  sort_order: number | undefined;
  start_date: string | undefined;
  target_date: string | undefined;
  meta?: Record<string, any>;
}

export interface IBlockUpdateData {
  sort_order?: {
    destinationIndex: number;
    newSortOrder: number;
    sourceIndex: number;
  };
  start_date?: string;
  target_date?: string;
  meta?: Record<string, any>;
}

export interface IBlockUpdateDependencyData {
  id: string;
  start_date?: string;
  target_date?: string;
  meta?: Record<string, any>;
}

export type TGanttViews = "week" | "month" | "quarter";

// Read-only "blocked_by" pair among two issues rendered on the same Gantt
// view - powers the dependency line overlay, see
// docs/feature-specs/03-projects-roadmaps-initiatives.md ("Lignes de
// dependance Gantt") in plane-selfhost.
export interface TGanttDependencyPair {
  blocked_issue_id: string;
  blocking_issue_id: string;
}

// chart render types
export interface WeekMonthDataType {
  key: number;
  shortTitle: string;
  title: string;
  abbreviation: string;
}

export interface ChartDataType {
  key: string;
  i18n_title: string;
  data: ChartDataTypeData;
}

export interface ChartDataTypeData {
  startDate: Date;
  currentDate: Date;
  endDate: Date;
  approxFilterRange: number;
  dayWidth: number;
}
