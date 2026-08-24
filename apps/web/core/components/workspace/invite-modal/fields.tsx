/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { Control, FieldArrayWithId, FormState } from "react-hook-form";
import { Controller } from "react-hook-form";
import useSWR from "swr";
// plane imports
import { ROLE } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { CloseIcon } from "@plane/propel/icons";
import { CustomSelect, Input } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SystemBadge } from "@/components/workspace/settings/rbac/system-badge";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
import type { InvitationFormValues } from "@/hooks/use-workspace-invitation";
// services
import workspaceRBACService from "@/services/workspace-rbac.service";

type TInvitationFieldsProps = {
  workspaceSlug: string;
  fields: FieldArrayWithId<InvitationFormValues, "emails", "id">[];
  control: Control<InvitationFormValues>;
  formState: FormState<InvitationFormValues>;
  remove: (index: number) => void;
  className?: string;
};

export const InvitationFields = observer(function InvitationFields(props: TInvitationFieldsProps) {
  const {
    workspaceSlug,
    fields,
    control,
    formState: { errors },
    remove,
    className,
  } = props;
  // plane hooks
  const { t } = useTranslation();
  // store hooks
  const { workspaceInfoBySlug } = useUserPermissions();
  // derived values
  const currentWorkspaceRole = workspaceInfoBySlug(workspaceSlug.toString())?.role;
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 4 - role selector driven by `GET /roles/`
  // instead of the 3 hardcoded legacy values (spec's own UI section).
  // Restricted to SYSTEM roles only - `WorkspaceMemberInvite` (the
  // backend model this modal writes to) has no `custom_role` field at
  // all, only the plain legacy `role` int, so a genuinely custom role
  // cannot be assigned at invite time; it can still be assigned right
  // after the invite is accepted, from the Members list's own role
  // selector (which DOES support `custom_role_id`) - a deliberate,
  // backend-shaped scope boundary, not an oversight.
  const { data: roles } = useSWR(
    ["RBAC_ROLES", workspaceSlug],
    () => workspaceRBACService.listRoles(workspaceSlug.toString()),
    { revalidateOnFocus: false }
  );
  const systemRoles = (roles ?? []).filter((role) => role.is_system && role.legacy_role_value !== null);

  return (
    <div className={cn("mb-3 space-y-4", className)}>
      {fields.map((field, index) => (
        <div
          key={field.id}
          className="group relative mb-1 flex w-full items-start justify-between gap-x-4 text-body-xs-regular"
        >
          <div className="w-full">
            <Controller
              control={control}
              name={`emails.${index}.email`}
              rules={{
                required: t("workspace_settings.settings.members.modal.errors.required"),
                pattern: {
                  value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                  message: t("workspace_settings.settings.members.modal.errors.invalid"),
                },
              }}
              render={({ field: { value, onChange, ref } }) => (
                <>
                  <Input
                    id={`emails.${index}.email`}
                    name={`emails.${index}.email`}
                    type="text"
                    value={value}
                    onChange={onChange}
                    ref={ref}
                    hasError={Boolean(errors.emails?.[index]?.email)}
                    placeholder={t("workspace_settings.settings.members.modal.placeholder")}
                    className="w-full text-caption-sm-regular sm:text-body-xs-regular"
                  />
                  {errors.emails?.[index]?.email && (
                    <span className="ml-1 text-caption-sm-regular text-danger-primary">
                      {errors.emails?.[index]?.email?.message}
                    </span>
                  )}
                </>
              )}
            />
          </div>
          <div className="flex shrink-0 items-center justify-between gap-2">
            <div className="flex flex-col gap-1">
              <Controller
                control={control}
                name={`emails.${index}.role`}
                rules={{ required: true }}
                render={({ field: { value, onChange } }) => {
                  const matchingRole = systemRoles.find((role) => role.legacy_role_value === value);
                  const label = matchingRole?.name ?? ROLE[value];
                  return (
                    <CustomSelect
                      value={value}
                      label={
                        <span className="flex items-center gap-1 text-caption-sm-regular sm:text-body-xs-regular">
                          {label}
                        </span>
                      }
                      onChange={onChange}
                      className="w-fit min-w-24 flex-grow"
                      input
                    >
                      {systemRoles.length > 0
                        ? systemRoles.map(
                            (role) =>
                              currentWorkspaceRole &&
                              role.legacy_role_value !== null &&
                              currentWorkspaceRole >= role.legacy_role_value && (
                                <CustomSelect.Option key={role.id} value={role.legacy_role_value}>
                                  <span className="flex items-center gap-1.5">
                                    {role.name}
                                    <SystemBadge />
                                  </span>
                                </CustomSelect.Option>
                              )
                          )
                        : // Graceful degradation while `GET /roles/` hasn't
                          // resolved yet (or failed) - same legacy options as
                          // before this feature.
                          Object.entries(ROLE).map(
                            ([key, roleLabel]) =>
                              currentWorkspaceRole &&
                              currentWorkspaceRole >= parseInt(key) && (
                                <CustomSelect.Option key={key} value={parseInt(key)}>
                                  {roleLabel}
                                </CustomSelect.Option>
                              )
                          )}
                    </CustomSelect>
                  );
                }}
              />
            </div>
            {fields.length > 1 && (
              <div className="flex-item flex w-6">
                <button
                  type="button"
                  className="place-items-center self-center rounded-sm"
                  onClick={() => remove(index)}
                >
                  <CloseIcon className="h-4 w-4 text-secondary" />
                </button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
