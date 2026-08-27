/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import Link from "next/link";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { ITeamspaceCycleSummary } from "@plane/types";
import { Loader } from "@plane/ui";
import { renderFormattedDate } from "@plane/utils";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
};

const STATUS_GROUPS: { key: "active" | "upcoming" | "completed"; i18nKey: string }[] = [
  { key: "active", i18nKey: "teamspaces.cycles.active" },
  { key: "upcoming", i18nKey: "teamspaces.cycles.upcoming" },
  { key: "completed", i18nKey: "teamspaces.cycles.completed" },
];

export const TeamspaceCyclesTab = observer(function TeamspaceCyclesTab(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceCyclesById, fetchTeamspaceCycles } = useTeamspace();

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_CYCLES", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceCycles(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const cycles = getTeamspaceCyclesById(teamspaceId);

  if (isLoading && !cycles) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="80px" />
        <Loader.Item height="80px" />
      </Loader>
    );
  }

  if (!cycles) return null;

  const isEmpty = cycles.active.length === 0 && cycles.upcoming.length === 0 && cycles.completed.length === 0;

  if (isEmpty) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
        <h3 className="text-16 font-medium">{t("teamspaces.cycles.empty_state.title")}</h3>
        <p className="max-w-md text-13 text-secondary">{t("teamspaces.cycles.empty_state.description")}</p>
      </div>
    );
  }

  const renderCycleRow = (cycle: ITeamspaceCycleSummary) => (
    <Link
      key={cycle.id}
      href={`/${workspaceSlug}/projects/${cycle.project_id}/cycles/${cycle.id}/`}
      className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3 hover:bg-layer-1"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <span className="truncate text-13 font-medium">{cycle.name}</span>
        <span className="truncate text-11 text-secondary">{cycle.project_name}</span>
      </div>
      <div className="flex-shrink-0 text-11 text-secondary">
        {cycle.start_date && renderFormattedDate(cycle.start_date)}
        {cycle.start_date && cycle.end_date && " – "}
        {cycle.end_date && renderFormattedDate(cycle.end_date)}
      </div>
    </Link>
  );

  return (
    <div className="flex flex-col gap-6">
      {STATUS_GROUPS.map((group) => {
        const items = cycles[group.key];
        if (items.length === 0) return null;
        return (
          <div key={group.key} className="flex flex-col gap-2">
            <h3 className="text-13 font-medium text-secondary">
              {t(group.i18nKey)} ({items.length})
            </h3>
            <div className="flex flex-col gap-2">{items.map(renderCycleRow)}</div>
          </div>
        );
      })}
    </div>
  );
});
