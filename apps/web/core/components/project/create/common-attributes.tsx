/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ChangeEvent } from "react";
import { useParams } from "next/navigation";
import type { UseFormSetValue } from "react-hook-form";
import { Controller, useFormContext } from "react-hook-form";
import useSWR from "swr";
import { InfoIcon } from "@plane/propel/icons";
// plane imports
import { ETabIndices, EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
// ui
import { Tooltip } from "@plane/propel/tooltip";
import { CustomSelect, Input, TextArea } from "@plane/ui";
import { cn, projectIdentifierSanitizer, getTabIndex } from "@plane/utils";
// plane utils
// helpers
import { TEAMSPACE_LEAD } from "@/components/teamspaces/constants";
// hooks
import { useTeamspace } from "@/hooks/store/use-teamspace";
import { useUserPermissions } from "@/hooks/store/user";
import { useWorkspace } from "@/hooks/store/use-workspace";
// plane-web types
import type { TProject } from "@/plane-web/types/projects";

type Props = {
  setValue: UseFormSetValue<TProject>;
  isMobile: boolean;
  shouldAutoSyncIdentifier: boolean;
  setShouldAutoSyncIdentifier: (value: boolean) => void;
  handleFormOnChange?: () => void;
};

function ProjectCommonAttributes(props: Props) {
  const { setValue, isMobile, shouldAutoSyncIdentifier, setShouldAutoSyncIdentifier, handleFormOnChange } = props;
  const {
    formState: { errors },
    control,
    getValues,
  } = useFormContext<TProject>();

  const { getIndex } = getTabIndex(ETabIndices.PROJECT_CREATE, isMobile);
  const { t } = useTranslation();

  // Workspace/Team default-identifier prefix (see docs note on default-ID
  // attribution) - a workspace or team can configure a short code that
  // seeds new projects' `identifier` at creation, taking precedence over
  // deriving it from the typed name.
  const { workspaceSlug } = useParams();
  const { currentWorkspace } = useWorkspace();
  const { allowPermissions } = useUserPermissions();
  const { getTeamspaceIds, getTeamspaceById, fetchTeamspaces } = useTeamspace();
  useSWR(
    workspaceSlug ? ["PROJECT_CREATE_TEAMSPACES", workspaceSlug] : null,
    workspaceSlug ? () => fetchTeamspaces(workspaceSlug.toString()) : null,
    { revalidateOnFocus: false }
  );
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const allTeamspaceIds = getTeamspaceIds(workspaceSlug?.toString() ?? "") ?? [];
  // Only a Teamspace's own Leads (or a workspace Admin) may pick it as a
  // new project's `primary_teamspace` - same bar enforced server-side in
  // `ProjectSerializer.validate_primary_teamspace`. `current_user_role` is
  // returned directly by the teamspace list endpoint so this doesn't need
  // a separate per-team members fetch.
  const selectableTeamspaceIds = isWorkspaceAdmin
    ? allTeamspaceIds
    : allTeamspaceIds.filter((id) => getTeamspaceById(id)?.current_user_role === TEAMSPACE_LEAD);

  const computeAutoIdentifier = (name: string, teamId: string | null | undefined) => {
    const teamDefault = teamId ? getTeamspaceById(teamId)?.default_project_identifier : null;
    const workspaceDefault = currentWorkspace?.default_project_identifier;
    if (teamDefault) return teamDefault;
    if (workspaceDefault) return workspaceDefault;
    return name ? projectIdentifierSanitizer(name) : "";
  };

  const handleNameChange =
    (onChange: (event: ChangeEvent<HTMLInputElement>) => void) => (e: ChangeEvent<HTMLInputElement>) => {
      if (!shouldAutoSyncIdentifier) {
        onChange(e);
        return;
      }
      setValue("identifier", computeAutoIdentifier(e.target.value, getValues("primary_teamspace")));
      onChange(e);
      handleFormOnChange?.();
    };

  const handleIdentifierChange = (onChange: (value: string) => void) => (e: ChangeEvent<HTMLInputElement>) => {
    const { value } = e.target;
    const alphanumericValue = projectIdentifierSanitizer(value);
    setShouldAutoSyncIdentifier(false);
    onChange(alphanumericValue);
    handleFormOnChange?.();
  };

  const handleTeamChange = (onChange: (value: string | null) => void) => (teamId: string | null) => {
    onChange(teamId);
    if (shouldAutoSyncIdentifier) {
      setValue("identifier", computeAutoIdentifier(getValues("name") ?? "", teamId));
    }
    handleFormOnChange?.();
  };

  return (
    <div className="grid grid-cols-1 gap-x-2 gap-y-3 md:grid-cols-4">
      <div className="md:col-span-3">
        <Controller
          control={control}
          name="name"
          rules={{
            required: t("name_is_required"),
            maxLength: {
              value: 255,
              message: t("title_should_be_less_than_255_characters"),
            },
          }}
          render={({ field: { value, onChange } }) => (
            <Input
              id="name"
              name="name"
              type="text"
              value={value}
              onChange={handleNameChange(onChange)}
              hasError={Boolean(errors.name)}
              placeholder={t("project_name")}
              className="focus:border-blue-400 w-full"
              tabIndex={getIndex("name")}
            />
          )}
        />
        <span className="text-11 text-danger-primary">{errors?.name?.message}</span>
      </div>
      <div className="relative">
        <Controller
          control={control}
          name="identifier"
          rules={{
            required: t("project_id_is_required"),
            // allow only alphanumeric & non-latin characters
            validate: (value) =>
              /^[ÇŞĞIİÖÜA-Z0-9]+$/.test(value.toUpperCase()) || t("only_alphanumeric_non_latin_characters_allowed"),
            minLength: {
              value: 1,
              message: t("project_id_min_char"),
            },
          }}
          render={({ field: { value, onChange } }) => (
            <Input
              id="identifier"
              name="identifier"
              type="text"
              value={value}
              onChange={handleIdentifierChange(onChange)}
              hasError={Boolean(errors.identifier)}
              placeholder={t("project_id")}
              className={cn("focus:border-blue-400 w-full pr-7 text-11", {
                uppercase: value,
              })}
              tabIndex={getIndex("identifier")}
            />
          )}
        />
        <Tooltip
          isMobile={isMobile}
          tooltipContent={t("project_id_tooltip_content")}
          className="text-13"
          position="right-start"
        >
          <InfoIcon className="absolute top-2.5 right-2 h-3 w-3 text-placeholder" />
        </Tooltip>
        <span className="text-11 text-danger-primary">{errors?.identifier?.message}</span>
      </div>
      <div className="md:col-span-4">
        <Controller
          control={control}
          name="primary_teamspace"
          render={({ field: { value, onChange } }) => (
            <CustomSelect
              value={value ?? null}
              onChange={handleTeamChange(onChange)}
              label={value ? (getTeamspaceById(value)?.name ?? t("team")) : t("select_team")}
              placement="bottom-start"
              buttonClassName="border border-subtle bg-layer-2 !shadow-none !rounded-md"
              input
              tabIndex={getIndex("team")}
            >
              <CustomSelect.Option value={null}>{t("select_team")}</CustomSelect.Option>
              {selectableTeamspaceIds.map((id) => (
                <CustomSelect.Option key={id} value={id}>
                  {getTeamspaceById(id)?.name}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          )}
        />
      </div>
      <div className="md:col-span-4">
        <Controller
          name="description"
          control={control}
          render={({ field: { value, onChange } }) => (
            <TextArea
              id="description"
              name="description"
              value={value}
              placeholder={t("description")}
              onChange={(e) => {
                onChange(e);
                handleFormOnChange?.();
              }}
              className="focus:border-blue-400 !h-24 text-13"
              hasError={Boolean(errors?.description)}
              tabIndex={getIndex("description")}
            />
          )}
        />
      </div>
    </div>
  );
}

export default ProjectCommonAttributes;
