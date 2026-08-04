/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane package imports
import { useTranslation } from "@plane/i18n";
import { EmptyStateCompact } from "@plane/propel/empty-state";
import type { TDurationPercentileMetric } from "@plane/types";
// hooks
import { useAnalytics } from "@/hooks/store/use-analytics";
// services
import { AnalyticsService } from "@/services/analytics.service";
// local imports
import AnalyticsSectionWrapper from "../analytics-section-wrapper";
import InsightCard from "../insight-card";
import { ChartLoader } from "../loaders";

const analyticsService = new AnalyticsService();

type TDurationMetricKey = "lead_time" | "cycle_time" | "triage_time";

type TDurationMetricSectionProps = {
  metricKey: TDurationMetricKey;
  metric?: TDurationPercentileMetric;
  isLoading: boolean;
};

function DurationMetricSection(props: TDurationMetricSectionProps) {
  const { metricKey, metric, isLoading } = props;
  const { t } = useTranslation();
  // A metric with a 0 sample size must never render fabricated 0-day
  // percentiles - the backend already returns null for every percentile in
  // that case, so an empty state is shown instead of a stat-card grid.
  const hasData = !!metric && metric.sample_size > 0;

  return (
    <AnalyticsSectionWrapper
      title={t(`workspace_analytics.duration_percentiles.${metricKey}`)}
      subtitle={t(`workspace_analytics.duration_percentiles.${metricKey}_description`)}
    >
      {isLoading ? (
        <ChartLoader />
      ) : hasData && metric ? (
        <div className="grid grid-cols-2 gap-8 sm:grid-cols-4">
          <InsightCard
            label={t("workspace_analytics.duration_percentiles.p50")}
            data={{ count: metric.p50 ?? 0, filter_count: 0 }}
          />
          <InsightCard
            label={t("workspace_analytics.duration_percentiles.p75")}
            data={{ count: metric.p75 ?? 0, filter_count: 0 }}
          />
          <InsightCard
            label={t("workspace_analytics.duration_percentiles.p90")}
            data={{ count: metric.p90 ?? 0, filter_count: 0 }}
          />
          <InsightCard
            label={t("workspace_analytics.duration_percentiles.sample_size")}
            data={{ count: metric.sample_size, filter_count: 0 }}
          />
        </div>
      ) : (
        <EmptyStateCompact
          assetKey="unknown"
          assetClassName="size-20"
          rootClassName="border border-subtle px-5 py-10 md:py-20 md:px-20"
          title={t("workspace_analytics.duration_percentiles.no_data")}
        />
      )}
    </AnalyticsSectionWrapper>
  );
}

const DurationPercentiles = observer(function DurationPercentiles() {
  const params = useParams();
  const workspaceSlug = params.workspaceSlug.toString();
  const { selectedProjects } = useAnalytics();

  const { data, isLoading } = useSWR(`advance-analytics-duration-${workspaceSlug}-${selectedProjects}`, () =>
    analyticsService.getAdvanceAnalyticsDuration(
      workspaceSlug,
      selectedProjects?.length > 0 ? { project_ids: selectedProjects.join(",") } : undefined
    )
  );

  return (
    <div className="flex flex-col gap-14">
      <DurationMetricSection metricKey="lead_time" metric={data?.lead_time} isLoading={isLoading} />
      <DurationMetricSection metricKey="cycle_time" metric={data?.cycle_time} isLoading={isLoading} />
      <DurationMetricSection metricKey="triage_time" metric={data?.triage_time} isLoading={isLoading} />
    </div>
  );
});

export default DurationPercentiles;
