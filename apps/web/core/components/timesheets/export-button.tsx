/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
import { Download } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TWorklogReportFilters } from "@plane/types";
import { Button } from "@plane/ui";
// services
import { IssueWorklogService } from "@/services/issue/issue_worklog.service";
// local imports
import type { TTimesheetFilters } from "./filters";

const issueWorklogService = new IssueWorklogService();

const WORKLOG_EXPORTS_KEY = (workspaceSlug: string) => `WORKLOG_EXPORTS_${workspaceSlug}`;

type Props = {
  workspaceSlug: string;
  filters: TTimesheetFilters;
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 2 "Timesheets historiques et rapports agrégés",
 * exigence 5/7) in plane-selfhost - triggers `POST .../worklogs/export/`
 * (async Celery CSV generation against the same filters as the on-screen
 * report), then polls `GET .../worklogs/export/` (paginated
 * ExporterHistory list, type="issue_worklogs") every 3s while the most
 * recent entry is still "processing", surfacing a download link once
 * ready. Mirrors the trigger->poll->download lifecycle already
 * implemented for the generic issue exporter (apps/web/core/components/
 * exporter/{export-form,prev-exports}.tsx) rather than reinventing it.
 */
export const TimesheetExportButton = observer(function TimesheetExportButton(props: Props) {
  const { workspaceSlug, filters } = props;
  const { t } = useTranslation();
  const [isTriggering, setIsTriggering] = useState(false);

  const { data: exports } = useSWR(WORKLOG_EXPORTS_KEY(workspaceSlug), () =>
    issueWorklogService.getWorklogExports(workspaceSlug, "10:0:0", 10)
  );

  const latest = exports?.results?.[0];

  useEffect(() => {
    if (latest?.status !== "processing") return;
    const interval = setInterval(() => {
      void mutate(WORKLOG_EXPORTS_KEY(workspaceSlug));
    }, 3000);
    return () => clearInterval(interval);
  }, [latest?.status, workspaceSlug]);

  const handleExport = async () => {
    setIsTriggering(true);
    try {
      const exportFilters: TWorklogReportFilters = {
        project_id: filters.project_id,
        member_id: filters.member_id,
        date_from: filters.date_from,
        date_to: filters.date_to,
      };
      await issueWorklogService.exportWorklogs(workspaceSlug, exportFilters);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Export started",
        message: "Once the export is ready you will be able to download it below.",
      });
      void mutate(WORKLOG_EXPORTS_KEY(workspaceSlug));
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to start the export.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsTriggering(false);
    }
  };

  return (
    <div className="flex items-center gap-2">
      {latest?.status === "completed" && latest.url && (
        <a
          href={latest.url}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-13 font-medium text-accent-primary"
        >
          <Download className="h-3.5 w-3.5" />
          Download
        </a>
      )}
      {latest?.status === "processing" && <span className="text-12 text-tertiary">Preparing export…</span>}
      <Button
        variant="primary"
        size="sm"
        prependIcon={<Download className="h-3.5 w-3.5" />}
        onClick={handleExport}
        loading={isTriggering}
      >
        {t("export")}
      </Button>
    </div>
  );
});
