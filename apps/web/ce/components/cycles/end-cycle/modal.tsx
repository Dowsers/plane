/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { AlertCircle } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { CycleIcon, SearchIcon, CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { EIssuesStoreType } from "@plane/types";
import { Button, EModalPosition, EModalWidth, ModalCore } from "@plane/ui";
// hooks
import { useCycle } from "@/hooks/store/use-cycle";
import { useIssues } from "@/hooks/store/use-issues";

interface Props {
  isOpen: boolean;
  handleClose: () => void;
  cycleId: string;
  projectId: string;
  workspaceSlug: string;
  transferrableIssuesCount: number;
  cycleName: string;
}

export const EndCycleModal = observer(function EndCycleModal(props: Props) {
  const { isOpen, handleClose, cycleId, projectId, workspaceSlug, transferrableIssuesCount, cycleName } = props;
  // states
  const [query, setQuery] = useState("");
  const [isEnding, setIsEnding] = useState(false);
  // hooks
  const { t } = useTranslation();
  // store hooks
  const { currentProjectIncompleteCycleIds, getCycleById, startStopCycle } = useCycle();
  const {
    issues: { transferIssuesFromCycle },
  } = useIssues(EIssuesStoreType.CYCLE);

  const hasPendingItems = transferrableIssuesCount > 0;

  const filteredOptions = (currentProjectIncompleteCycleIds ?? [])
    .filter((optionId) => optionId !== cycleId)
    .filter((optionId) => {
      const cycleDetails = getCycleById(optionId);
      return cycleDetails?.name?.toLowerCase().includes(query.toLowerCase());
    });

  const endCycle = async () => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    setIsEnding(true);
    await startStopCycle(workspaceSlug, projectId, cycleId, "end")
      .then(() => {
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: "Success!",
          message: "Cycle has been ended successfully",
        });
        handleClose();
        return;
      })
      .catch((error) => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: error?.error ?? "Unable to end cycle. Please try again.",
        });
      })
      .finally(() => setIsEnding(false));
  };

  const transferAndEndCycle = async (newCycleId: string) => {
    if (!workspaceSlug || !projectId || !cycleId) return;
    setIsEnding(true);
    await transferIssuesFromCycle(workspaceSlug, projectId, cycleId, { new_cycle_id: newCycleId })
      .then(() => endCycle())
      .catch(() => {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: "Error!",
          message: "Unable to transfer work items. Please try again.",
        });
        setIsEnding(false);
      });
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="flex flex-col gap-4 py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">{t("project_cycles.end_cycle_modal.title")}</h4>
          <button onClick={handleClose}>
            <CloseIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="px-5 text-13 text-secondary">
          {hasPendingItems
            ? t("project_cycles.end_cycle_modal.description_with_pending_items", {
                name: cycleName,
                count: transferrableIssuesCount,
              })
            : t("project_cycles.end_cycle_modal.description_no_pending_items", { name: cycleName })}
        </p>
        {hasPendingItems && (
          <>
            <p className="px-5 text-12 font-medium text-tertiary">
              {t("project_cycles.end_cycle_modal.transfer_and_pick_cycle")}
            </p>
            <div className="flex items-center gap-2 border-b border-subtle px-5 pb-3">
              <SearchIcon className="h-4 w-4 text-secondary" />
              <input
                className="text-13 outline-none"
                placeholder="Search for a cycle..."
                onChange={(e) => setQuery(e.target.value)}
                value={query}
              />
            </div>
            <div className="flex max-h-64 w-full flex-col items-start gap-2 overflow-y-auto px-5">
              {filteredOptions.length > 0 ? (
                filteredOptions.map((optionId) => {
                  const optionCycleDetails = getCycleById(optionId);
                  if (!optionCycleDetails) return null;

                  return (
                    <button
                      key={optionId}
                      disabled={isEnding}
                      className="flex w-full items-center gap-4 rounded-sm px-4 py-3 text-13 text-secondary hover:bg-surface-2 disabled:opacity-50"
                      onClick={() => transferAndEndCycle(optionId)}
                    >
                      <CycleIcon className="h-5 w-5" />
                      <span className="truncate">{optionCycleDetails.name}</span>
                    </button>
                  );
                })
              ) : (
                <div className="flex w-full items-center justify-center gap-4 p-5 text-13">
                  <AlertCircle className="h-3.5 w-3.5 text-secondary" />
                  <span className="text-center text-secondary">
                    {t("project_cycles.end_cycle_modal.no_matching_cycles")}
                  </span>
                </div>
              )}
            </div>
          </>
        )}
        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isEnding}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={endCycle} loading={isEnding}>
            {hasPendingItems
              ? t("project_cycles.end_cycle_modal.end_without_transfer")
              : t("project_cycles.end_cycle_modal.end_cycle_action")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
