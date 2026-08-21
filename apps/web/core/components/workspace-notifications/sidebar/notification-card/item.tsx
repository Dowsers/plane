/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Bell, Clock } from "lucide-react";
// plane imports
import { PageIcon } from "@plane/propel/icons";
import { Avatar, Row } from "@plane/ui";
import { cn, calculateTimeAgo, renderFormattedDate, renderFormattedTime, getFileURL } from "@plane/utils";
// hooks
import { useWorkspaceNotifications } from "@/hooks/store/notifications";
import { useNotification } from "@/hooks/store/notifications/use-notification";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { WorkspaceService } from "@/services/workspace.service";
// local imports
import { NotificationContent } from "./content";
import { NotificationOption } from "./options";
import { WorkflowTransitionApprovalActions } from "./workflow-transition-approval-actions";

type TNotificationItem = {
  workspaceSlug: string;
  notificationId: string;
};

const workspaceService = new WorkspaceService();

// Category 10, feature 5 ("Abonnements/notifications par page") - short
// subtitle labels for each `page_activity.verb` this feature's backend
// dispatches (see `plane.bgtasks.page_subscription_task._event_title`),
// mirroring the "View subscription"/"Workflow transition" static-label
// convention this same subtitle row already uses for its other two
// special-cased notification kinds below.
const PAGE_EVENT_SUBTITLES: Record<string, string> = {
  edited: "Page edited",
  renamed: "Page renamed",
  locked: "Page locked",
  unlocked: "Page unlocked",
  archived: "Page archived",
  unarchived: "Page restored",
  access_changed: "Page access changed",
  commented: "Page comment",
  mentioned: "Page mention",
};

/**
 * Category 10, feature 5 - the `Notification.data` payload for a
 * `entity_name === "page"` row (see `notify_page_subscribers`/
 * `notify_page_mention`, apps/api/plane/bgtasks/page_subscription_task.py)
 * carries only the page's own `id`/`name`, never a project id - a Page can
 * be linked to zero, one, or several projects (or none at all, for a
 * workspace-scoped Wiki page), so there is no single canonical project to
 * denormalize onto the notification row the way an issue notification
 * always can. Resolving the correct deep link therefore reuses the same
 * global search endpoint Cmd+K/Power-K's own page results already use for
 * the exact same ambiguity (see `POWER_K_SEARCH_RESULTS_GROUPS_MAP.page`,
 * @/components/power-k/ui/modal/search-results-map) rather than guessing -
 * a project-scoped page links to `/projects/:id/pages/:id`, a workspace
 * Wiki page (no `project_ids`) links to `/wiki/:id`.
 */
const resolvePageNotificationLink = async (workspaceSlug: string, pageId: string): Promise<string | undefined> => {
  try {
    const { results } = await workspaceService.searchWorkspace(workspaceSlug, {
      search: "",
      workspace_search: true,
      entities: "page",
    });
    const match = results.page?.find((page) => page.id === pageId);
    if (!match) return undefined;
    const redirectProjectId = match.project_ids?.[0];
    return redirectProjectId
      ? `/${workspaceSlug}/projects/${redirectProjectId}/pages/${pageId}`
      : `/${workspaceSlug}/wiki/${pageId}`;
  } catch (error) {
    console.error("Error resolving page notification link", error);
    return undefined;
  }
};

export const NotificationItem = observer(function NotificationItem(props: TNotificationItem) {
  const { workspaceSlug, notificationId } = props;
  // hooks
  const { currentSelectedNotificationId, setCurrentSelectedNotificationId } = useWorkspaceNotifications();
  const { asJson: notification, markNotificationAsRead } = useNotification(notificationId);
  const { getIsIssuePeeked, setPeekIssue } = useIssueDetail();
  const { getWorkspaceBySlug } = useWorkspace();
  const router = useAppRouter();
  // states
  const [isSnoozeStateModalOpen, setIsSnoozeStateModalOpen] = useState(false);
  const [customSnoozeModal, setCustomSnoozeModal] = useState(false);

  // derived values
  // View-subscription notifications (see docs/feature-specs/04-views-filters.md
  // "Abonnements/notifications par vue" in plane-selfhost) aren't shaped
  // like issue-activity notifications - they carry no `data.issue_activity`,
  // and `data.issue` is unset since the backend only sets `entity_identifier`
  // to the issue id (see notify_view_subscribers in
  // apps/api/plane/bgtasks/view_subscription_task.py) - so this kind is
  // branched on explicitly wherever the generic issue-notification shape is
  // assumed below.
  const isViewSubscriptionNotification = notification?.entity_name === "VIEW_SUBSCRIPTION";
  // Governed workflows (docs/feature-specs/06-automation-workflow-sla.md,
  // section 4 in plane-selfhost) - like view-subscription notifications,
  // these carry no `data.issue_activity` either (see `_notify_users`/
  // `_notify_requester`/`_notify_eligible_approvers` in
  // apps/api/plane/utils/workflow_transition_engine.py, which only ever set
  // `title`/`message`, never `data`), so they need the exact same explicit
  // opt-out of the generic issue-activity rendering path below.
  // `ISSUE_TRANSITION` (a state change that DID happen, assignee/watcher
  // notified) sets `entity_identifier` to the issue id, same convention as
  // view-subscription - `ISSUE_TRANSITION_APPROVAL` sets it to the
  // `IssueTransitionApprovalRequest` id instead (there is no issue id
  // anywhere on that notification), so it can never be peeked as an issue.
  const isWorkflowTransitionNotification = notification?.entity_name === "ISSUE_TRANSITION";
  const isWorkflowTransitionApprovalNotification = notification?.entity_name === "ISSUE_TRANSITION_APPROVAL";
  const isGovernedWorkflowNotification = isWorkflowTransitionNotification || isWorkflowTransitionApprovalNotification;
  // Category 10, feature 5 ("Abonnements/notifications par page") -
  // `entity_identifier` is a Page id, not an Issue id (see
  // `notify_page_subscribers`/`notify_page_mention`), and `data` carries a
  // `page`/`page_activity` shape instead of `issue`/`issue_activity` - so
  // this needs the exact same opt-out as the two kinds above wherever the
  // generic issue-notification shape is assumed below.
  const isPageNotification = notification?.entity_name === "page";
  // Only the "someone requested your approval" flavor is actionable here -
  // the "your request was approved/rejected" flavor (sent to the requester)
  // is purely informational. See `create_approval_request`/
  // `approve_transition_request` in workflow_transition_engine.py for the
  // exact `sender` values this distinguishes between.
  const isActionableApprovalRequest =
    isWorkflowTransitionApprovalNotification &&
    notification?.sender === "in_app:workflow_transition_approval:requested";
  const projectId = notification?.project || undefined;
  const issueId =
    notification?.data?.issue?.id ||
    (isViewSubscriptionNotification || isWorkflowTransitionNotification ? notification?.entity_identifier : undefined);
  const workspace = getWorkspaceBySlug(workspaceSlug);

  // `?.field` (rather than plain `.field`) matters here now that a real
  // notification kind (`isPageNotification`) can carry a non-null `data`
  // that simply doesn't have an `issue_activity` key at all (as opposed to
  // view-subscription/governed-workflow notifications, whose `data` is
  // `None`/`null` outright) - without the extra `?.`, `data.issue_activity`
  // evaluates to `undefined` and `.field` on it throws, since optional
  // chaining only short-circuits when the immediately preceding link in
  // the chain is itself nullish, not when a plain property lookup merely
  // happens to come back `undefined`.
  const notificationField = notification?.data?.issue_activity?.field || undefined;
  const notificationTriggeredBy = notification.triggered_by_details || undefined;

  const handleNotificationClick = async () => {
    if (!workspaceSlug || isSnoozeStateModalOpen || customSnoozeModal) return;

    setCurrentSelectedNotificationId(notificationId);

    // make the notification as read
    if (notification.read_at === null) {
      try {
        await markNotificationAsRead(workspaceSlug);
      } catch (error) {
        console.error(error);
      }
    }

    // Category 10, feature 5 - Pages have no peek overview (unlike
    // issues), so clicking a page notification navigates away instead.
    // See `resolvePageNotificationLink`'s own comment for why this can't
    // be built straight from the notification's own `data` payload.
    if (isPageNotification) {
      const pageId = notification?.entity_identifier;
      if (!pageId) return;
      const pageLink = await resolvePageNotificationLink(workspaceSlug, pageId);
      if (pageLink) router.push(pageLink);
      return;
    }

    // View-subscription notifications have no reliable project id (a
    // workspace-scoped view subscription has none) and no peekable target
    // beyond "an issue somewhere in this view" - only attempt the peek
    // overview when both pieces are actually available.
    if (!projectId || !issueId) return;

    setPeekIssue(undefined);
    if (notification?.is_inbox_issue === false) {
      if (!getIsIssuePeeked(issueId)) {
        setPeekIssue({ workspaceSlug, projectId, issueId });
      }
    }
  };

  if (
    !workspaceSlug ||
    !notificationId ||
    !notification?.id ||
    !workspace?.id ||
    (!isViewSubscriptionNotification &&
      !isGovernedWorkflowNotification &&
      !isPageNotification &&
      (!notificationField || !projectId))
  )
    return <></>;

  return (
    <Row
      className={cn(
        "group relative flex cursor-pointer items-center gap-2 border-b border-subtle py-4 transition-all",
        {
          "bg-layer-1/30": currentSelectedNotificationId === notification?.id,
          "bg-accent-primary/5": notification.read_at === null,
        }
      )}
      onClick={handleNotificationClick}
    >
      {notification.read_at === null && (
        <div className="absolute top-[50%] left-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-accent-primary" />
      )}

      <div className="relative flex w-full gap-2">
        <div className="relative flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-layer-1">
          {notificationTriggeredBy ? (
            <Avatar
              name={notificationTriggeredBy.display_name || notificationTriggeredBy?.first_name}
              src={getFileURL(notificationTriggeredBy.avatar_url)}
              size={42}
              shape="circle"
              className="bg-layer-1 text-body-sm-medium"
            />
          ) : isPageNotification ? (
            <PageIcon className="h-5 w-5 text-secondary" />
          ) : (
            (isViewSubscriptionNotification || isGovernedWorkflowNotification) && (
              <Bell className="h-5 w-5 text-secondary" />
            )
          )}
        </div>

        <div className="-mt-2 w-full space-y-1">
          <div className="relative flex h-8 items-center gap-3">
            <div className="line-clamp-1 w-full truncate overflow-hidden text-body-xs-medium break-all whitespace-normal text-primary">
              {isViewSubscriptionNotification || isGovernedWorkflowNotification || isPageNotification ? (
                <span>{notification.title}</span>
              ) : (
                projectId && (
                  <NotificationContent
                    notification={notification}
                    workspaceId={workspace.id}
                    workspaceSlug={workspaceSlug}
                    projectId={projectId}
                  />
                )
              )}
            </div>
            <NotificationOption
              workspaceSlug={workspaceSlug}
              notificationId={notification?.id}
              isSnoozeStateModalOpen={isSnoozeStateModalOpen}
              setIsSnoozeStateModalOpen={setIsSnoozeStateModalOpen}
              customSnoozeModal={customSnoozeModal}
              setCustomSnoozeModal={setCustomSnoozeModal}
            />
          </div>

          <div className="relative flex items-center gap-3 text-caption-sm-regular text-secondary">
            <div className="line-clamp-1 w-full truncate overflow-hidden break-words whitespace-normal">
              {isViewSubscriptionNotification ? (
                "View subscription"
              ) : isWorkflowTransitionNotification ? (
                "Workflow transition"
              ) : isWorkflowTransitionApprovalNotification ? (
                isActionableApprovalRequest ? (
                  "Approval requested"
                ) : (
                  "Approval decision"
                )
              ) : isPageNotification ? (
                (PAGE_EVENT_SUBTITLES[notification?.data?.page_activity?.verb ?? ""] ?? "Page update")
              ) : (
                <>
                  {notification?.data?.issue?.identifier}-{notification?.data?.issue?.sequence_id}&nbsp;
                  {notification?.data?.issue?.name}
                </>
              )}
            </div>
            <div className="flex-shrink-0">
              {notification?.snoozed_till ? (
                <p className="flex flex-shrink-0 items-center justify-end gap-x-1 text-tertiary">
                  <Clock className="h-4 w-4" />
                  <span>
                    Till {renderFormattedDate(notification.snoozed_till)},&nbsp;
                    {renderFormattedTime(notification.snoozed_till, "12-hour")}
                  </span>
                </p>
              ) : (
                <p className="mt-auto flex-shrink-0 text-tertiary">
                  {notification.created_at && calculateTimeAgo(notification.created_at)}
                </p>
              )}
            </div>
          </div>

          {isActionableApprovalRequest && projectId && (
            <WorkflowTransitionApprovalActions
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              approvalRequestId={notification.entity_identifier ?? ""}
              onDecided={() => {
                if (notification.read_at === null) markNotificationAsRead(workspaceSlug).catch(() => undefined);
              }}
            />
          )}
        </div>
      </div>
    </Row>
  );
});
