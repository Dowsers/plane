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
import { useMilestone } from "@/hooks/store/use-milestone";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateMilestoneModal } from "./create-update-modal";
import { MilestoneCard } from "./milestone-card";

export const MilestonesListRoot = observer(function MilestonesListRoot() {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getProjectMilestoneIds, getMilestoneById, fetchMilestones } = useMilestone();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug && projectId ? ["PROJECT_MILESTONES", workspaceSlug, projectId] : null,
    workspaceSlug && projectId ? () => fetchMilestones(workspaceSlug.toString(), projectId.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId?.toString()
  );
  const milestoneIds = projectId ? getProjectMilestoneIds(projectId.toString()) : null;

  if (isLoading && !milestoneIds) {
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

  if (!milestoneIds || milestoneIds.length === 0) {
    return (
      <ContentWrapper className="items-center justify-center">
        <CreateUpdateMilestoneModal isOpen={createModal} handleClose={() => setCreateModal(false)} milestone={null} />
        <div className="flex flex-col items-center gap-3 text-center">
          <h3 className="text-16 font-medium">{t("milestones.empty_state.title")}</h3>
          <p className="max-w-md text-13 text-secondary">{t("milestones.empty_state.description")}</p>
          {canCreate && (
            <Button variant="primary" size="sm" onClick={() => setCreateModal(true)}>
              {t("milestones.empty_state.cta_primary")}
            </Button>
          )}
        </div>
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateMilestoneModal isOpen={createModal} handleClose={() => setCreateModal(false)} milestone={null} />
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("milestones.create_milestone")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {milestoneIds.map((milestoneId) => {
          const milestone = getMilestoneById(milestoneId);
          if (!milestone) return null;
          return <MilestoneCard key={milestoneId} milestone={milestone} />;
        })}
      </div>
    </ContentWrapper>
  );
});
