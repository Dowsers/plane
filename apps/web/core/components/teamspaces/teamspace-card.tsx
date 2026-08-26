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
import type { ITeamspace } from "@plane/types";
// local imports
import { TeamspaceQuickActions } from "./quick-actions";

type Props = {
  teamspace: ITeamspace;
};

export const TeamspaceCard = observer(function TeamspaceCard(props: Props) {
  const { teamspace } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();

  return (
    <div className="group relative flex flex-col gap-3 rounded-md border-[0.5px] border-subtle bg-surface-1 p-4 hover:bg-layer-1">
      <div className="flex items-start justify-between gap-2">
        <Link
          href={`/${workspaceSlug}/teamspaces/${teamspace.id}/`}
          className="flex-grow truncate text-14 font-medium hover:underline"
        >
          {teamspace.name}
        </Link>
        <div className="opacity-0 group-hover:opacity-100">
          <TeamspaceQuickActions teamspace={teamspace} />
        </div>
      </div>

      {teamspace.description && <p className="line-clamp-2 text-13 text-secondary">{teamspace.description}</p>}

      <div className="flex flex-wrap items-center gap-3 text-11 text-secondary">
        <span>
          {t("teamspaces.members")}: {teamspace.members_count}
        </span>
        <span>
          {t("teamspaces.projects")}: {teamspace.projects_count}
        </span>
      </div>
    </div>
  );
});
