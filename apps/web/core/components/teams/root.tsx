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
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button, ContentWrapper, Loader } from "@plane/ui";
// hooks
import { useTeam } from "@/hooks/store/use-team";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateTeamModal } from "./create-update-modal";
import { TeamCard } from "./team-card";

export const TeamsListRoot = observer(function TeamsListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getTeamIds, getTeamById, fetchTeams } = useTeam();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_TEAMS", workspaceSlug] : null,
    workspaceSlug ? () => fetchTeams(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const teamIds = workspaceSlug ? getTeamIds(workspaceSlug.toString()) : null;

  if (isLoading && !teamIds) {
    return (
      <ContentWrapper>
        <Loader className="flex flex-col gap-3">
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
          <Loader.Item height="80px" />
        </Loader>
      </ContentWrapper>
    );
  }

  if (!teamIds || teamIds.length === 0) {
    return (
      <ContentWrapper>
        <CreateUpdateTeamModal isOpen={createModal} handleClose={() => setCreateModal(false)} team={null} />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <h3 className="text-16 font-medium">{t("teams.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("teams.empty_state.description")}</p>
          <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
            {t("teams.create_team")}
          </Button>
        </div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateTeamModal isOpen={createModal} handleClose={() => setCreateModal(false)} team={null} />
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("teams.create_team")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {teamIds.map((teamId) => {
          const team = getTeamById(teamId);
          if (!team) return null;
          return <TeamCard key={teamId} team={team} />;
        })}
      </div>
    </ContentWrapper>
  );
});
