/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Users } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Breadcrumbs, Header } from "@plane/ui";
// components
import { BreadcrumbLink } from "@/components/common/breadcrumb-link";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";

export const TeamspaceViewDetailHeader = observer(function TeamspaceViewDetailHeader() {
  const { workspaceSlug, teamspaceId, viewId } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceById, getTeamspaceViewsById } = useTeamspace();

  const teamspace = teamspaceId ? getTeamspaceById(teamspaceId.toString()) : null;
  const view =
    teamspaceId && viewId ? getTeamspaceViewsById(teamspaceId.toString()).find((v) => v.id === viewId) : undefined;

  return (
    <Header>
      <Header.LeftItem>
        <Breadcrumbs>
          <Breadcrumbs.Item
            component={
              <BreadcrumbLink
                href={`/${workspaceSlug}/teamspaces/`}
                label={t("teamspaces.label")}
                icon={<Users className="h-4 w-4 text-tertiary" />}
              />
            }
          />
          {teamspace && (
            <Breadcrumbs.Item
              component={
                <BreadcrumbLink href={`/${workspaceSlug}/teamspaces/${teamspace.id}/`} label={teamspace.name} />
              }
            />
          )}
          {view && <Breadcrumbs.Item component={<BreadcrumbLink label={view.name} />} />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
