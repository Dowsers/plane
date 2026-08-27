/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { TeamspaceDetailRoot } from "@/components/teamspaces/detail/root";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useWorkspace } from "@/hooks/store/use-workspace";

function TeamspaceDetailPage() {
  const { teamspaceId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { getTeamspaceById } = useTeamspace();

  const teamspace = teamspaceId ? getTeamspaceById(teamspaceId.toString()) : null;
  const pageTitle =
    currentWorkspace?.name && teamspace?.name ? `${currentWorkspace.name} - ${teamspace.name}` : undefined;

  if (!teamspaceId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <TeamspaceDetailRoot teamspaceId={teamspaceId.toString()} />
    </>
  );
}

export default observer(TeamspaceDetailPage);
