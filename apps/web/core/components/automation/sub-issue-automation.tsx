/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useParams } from "next/navigation";
import { observer } from "mobx-react";
import { GitMerge } from "lucide-react";
import { EUserPermissions, EUserPermissionsLevel, EIconSize } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { StateGroupIcon, StatePropertyIcon } from "@plane/propel/icons";
import type { IProject } from "@plane/types";
import { CustomSearchSelect, ToggleSwitch, Loader } from "@plane/ui";
import { SettingsControlItem } from "@/components/settings/control-item";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useUserPermissions } from "@/hooks/store/user";

type Props = {
  handleChange: (formData: Partial<IProject>) => Promise<void>;
};

export const SubIssueAutomation = observer(function SubIssueAutomation(props: Props) {
  const { handleChange } = props;
  const { workspaceSlug } = useParams();
  const { currentProjectDetails } = useProject();
  const { projectStates } = useProjectState();
  const { allowPermissions } = useUserPermissions();
  const { t } = useTranslation();

  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug?.toString(),
    currentProjectDetails?.id
  );

  const closedStateOptions = projectStates
    ?.filter((state) => state.group === "completed" || state.group === "cancelled")
    .map((state) => ({
      value: state.id,
      query: state.name,
      content: (
        <div className="flex items-center gap-2">
          <StateGroupIcon stateGroup={state.group} color={state.color} size={EIconSize.LG} />
          {state.name}
        </div>
      ),
    }));

  const defaultCloseState = projectStates?.find((s) => s.group === "completed")?.id ?? null;
  const selectedCloseState = projectStates?.find(
    (s) => s.id === (currentProjectDetails?.sub_issue_auto_close_state ?? defaultCloseState)
  );

  const autoCloseEnabled = !!currentProjectDetails?.sub_issue_auto_close;
  const cascadeCloseEnabled = !!currentProjectDetails?.sub_issue_cascade_close;

  return (
    <div className="flex flex-col gap-4 py-2">
      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-layer-2">
          <GitMerge className="size-4 shrink-0 text-danger-primary" />
        </div>
        <SettingsControlItem
          title={t("project_settings.automations.sub_issue_auto_close.title")}
          description={t("project_settings.automations.sub_issue_auto_close.description")}
          control={
            <ToggleSwitch
              value={autoCloseEnabled}
              onChange={() =>
                void handleChange({
                  sub_issue_auto_close: !autoCloseEnabled,
                  sub_issue_auto_close_state: !autoCloseEnabled ? defaultCloseState : null,
                })
              }
              size="sm"
              disabled={!isAdmin}
            />
          }
        />
      </div>

      {currentProjectDetails ? (
        autoCloseEnabled && (
          <div className="ml-13">
            <div className="flex flex-col rounded-sm border border-subtle bg-surface-2">
              <div className="flex w-full items-center justify-between gap-2 px-5 py-4">
                <div className="w-1/2 text-13 font-medium">
                  {t("project_settings.automations.sub_issue_auto_close.close_parent_to")}
                </div>
                <div className="w-1/2">
                  <CustomSearchSelect
                    value={currentProjectDetails?.sub_issue_auto_close_state ?? defaultCloseState}
                    label={
                      <div className="flex items-center gap-2">
                        {selectedCloseState ? (
                          <StateGroupIcon
                            stateGroup={selectedCloseState.group}
                            color={selectedCloseState.color}
                            size={EIconSize.LG}
                          />
                        ) : (
                          <StatePropertyIcon className="h-3.5 w-3.5 text-secondary" />
                        )}
                        {selectedCloseState?.name ?? <span className="text-secondary">{t("state")}</span>}
                      </div>
                    }
                    onChange={(val: string) => void handleChange({ sub_issue_auto_close_state: val })}
                    options={closedStateOptions}
                    input
                    disabled={!isAdmin}
                  />
                </div>
              </div>
            </div>
          </div>
        )
      ) : (
        <Loader className="ml-13">
          <Loader.Item height="50px" />
        </Loader>
      )}

      <div className="flex items-center gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-sm bg-layer-2">
          <GitMerge className="size-4 shrink-0 rotate-180 text-danger-primary" />
        </div>
        <SettingsControlItem
          title={t("project_settings.automations.sub_issue_cascade_close.title")}
          description={t("project_settings.automations.sub_issue_cascade_close.description")}
          control={
            <ToggleSwitch
              value={cascadeCloseEnabled}
              onChange={() => void handleChange({ sub_issue_cascade_close: !cascadeCloseEnabled })}
              size="sm"
              disabled={!isAdmin}
            />
          }
        />
      </div>
    </div>
  );
});
