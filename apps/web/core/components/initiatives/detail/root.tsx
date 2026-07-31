/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Fragment, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { Tab } from "@headlessui/react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInitiativeStatus, TInitiativeWritePayload } from "@plane/types";
import { CustomSelect, Loader, TextArea } from "@plane/ui";
import { cn } from "@plane/utils";
// hooks
import { useInitiative } from "@/hooks/store/use-initiative";
import { useMember } from "@/hooks/store/use-member";
import { useUserPermissions } from "@/hooks/store/user";
// local imports
import { HealthPicker } from "../health-picker";
import { InitiativeQuickActions } from "../quick-actions";
import { InitiativeActivityTab } from "./activity-tab";
import { InitiativeProjectsTab } from "./projects-tab";

const STATUS_OPTIONS: { key: string; label: string }[] = [
  { key: "PROPOSED", label: "Proposed" },
  { key: "PLANNED", label: "Planned" },
  { key: "ACTIVE", label: "Active" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELED", label: "Canceled" },
];

type Props = {
  initiativeId: string;
};

export const InitiativeDetailRoot = observer(function InitiativeDetailRoot(props: Props) {
  const { initiativeId } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const { getUserDetails } = useMember();
  const { getInitiativeById, fetchInitiativeDetails, updateInitiative } = useInitiative();

  const [description, setDescription] = useState<string | null>(null);

  const { isLoading } = useSWR(
    workspaceSlug ? ["INITIATIVE_DETAILS", workspaceSlug, initiativeId] : null,
    workspaceSlug ? () => fetchInitiativeDetails(workspaceSlug.toString(), initiativeId) : null,
    { revalidateOnFocus: false }
  );

  const initiative = getInitiativeById(initiativeId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE);
  const isLead = !!initiative?.lead_id;
  const canModify = isWorkspaceAdmin || isLead;
  const lead = initiative?.lead_id ? getUserDetails(initiative.lead_id) : undefined;

  if (isLoading && !initiative) {
    return (
      <Loader className="flex flex-col gap-3">
        <Loader.Item height="40px" />
        <Loader.Item height="200px" />
      </Loader>
    );
  }

  if (!initiative || !workspaceSlug) return null;

  const handleFieldChange = async (payload: TInitiativeWritePayload) => {
    try {
      await updateInitiative(workspaceSlug.toString(), initiativeId, payload);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("initiatives.toast.error") });
    }
  };

  const handleDescriptionBlur = () => {
    if (description !== null && description !== initiative.description) {
      handleFieldChange({ description });
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-20 font-semibold">{initiative.name}</h2>
        <InitiativeQuickActions initiative={initiative} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <CustomSelect
          value={initiative.status}
          onChange={(val: TInitiativeStatus) => handleFieldChange({ status: val })}
          disabled={!canModify}
          label={STATUS_OPTIONS.find((s) => s.key === initiative.status)?.label ?? initiative.status}
          buttonClassName="!border-subtle !shadow-none rounded-md font-medium"
          input
        >
          {STATUS_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.key} value={option.key}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>

        <HealthPicker value={initiative.health} onChange={() => undefined} disabled />

        {lead && (
          <span className="text-13 text-secondary">
            {t("initiatives.lead")}: {lead.display_name}
          </span>
        )}
      </div>

      <Tab.Group as={Fragment}>
        <Tab.List as="div" className="flex items-center gap-4 border-b border-subtle">
          {["overview", "projects", "activity"].map((key) => (
            <Tab
              key={key}
              className={({ selected }) =>
                cn("border-b-2 border-transparent px-1 pb-2 text-13 font-medium text-secondary focus:outline-none", {
                  "border-accent-primary text-primary": selected,
                })
              }
            >
              {t(`initiatives.${key === "overview" ? "label" : key}`)}
            </Tab>
          ))}
        </Tab.List>
        <Tab.Panels as={Fragment}>
          <Tab.Panel as="div" className="pt-4">
            <TextArea
              value={description ?? initiative.description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={handleDescriptionBlur}
              disabled={!canModify}
              placeholder={t("initiatives.description")}
              className="w-full"
              rows={6}
            />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <InitiativeProjectsTab initiativeId={initiativeId} canModify={canModify} />
          </Tab.Panel>
          <Tab.Panel as="div" className="pt-4">
            <InitiativeActivityTab initiativeId={initiativeId} />
          </Tab.Panel>
        </Tab.Panels>
      </Tab.Group>
    </div>
  );
});
