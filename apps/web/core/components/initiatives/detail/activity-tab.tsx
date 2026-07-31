/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Avatar, Loader } from "@plane/ui";
import { calculateTimeAgo } from "@plane/utils";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";

type Props = {
  initiativeId: string;
};

export const InitiativeActivityTab = observer(function InitiativeActivityTab(props: Props) {
  const { initiativeId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getInitiativeActivitiesById, fetchInitiativeActivities } = useInitiative();

  const { isLoading } = useSWR(
    workspaceSlug ? ["INITIATIVE_ACTIVITIES", workspaceSlug, initiativeId] : null,
    workspaceSlug ? () => fetchInitiativeActivities(workspaceSlug.toString(), initiativeId) : null,
    { revalidateOnFocus: false }
  );

  const activities = getInitiativeActivitiesById(initiativeId);

  if (isLoading && activities.length === 0) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="30px" />
        <Loader.Item height="30px" />
      </Loader>
    );
  }

  if (activities.length === 0) {
    return <p className="py-4 text-center text-13 text-secondary">{t("no_matching_results")}</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {activities.map((activity) => (
        <div key={activity.id} className="flex items-start gap-2 text-13">
          <Avatar size="sm" name={activity.actor_detail?.display_name} src={activity.actor_detail?.avatar_url} />
          <div className="flex flex-col">
            <span>
              <span className="font-medium">{activity.actor_detail?.display_name ?? t("common.deactivated_user")}</span>{" "}
              {activity.verb}
              {activity.field ? ` ${activity.field}` : ""}
              {activity.new_value ? `: ${activity.new_value}` : ""}
            </span>
            <span className="text-11 text-tertiary">{calculateTimeAgo(activity.created_at)}</span>
          </div>
        </div>
      ))}
    </div>
  );
});
