/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { TRecurringIssueFrequency, TRecurringIssueTemplate } from "@plane/types";

export const FREQUENCY_LABELS: Record<TRecurringIssueFrequency, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export const FREQUENCY_OPTIONS: { value: TRecurringIssueFrequency; label: string }[] = [
  { value: "DAILY", label: "Daily" },
  { value: "WEEKLY", label: "Weekly" },
  { value: "MONTHLY", label: "Monthly" },
  { value: "YEARLY", label: "Yearly" },
];

/** Python `date.weekday()` convention: 0 = Monday ... 6 = Sunday. Deliberately
 * NOT ISO's 1 = Monday, and NOT Sunday-first - see
 * `apps/api/plane/db/models/recurring_issue_template.py`'s own field
 * comment for `weekdays`. */
export const WEEKDAY_OPTIONS: { value: number; short: string; label: string }[] = [
  { value: 0, short: "Mon", label: "Monday" },
  { value: 1, short: "Tue", label: "Tuesday" },
  { value: 2, short: "Wed", label: "Wednesday" },
  { value: 3, short: "Thu", label: "Thursday" },
  { value: 4, short: "Fri", label: "Friday" },
  { value: 5, short: "Sat", label: "Saturday" },
  { value: 6, short: "Sun", label: "Sunday" },
];

export const MONTH_OPTIONS: { value: number; label: string }[] = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

const weekdayShort = (value: number): string => WEEKDAY_OPTIONS.find((option) => option.value === value)?.short ?? "?";

const ordinal = (n: number): string => {
  const remainder100 = n % 100;
  if (remainder100 >= 11 && remainder100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
};

/**
 * Human-readable recurrence summary, e.g. "Every 2 weeks on Mon, Wed",
 * "Every day", "Every year on 15 June" - reads `frequency`/`interval`/
 * `weekdays`/`day_of_month`/`month_of_year` off the template. Returns
 * "Not yet configured" for a `convert-to-recurring` draft that has no
 * `frequency` set yet.
 */
export const formatRecurrenceSummary = (
  template: Pick<TRecurringIssueTemplate, "frequency" | "interval" | "weekdays" | "day_of_month" | "month_of_year">
): string => {
  const { frequency, interval, weekdays, day_of_month, month_of_year } = template;
  if (!frequency) return "Not yet configured";

  const n = interval && interval > 0 ? interval : 1;

  switch (frequency) {
    case "DAILY":
      return n === 1 ? "Every day" : `Every ${n} days`;
    case "WEEKLY": {
      const base = n === 1 ? "Every week" : `Every ${n} weeks`;
      if (weekdays && weekdays.length > 0) {
        // eslint-disable-next-line unicorn/no-array-sort -- freshly-built local array (spread copy), no shared-reference mutation risk; toSorted() needs an ES2023 lib bump out of scope here
        const days = [...weekdays]
          .sort((a, b) => a - b)
          .map(weekdayShort)
          .join(", ");
        return `${base} on ${days}`;
      }
      return base;
    }
    case "MONTHLY": {
      const base = n === 1 ? "Every month" : `Every ${n} months`;
      return day_of_month ? `${base} on the ${ordinal(day_of_month)}` : base;
    }
    case "YEARLY": {
      const base = n === 1 ? "Every year" : `Every ${n} years`;
      const monthLabel = MONTH_OPTIONS.find((option) => option.value === month_of_year)?.label;
      if (monthLabel && day_of_month) return `${base} on ${day_of_month} ${monthLabel}`;
      if (monthLabel) return `${base} in ${monthLabel}`;
      return base;
    }
    default:
      return "Not yet configured";
  }
};
