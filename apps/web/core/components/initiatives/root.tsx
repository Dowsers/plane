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
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { Button, ContentWrapper, Loader } from "@plane/ui";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { CreateUpdateInitiativeModal } from "./create-update-modal";
import { InitiativeCard } from "./initiative-card";

export const InitiativesListRoot = observer(function InitiativesListRoot() {
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getInitiativeIds, getInitiativeById, fetchInitiatives } = useInitiative();

  const [createModal, setCreateModal] = useState(false);

  const { isLoading } = useSWR(
    workspaceSlug ? ["WORKSPACE_INITIATIVES", workspaceSlug] : null,
    workspaceSlug ? () => fetchInitiatives(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );

  const canCreate = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.WORKSPACE
  );
  const initiativeIds = workspaceSlug ? getInitiativeIds(workspaceSlug.toString()) : null;

  if (isLoading && !initiativeIds) {
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

  if (!initiativeIds || initiativeIds.length === 0) {
    return (
      <ContentWrapper>
        <CreateUpdateInitiativeModal isOpen={createModal} handleClose={() => setCreateModal(false)} initiative={null} />
        <EmptyStateDetailed
          assetKey="initiative"
          title={t("workspace_empty_state.initiatives.title")}
          description={t("workspace_empty_state.initiatives.description")}
          actions={[
            {
              label: t("workspace_empty_state.initiatives.cta_primary"),
              onClick: () => setCreateModal(true),
              disabled: !canCreate,
              variant: "primary",
            },
          ]}
        />
      </ContentWrapper>
    );
  }

  return (
    <ContentWrapper>
      <CreateUpdateInitiativeModal isOpen={createModal} handleClose={() => setCreateModal(false)} initiative={null} />
      <div className="flex items-center justify-end pb-4">
        <Button variant="primary" size="sm" onClick={() => setCreateModal(true)} disabled={!canCreate}>
          {t("initiatives.create_initiative")}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
        {initiativeIds.map((initiativeId) => {
          const initiative = getInitiativeById(initiativeId);
          if (!initiative) return null;
          return <InitiativeCard key={initiativeId} initiative={initiative} />;
        })}
      </div>
    </ContentWrapper>
  );
});
