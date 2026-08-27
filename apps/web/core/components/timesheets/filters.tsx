/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TWorklogReportFilters } from "@plane/types";
import { getDate, renderFormattedPayloadDate } from "@plane/utils";
// components
import { DateRangeDropdown } from "@/components/dropdowns/date-range";
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
import { ProjectDropdown } from "@/components/dropdowns/project/dropdown";

export type TTimesheetFilters = TWorklogReportFilters;

type Props = {
  filters: TTimesheetFilters;
  onChange: (filters: TTimesheetFilters) => void;
  /** Hides the project filter - used on project-scoped surfaces where the project is fixed by the URL. */
  hideProjectFilter?: boolean;
  /** Hides the member filter - used on "My time" where `logged_by` is implicitly the current user server-side. */
  hideMemberFilter?: boolean;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 2 "Timesheets historiques et rapports agrégés",
 * exigence 1/3/4) in plane-selfhost - project/member/date-range filter bar
 * shared by the workspace report, project report and "My time" surfaces.
 * Reuses the existing ProjectDropdown/MemberDropdown/DateRangeDropdown
 * (apps/web/core/components/dropdowns/*) rather than inventing new filter
 * controls, per the spec's UX note to reuse the Analytics filter patterns.
 */
export const TimesheetFilters = observer(function TimesheetFilters(props: Props) {
  const { filters, onChange, hideProjectFilter, hideMemberFilter } = props;
  const { t } = useTranslation();

  return (
    <div className="flex flex-wrap items-center gap-2">
      {!hideProjectFilter && (
        <ProjectDropdown
          multiple
          value={filters.project_id ?? []}
          onChange={(value) => onChange({ ...filters, project_id: value })}
          buttonVariant="border-with-text"
          placeholder={t("projects")}
        />
      )}
      {!hideMemberFilter && (
        <MemberDropdown
          multiple
          value={filters.member_id ?? []}
          onChange={(value: string[]) => onChange({ ...filters, member_id: value })}
          buttonVariant="border-with-text"
          placeholder={t("members")}
        />
      )}
      <DateRangeDropdown
        buttonVariant="border-with-text"
        isClearable
        value={{
          from: filters.date_from ? getDate(filters.date_from) : undefined,
          to: filters.date_to ? getDate(filters.date_to) : undefined,
        }}
        onSelect={(range) =>
          onChange({
            ...filters,
            date_from: range?.from ? (renderFormattedPayloadDate(range.from) ?? undefined) : undefined,
            date_to: range?.to ? (renderFormattedPayloadDate(range.to) ?? undefined) : undefined,
          })
        }
        placeholder={{ from: t("start_date"), to: t("end_date") }}
      />
    </div>
  );
});
