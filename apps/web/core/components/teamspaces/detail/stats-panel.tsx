/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { CHART_COLOR_PALETTES, STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TreeMapChart } from "@plane/propel/charts/tree-map";
import type { TTeamspaceStatsGroupBy, TreeMapItem } from "@plane/types";
import { CustomSelect, Loader } from "@plane/ui";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
};

const GROUP_BY_OPTIONS: { key: TTeamspaceStatsGroupBy; label: string }[] = [
  { key: "project", label: "Project" },
  { key: "member", label: "Member" },
  { key: "state_group", label: "State group" },
  { key: "dependency", label: "Dependency" },
  { key: "due_by", label: "Due date" },
];

// Stable module-level reference (not recreated per render) so it can be a
// `useMemo` dependency without defeating the memoization below.
const PALETTE = CHART_COLOR_PALETTES[0]?.light ?? [];

// Row -> readable label + a stable color, per `group_by` shape returned by
// `WorkspaceTeamspaceStatsEndpoint` (apps/api/plane/app/views/workspace/teamspace.py).
const rowNameAndColor = (
  groupBy: TTeamspaceStatsGroupBy,
  row: Record<string, string | number | null>,
  paletteColor: string
): { name: string; color: string } => {
  switch (groupBy) {
    case "project":
      return { name: String(row.project__name ?? "—"), color: paletteColor };
    case "member":
      return { name: String(row.assignees__display_name ?? "Unassigned"), color: paletteColor };
    case "state_group": {
      const group = String(row.state__group ?? "");
      return {
        name: STATE_GROUPS[group as keyof typeof STATE_GROUPS]?.label ?? group,
        color: STATE_GROUPS[group as keyof typeof STATE_GROUPS]?.color ?? paletteColor,
      };
    }
    case "dependency":
      return { name: String(row.dependency ?? "—"), color: paletteColor };
    case "due_by":
      return { name: String(row.due_by ?? "—"), color: paletteColor };
    default:
      return { name: "—", color: paletteColor };
  }
};

export const TeamspaceStatsPanel = observer(function TeamspaceStatsPanel(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceStatsById, fetchTeamspaceStats } = useTeamspace();

  const [groupBy, setGroupBy] = useState<TTeamspaceStatsGroupBy>("project");

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_STATS", workspaceSlug, teamspaceId, groupBy] : null,
    workspaceSlug ? () => fetchTeamspaceStats(workspaceSlug.toString(), teamspaceId, groupBy) : null,
    { revalidateOnFocus: false }
  );

  const stats = getTeamspaceStatsById(teamspaceId);
  const results = stats?.group_by === groupBy ? stats.results : [];

  // Not memoized: `results` is a small (a handful of grouped rows), already
  // recomputed on every render from the mobx-observed `stats` map, so a
  // `useMemo` here would either be unstable (new `[]` each render when
  // there's no match yet) or add complexity for a negligible cost map/filter.
  const treeMapData: TreeMapItem[] = results
    .filter((row) => Number(row.count ?? 0) > 0)
    .map((row, index) => {
      const { name, color } = rowNameAndColor(groupBy, row, PALETTE[index % PALETTE.length] ?? "#6172E8");
      return {
        name,
        value: Number(row.count ?? 0),
        fillColor: color,
      };
    });

  return (
    <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-14 font-medium">{t("teamspaces.overview.team_stats")}</h3>
        <CustomSelect
          value={groupBy}
          onChange={(val: TTeamspaceStatsGroupBy) => setGroupBy(val)}
          label={GROUP_BY_OPTIONS.find((o) => o.key === groupBy)?.label ?? groupBy}
          buttonClassName="!border-subtle !shadow-none rounded-md text-13"
          input
        >
          {GROUP_BY_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.key} value={option.key}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      </div>

      {isLoading && results.length === 0 ? (
        <Loader>
          <Loader.Item height="320px" />
        </Loader>
      ) : treeMapData.length > 0 ? (
        <TreeMapChart data={treeMapData} className="h-80 w-full" />
      ) : (
        <p className="py-8 text-center text-13 text-secondary">{t("teamspaces.overview.no_stats_data")}</p>
      )}
    </div>
  );
});
