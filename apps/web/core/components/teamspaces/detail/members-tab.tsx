/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR from "swr";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Avatar } from "@plane/ui";
import { getFileURL } from "@plane/utils";
// components
import { MemberDropdown } from "@/components/dropdowns/member/dropdown";
// hooks
import { useMember } from "@/hooks/store/use-member";
import { useTeamspace } from "@/hooks/store/use-teamspace";
// local imports
import { TEAMSPACE_LEAD, TEAMSPACE_MEMBER } from "../constants";

type Props = {
  teamspaceId: string;
  canModify: boolean;
};

export const TeamspaceMembersTab = observer(function TeamspaceMembersTab(props: Props) {
  const { teamspaceId, canModify } = props;
  const { workspaceSlug } = useParams();
  const { t } = useTranslation();
  const { getTeamspaceMembersById, fetchTeamspaceDetails, addTeamspaceMember, removeTeamspaceMember } = useTeamspace();
  const {
    workspace: { workspaceMemberIds },
  } = useMember();

  const [addMemberId, setAddMemberId] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useSWR(
    workspaceSlug ? ["TEAMSPACE_MEMBERS", workspaceSlug, teamspaceId] : null,
    workspaceSlug ? () => fetchTeamspaceDetails(workspaceSlug.toString(), teamspaceId) : null,
    { revalidateOnFocus: false }
  );

  const members = getTeamspaceMembersById(teamspaceId);
  const memberUserIds = new Set(members.map((member) => member.member));
  const availableMemberIds = (workspaceMemberIds ?? []).filter((id) => !memberUserIds.has(id));
  const leadCount = members.filter((member) => member.role === TEAMSPACE_LEAD).length;

  const handleAdd = async (userId: string | null) => {
    if (!workspaceSlug || !userId) return;
    setAddMemberId(userId);
    try {
      await addTeamspaceMember(workspaceSlug.toString(), teamspaceId, { member: userId, role: TEAMSPACE_MEMBER });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setAddMemberId(null);
    }
  };

  const handleRemove = async (memberId: string, role: number) => {
    if (!workspaceSlug) return;
    // Spec section 1, exigence 4 - a teamspace must always keep at least
    // one Lead; the backend also enforces this, but the UI should not even
    // offer removing the last remaining Lead.
    if (role === TEAMSPACE_LEAD && leadCount <= 1) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("teamspaces.members_panel.last_lead_error"),
      });
      return;
    }
    setIsSubmitting(true);
    try {
      await removeTeamspaceMember(workspaceSlug.toString(), teamspaceId, memberId);
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("teamspaces.toast.error") });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {canModify && (
        <div className="flex items-center gap-2">
          <MemberDropdown
            memberIds={availableMemberIds}
            multiple={false}
            value={addMemberId}
            onChange={handleAdd}
            placeholder={t("teamspaces.members_panel.add_member")}
            buttonVariant="border-with-text"
            buttonContainerClassName="w-full max-w-sm"
            showUserDetails
          />
        </div>
      )}

      <div className="flex flex-col gap-2">
        {members.map((member) => (
          <div
            key={member.id}
            className="flex items-center justify-between gap-3 rounded-md border-[0.5px] border-subtle p-3"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar src={getFileURL(member.member_avatar ?? "")} name={member.member_display_name} size="sm" />
              <div className="flex min-w-0 flex-col">
                <span className="truncate text-13 font-medium">{member.member_display_name}</span>
                <span className="truncate text-11 text-secondary">{member.member_email}</span>
              </div>
            </div>
            <div className="flex flex-shrink-0 items-center gap-3">
              <span className="rounded-full bg-layer-2 px-2 py-0.5 text-11 text-secondary">
                {member.role === TEAMSPACE_LEAD
                  ? t("teamspaces.members_panel.lead")
                  : t("teamspaces.members_panel.member")}
              </span>
              {canModify && (
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleRemove(member.id, member.role)}
                  className="disabled:opacity-50"
                >
                  <X className="h-4 w-4 text-tertiary hover:text-danger-primary" />
                </button>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
});
