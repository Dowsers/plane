/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Play, Square } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { EndCycleModal } from "./end-cycle/modal";

type Props = {
  cycleId: string;
  projectId: string;
};

export const CycleAdditionalActions = observer(function CycleAdditionalActions(props: Props) {
  const { cycleId, projectId } = props;
  // states
  const [endCycleModal, setEndCycleModal] = useState(false);
  // router
  const { workspaceSlug } = useParams();
  // hooks
  const { t } = useTranslation();
  // store hooks
  const { getCycleById, startStopCycle } = useCycle();
  const { allowPermissions } = useUserPermissions();

  const cycleDetails = getCycleById(cycleId);

  const isEditingAllowed = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    projectId
  );

  if (!cycleDetails || !isEditingAllowed || cycleDetails.archived_at) return <></>;

  const isManuallyActive = !!cycleDetails.actual_start_date && !cycleDetails.actual_end_date;

  const transferrableIssuesCount =
    (cycleDetails.total_issues ?? 0) - ((cycleDetails.cancelled_issues ?? 0) + (cycleDetails.completed_issues ?? 0));

  const handleStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!workspaceSlug) return;
    await startStopCycle(workspaceSlug.toString(), projectId, cycleId, "start").catch((error) => {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: error?.error ?? "Unable to start cycle. Please try again.",
      });
    });
  };

  const handleEndClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setEndCycleModal(true);
  };

  return (
    <>
      <EndCycleModal
        isOpen={endCycleModal}
        handleClose={() => setEndCycleModal(false)}
        cycleId={cycleId}
        projectId={projectId}
        workspaceSlug={workspaceSlug?.toString() ?? ""}
        transferrableIssuesCount={transferrableIssuesCount}
        cycleName={cycleDetails.name}
      />
      {isManuallyActive ? (
        <button onClick={handleEndClick} className="text-red-500 z-[1] flex flex-shrink-0 items-center gap-1 text-11">
          <Square className="h-3 w-3" />
          <span>{t("project_cycles.end_cycle")}</span>
        </button>
      ) : (
        <button
          onClick={handleStart}
          className="z-[1] flex flex-shrink-0 items-center gap-1 text-11 text-accent-secondary"
        >
          <Play className="h-3 w-3" />
          <span>{t("project_cycles.start_cycle")}</span>
        </button>
      )}
    </>
  );
});
