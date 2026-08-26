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
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateTeamspaceModal } from "./create-update-modal";
import { TeamspaceCard } from "./teamspace-card";

export const TeamspacesListRoot = observer(function TeamspacesListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getTeamspaceIds, getTeamspaceById, fetchTeamspaces } = useTeamspace();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_TEAMSPACES", workspaceSlug] : null,
    workspaceSlug ? () => fetchTeamspaces(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const teamspaceIds = workspaceSlug ? getTeamspaceIds(workspaceSlug.toString()) : null;

  if (isLoading && !teamspaceIds) {
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

  if (!teamspaceIds || teamspaceIds.length === 0) {
    return (
      <ContentWrapper>
        <CreateUpdateTeamspaceModal isOpen={createModal} handleClose={() => setCreateModal(false)} teamspace={null} />
        <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
          <h3 className="text-16 font-medium">{t("teamspaces.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("teamspaces.empty_state.description")}</p>
          <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
            {t("teamspaces.create_teamspace")}
          </Button>
        </div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateTeamspaceModal isOpen={createModal} handleClose={() => setCreateModal(false)} teamspace={null} />
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("teamspaces.create_teamspace")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {teamspaceIds.map((teamspaceId) => {
          const teamspace = getTeamspaceById(teamspaceId);
          if (!teamspace) return null;
          return <TeamspaceCard key={teamspaceId} teamspace={teamspace} />;
        })}
      </div>
    </ContentWrapper>
  );
});
