/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
// plane imports
import { Button } from "@plane/ui";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// services
import { WorkflowTransitionService } from "@/services/workflow-transition.service";

const workflowTransitionService = new WorkflowTransitionService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  /** `IssueTransitionApprovalRequest.id` - see this component's only
   * caller, `NotificationItem`, for how it's recovered from
   * `notification.entity_identifier`. */
  approvalRequestId: string;
  onDecided: () => void;
};

/**
 * Inline Approve/Reject affordance on an "approval requested" notification -
 * see docs/feature-specs/06-automation-workflow-sla.md ("Workflows
 * gouvernes multi-etats avec approbations", section 4) in plane-selfhost,
 * exigence 6/7. This IS the "approvals panel" this feature's delivery notes
 * chose to build: the existing in-app Notification surface already gets one
 * row per eligible approver the moment a request is created (see
 * `_notify_eligible_approvers` in
 * apps/api/plane/utils/workflow_transition_engine.py) - reusing it here
 * avoids building a second, redundant "pending approvals" page for data
 * that already has a durable, per-user, read/unread-tracked home.
 *
 * KNOWN LIMITATION (deliberately not solved here, kept as simple as the
 * rest of this feature's async-status handling): if a second eligible
 * approver already decided this same request, this notification's own
 * Approve/Reject buttons are still shown (nothing here removes/updates a
 * DIFFERENT approver's copy of this notification once one of them acts) -
 * clicking them at that point degrades gracefully into the toast below,
 * since the backend re-validates `status === "PENDING"` server-side and
 * returns a plain 400 otherwise. This mirrors the notification model's
 * existing behavior for every other entity_name in this codebase (no
 * "this became irrelevant, remove/gray it out" mechanism exists anywhere).
 */
export function WorkflowTransitionApprovalActions(props: Props) {
  const { workspaceSlug, projectId, approvalRequestId, onDecided } = props;
  const [isSubmitting, setIsSubmitting] = useState<"approve" | "reject" | null>(null);

  const decide = async (decision: "approve" | "reject") => {
    setIsSubmitting(decision);
    try {
      if (decision === "approve") {
        await workflowTransitionService.approveRequest(workspaceSlug, projectId, approvalRequestId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Approved", message: "The transition has been executed." });
      } else {
        await workflowTransitionService.rejectRequest(workspaceSlug, projectId, approvalRequestId);
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Rejected", message: "The transition request was rejected." });
      }
      onDecided();
    } catch (error: unknown) {
      const message = (error as { error?: string })?.error ?? "Unable to record your decision.";
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message });
    } finally {
      setIsSubmitting(null);
    }
  };

  // Buttons stop their own click propagation (rather than wrapping them in a
  // non-interactive `<div onClick>`) - the row this component is rendered
  // inside (`NotificationItem`) has its own `onClick` for peek-navigation,
  // and these buttons need to prevent that without introducing a
  // non-semantic clickable wrapper.
  return (
    <div className="mt-1 flex items-center gap-2">
      <Button
        variant="link-primary"
        size="sm"
        loading={isSubmitting === "approve"}
        disabled={isSubmitting !== null}
        onClick={(event) => {
          event.stopPropagation();
          decide("approve");
        }}
      >
        Approve
      </Button>
      <Button
        variant="link-danger"
        size="sm"
        loading={isSubmitting === "reject"}
        disabled={isSubmitting !== null}
        onClick={(event) => {
          event.stopPropagation();
          decide("reject");
        }}
      >
        Reject
      </Button>
    </div>
  );
}
