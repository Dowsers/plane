/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// components
import { PageHead } from "@/components/core/page-title";
import { InitiativeDetailRoot } from "@/components/initiatives/detail/root";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";
import { useWorkspace } from "@/hooks/store/use-workspace";

function InitiativeDetailPage() {
  const { initiativeId } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { getInitiativeById } = useInitiative();

  const initiative = initiativeId ? getInitiativeById(initiativeId.toString()) : null;
  const pageTitle =
    currentWorkspace?.name && initiative?.name ? `${currentWorkspace.name} - ${initiative.name}` : undefined;

  if (!initiativeId) return null;

  return (
    <>
      <PageHead title={pageTitle} />
      <InitiativeDetailRoot initiativeId={initiativeId.toString()} />
    </>
  );
}

export default observer(InitiativeDetailPage);
