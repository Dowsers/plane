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
import type { ITeam } from "@plane/types";
// local imports
import { TeamQuickActions } from "./quick-actions";

type Props = {
  team: ITeam;
};

export const TeamCard = observer(function TeamCard(props: Props) {
  const { team } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/teams/${team.id}/`}
          className="flex-grow truncate text-14 font-medium hover:underline"
        >
          {team.name}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <TeamQuickActions team={team} />
        </div>
      </div>

      {team.description && <p className="line-clamp-2 text-13 text-secondary">{team.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <span>
          {t("teams.members")}: {team.members_count}
        </span>
        <span>
          {t("teams.projects")}: {team.projects_count}
        </span>
      </div>
    </div>
  );
});
