/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Timer } from "lucide-react";
// plane imports
import type { TIssueActivityComment } from "@plane/types";
// components
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions/helpers/activity-block";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
// local
import { formatWorklogDuration } from "../utils";

type TIssueActivityWorklog = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  activityComment: TIssueActivityComment;
  ends?: "top" | "bottom";
};

/**
 * docs/feature-specs/14-pricing-gap-remediation.md ("14a. Time Tracking and
 * Work Logs", feature 1, exigence 7) in plane-selfhost. Worklog activity
 * entries are plain `IssueActivity` rows (field="worklog", created via the
 * `worklog.activity.*` bgtask handlers) - reuses the same
 * `activity.getActivityById(id)` lookup + `IssueActivityBlockComponent`
 * shell every other single-field activity item already uses (see
 * IssueLinkActivity), rather than resolving a full `TIssueWorklog` object.
 */
export const IssueActivityWorklog = observer(function IssueActivityWorklog(props: TIssueActivityWorklog) {
  const { activityComment, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();

  const activity = getActivityById(activityComment.id);
  if (!activity) return <></>;

  const durationLabel = activity.new_value ? activity.new_value : formatWorklogDuration(0);

  return (
    <IssueActivityBlockComponent
      icon={<Timer size={14} className="text-secondary" aria-hidden="true" />}
      activityId={activityComment.id}
      ends={ends}
    >
      {activity.verb === "created" ? (
        <span>
          logged <span className="font-medium text-primary">{durationLabel}</span>
        </span>
      ) : activity.verb === "updated" ? (
        <span>
          updated a time entry to <span className="font-medium text-primary">{durationLabel}</span>
        </span>
      ) : (
        <span>deleted a time entry</span>
      )}
    </IssueActivityBlockComponent>
  );
});
