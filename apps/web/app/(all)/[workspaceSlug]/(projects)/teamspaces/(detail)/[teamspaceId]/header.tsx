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

export const TeamspaceDetailHeader = observer(function TeamspaceDetailHeader() {
  const { workspaceSlug, teamspaceId } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceById } = useTeamspace();

  const teamspace = teamspaceId ? getTeamspaceById(teamspaceId.toString()) : null;

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
          {teamspace && <Breadcrumbs.Item component={<BreadcrumbLink label={teamspace.name} />} />}
        </Breadcrumbs>
      </Header.LeftItem>
    </Header>
  );
});
