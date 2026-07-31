/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar, LinearProgressIndicator } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
import type { IInitiative } from "@plane/types";
// hooks
import { useMember } from "@/hooks/store/use-member";
// local imports
import { HEALTH_OPTIONS } from "./health-picker";
import { InitiativeQuickActions } from "./quick-actions";

type Props = {
  initiative: IInitiative;
};

export const InitiativeCard = observer(function InitiativeCard(props: Props) {
  const { initiative } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getUserDetails } = useMember();

  const lead = initiative.lead_id ? getUserDetails(initiative.lead_id) : undefined;
  const health = HEALTH_OPTIONS.find((option) => option.key === initiative.health);

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/initiatives/${initiative.id}/`}
          className="flex-grow truncate text-14 font-medium hover:underline"
        >
          {initiative.name}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <InitiativeQuickActions initiative={initiative} />
        </div>
      </div>

      {initiative.description && <p className="line-clamp-2 text-13 text-secondary">{initiative.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        {health && (
          <div className="flex items-center gap-1">
            <health.Icon width="12" height="12" />
            {t(health.i18n_label)}
          </div>
        )}
        <span>
          {t("initiatives.projects")}: {initiative.total_projects}
        </span>
        {initiative.target_date && (
          <span>
            {t("initiatives.target_date")}: {renderFormattedDate(initiative.target_date)}
          </span>
        )}
        {lead && (
          <div className="flex items-center gap-1">
            <Avatar size="sm" name={lead.display_name} src={lead.avatar_url} />
            <span>{lead.display_name}</span>
          </div>
        )}
      </div>

      {initiative.total_issues > 0 && (
        <LinearProgressIndicator
          size="sm"
          data={[
            { id: "completed", name: t("common.done"), value: initiative.completed_issues, color: "#16A34A" },
            {
              id: "remaining",
              name: t("common.pending"),
              value: initiative.total_issues - initiative.completed_issues,
              color: "#A3A3A3",
            },
          ]}
        />
      )}
    </div>
  );
});
