/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Tab } from "@headlessui/react";
import useSWR from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import type { TTeamspaceRelationDirection } from "@plane/types";
import { Loader } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

type Props = {
  teamspaceId: string;
};

const DIRECTIONS: TTeamspaceRelationDirection[] = ["blocking", "blocked"];

export const TeamspaceRelationsPanel = observer(function TeamspaceRelationsPanel(props: Props) {
  const { teamspaceId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceRelationsById, fetchTeamspaceRelations } = useTeamspace();

  const [direction, setDirection] = useState<TTeamspaceRelationDirection>("blocking");

  const { isLoading } = useSWR(
    workspaceSlug ? ["TEAMSPACE_RELATIONS", workspaceSlug, teamspaceId, direction] : null,
    workspaceSlug ? () => fetchTeamspaceRelations(workspaceSlug.toString(), teamspaceId, direction) : null,
    { revalidateOnFocus: false }
  );

  const relations = getTeamspaceRelationsById(teamspaceId);
  const results = relations?.direction === direction ? relations.results : [];

  return (
    <div className="flex flex-col gap-3 rounded-md border-[0.5px] border-subtle p-4">
      <h3 className="text-14 font-medium">{t("teamspaces.overview.team_relations")}</h3>

      <Tab.Group
        as={Fragment}
        selectedIndex={DIRECTIONS.indexOf(direction)}
        onChange={(index) => setDirection(DIRECTIONS[index])}
      >
        <Tab.List as="div" className="flex w-fit items-center gap-1 rounded-md bg-layer-2 p-1 text-13">
          {DIRECTIONS.map((dir) => (
            <Tab
              key={dir}
              className={({ selected }) =>
                cn("rounded-sm px-3 py-1 text-secondary outline-none", {
                  "bg-layer-transparent-active text-primary": selected,
                })
              }
            >
              {t(`teamspaces.overview.relations_${dir}`)}
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels as={Fragment}>
          {DIRECTIONS.map((dir) => (
            <Tab.Panel key={dir} as="div" className="pt-3">
              {isLoading && results.length === 0 ? (
                <Loader className="flex flex-col gap-2">
                  <Loader.Item height="32px" />
                  <Loader.Item height="32px" />
                </Loader>
              ) : results.length === 0 ? (
                <p className="py-4 text-center text-13 text-secondary">{t("teamspaces.overview.no_relations")}</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {results.map((relation) => (
                    <div
                      key={relation.id}
                      className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle px-3 py-2 text-13"
                    >
                      <span className="truncate">{relation.issue_name}</span>
                      <span className="flex-shrink-0 text-11 text-secondary">
                        {dir === "blocking" ? t("teamspaces.overview.blocks") : t("teamspaces.overview.blocked_by")}
                      </span>
                      <span className="truncate text-secondary">{relation.related_issue_name}</span>
                    </div>
                  ))}
                </div>
              )}
            </Tab.Panel>
          ))}
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
});
