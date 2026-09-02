/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Timer } from "lucide-react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { EPillSize, Pill } from "@plane/propel/pill";
import { Tooltip } from "@plane/propel/tooltip";
import { calculateTimeAgo, renderFormattedDate, renderFormattedTime } from "@plane/utils";
// components
import { SidebarPropertyListItem } from "@/components/common/layout/sidebar/property-list-item";
// services
import { SLAPolicyService } from "@/services/sla-policy.service";
// local imports
import { SLA_STATUS_LABELS, SLA_STATUS_PILL_VARIANT, SLA_TYPE_LABELS } from "./constants";

const slaPolicyService = new SLAPolicyService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
};

const TERMINAL_STATUSES = new Set(["achieved", "cancelled"]);

/**
 * Compact "SLA" property row for the issue detail sidebar, mirroring the
 * "Due Date"/"Estimate"/"Recurring" `SidebarPropertyListItem` rows in
 * `apps/web/core/components/issues/issue-detail/sidebar.tsx`. Renders one
 * pill per active `IssueSLA` entry (zero, one, or two - one per active
 * `sla_type` the matched policy configured), fetched on-demand via the
 * dedicated per-issue endpoint (`IssueSLAEndpoint`, open to any active
 * project member, not Admin-gated like the policy configuration screen).
 * Renders nothing at all when the array is empty, same convention as the
 * "Recurring" row's `issue?.recurring_template_name_snapshot &&` guard.
 */
export function IssueSLAProperty(props: Props) {
  const { workspaceSlug, projectId, issueId } = props;
  const { t } = useTranslation();

  const shouldFetch = Boolean(workspaceSlug && projectId && issueId);
  const { data: slaEntries } = useSWR(
    shouldFetch ? ["ISSUE_SLA", workspaceSlug, projectId, issueId] : null,
    shouldFetch ? () => slaPolicyService.getIssueSLA(workspaceSlug, projectId, issueId) : null
  );

  if (!slaEntries || slaEntries.length === 0) return null;

  return (
    <SidebarPropertyListItem icon={Timer} label={t("sla_policies.property.label")}>
      {slaEntries.map((entry) => (
        <Tooltip
          key={entry.id}
          tooltipContent={
            entry.sla_policy_name
              ? t("sla_policies.property.due_tooltip_with_policy", {
                  policy: entry.sla_policy_name,
                  date: renderFormattedDate(entry.due_at),
                  time: renderFormattedTime(entry.due_at),
                })
              : t("sla_policies.property.due_tooltip", {
                  date: renderFormattedDate(entry.due_at),
                  time: renderFormattedTime(entry.due_at),
                })
          }
        >
          <Pill variant={SLA_STATUS_PILL_VARIANT[entry.status]} size={EPillSize.SM}>
            {SLA_TYPE_LABELS[entry.sla_type]}: {SLA_STATUS_LABELS[entry.status]}
            {!TERMINAL_STATUSES.has(entry.status) && ` (${calculateTimeAgo(entry.due_at)})`}
          </Pill>
        </Tooltip>
      ))}
    </SidebarPropertyListItem>
  );
}
