/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
import { Copy, Mail, RefreshCw, Slack, Trash2 } from "lucide-react";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Button, Loader, ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// components
import { SettingsHeading } from "@/components/settings/heading";
// hooks
import { useUserPermissions } from "@/hooks/store/user";
// services
import { IntakeChannelService, SlackChannelMappingService } from "@/services/inbox";
// local imports
import { SlackChannelMappingModal } from "./slack-mapping-modal";

const intakeChannelService = new IntakeChannelService();
const slackChannelMappingService = new SlackChannelMappingService();

const CHANNELS_KEY = (workspaceSlug: string, projectId: string) => `INTAKE_CHANNELS_${workspaceSlug}_${projectId}`;
const MAPPINGS_KEY = (workspaceSlug: string, projectId: string) =>
  `SLACK_CHANNEL_MAPPINGS_${workspaceSlug}_${projectId}`;

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const IntakeChannelsRoot = observer(function IntakeChannelsRoot(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { allowPermissions } = useUserPermissions();
  const isAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.PROJECT, workspaceSlug, projectId);
  const canView = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
  const [deleteChannelId, setDeleteChannelId] = useState<string | null>(null);
  const [deleteMappingId, setDeleteMappingId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isCreatingEmailChannel, setIsCreatingEmailChannel] = useState(false);
  const [regeneratingChannelId, setRegeneratingChannelId] = useState<string | null>(null);

  const { data: channels } = useSWR(
    canView ? CHANNELS_KEY(workspaceSlug, projectId) : null,
    canView ? () => intakeChannelService.list(workspaceSlug, projectId) : null
  );
  const { data: mappings } = useSWR(
    canView ? MAPPINGS_KEY(workspaceSlug, projectId) : null,
    canView ? () => slackChannelMappingService.list(workspaceSlug, projectId) : null
  );

  if (!canView) return null;

  const refreshChannels = () => mutate(CHANNELS_KEY(workspaceSlug, projectId));
  const refreshMappings = () => mutate(MAPPINGS_KEY(workspaceSlug, projectId));

  const emailChannel = channels?.find((channel) => channel.channel_type === "EMAIL") ?? null;

  const handleAddEmailChannel = async () => {
    setIsCreatingEmailChannel(true);
    try {
      await intakeChannelService.create(workspaceSlug, projectId, { channel_type: "EMAIL" });
      refreshChannels();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("intake_channels.settings.title"),
      });
    } finally {
      setIsCreatingEmailChannel(false);
    }
  };

  const handleToggleEmailChannel = async (channelId: string, isEnabled: boolean) => {
    try {
      await intakeChannelService.update(workspaceSlug, projectId, channelId, { is_enabled: isEnabled });
      refreshChannels();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("intake_channels.settings.title") });
    }
  };

  const handleCopyAddress = (address: string) => {
    copyTextToClipboard(address);
    setToast({ type: TOAST_TYPE.SUCCESS, title: t("toast.success"), message: t("intake_channels.email.copy_success") });
  };

  const handleRegenerateEmail = async (channelId: string) => {
    setRegeneratingChannelId(channelId);
    try {
      await intakeChannelService.regenerateEmail(workspaceSlug, projectId, channelId);
      refreshChannels();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("intake_channels.settings.title") });
    } finally {
      setRegeneratingChannelId(null);
    }
  };

  const handleDeleteEmailChannel = async () => {
    if (!deleteChannelId) return;
    setIsDeleting(true);
    try {
      await intakeChannelService.remove(workspaceSlug, projectId, deleteChannelId);
      refreshChannels();
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("intake_channels.settings.title") });
    } finally {
      setIsDeleting(false);
      setDeleteChannelId(null);
    }
  };

  const handleDeleteMapping = async () => {
    if (!deleteMappingId) return;
    setIsDeleting(true);
    try {
      await slackChannelMappingService.remove(workspaceSlug, projectId, deleteMappingId);
      refreshMappings();
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("slack_integration.toast.mapping_remove_success"),
      });
    } catch {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: t("intake_channels.settings.title") });
    } finally {
      setIsDeleting(false);
      setDeleteMappingId(null);
    }
  };

  const isLoading = !channels || !mappings;

  return (
    <section className="mt-7 w-full border-t border-subtle pt-7">
      <SettingsHeading
        title={t("intake_channels.settings.title")}
        description={t("intake_channels.settings.description")}
      />

      {isLoading && (
        <Loader className="mt-4 flex flex-col gap-2">
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      )}

      {!isLoading && (
        <div className="mt-4 flex flex-col gap-4">
          {/* Email channel */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-13 font-medium text-primary">
                <Mail className="h-3.5 w-3.5" />
                Email
              </div>
              {isAdmin && !emailChannel && (
                <Button
                  variant="neutral-primary"
                  size="sm"
                  onClick={handleAddEmailChannel}
                  loading={isCreatingEmailChannel}
                >
                  {t("intake_channels.email.add")}
                </Button>
              )}
            </div>
            {emailChannel && (
              <div className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2.5">
                <div className="flex items-center gap-2">
                  <ToggleSwitch
                    value={emailChannel.is_enabled}
                    onChange={() => handleToggleEmailChannel(emailChannel.id, !emailChannel.is_enabled)}
                    disabled={!isAdmin}
                  />
                  <div className="flex flex-col">
                    <span className="text-13 font-medium text-primary">
                      {emailChannel.email_alias?.full_address ?? "—"}
                    </span>
                    {!emailChannel.is_enabled && (
                      <span className="text-11 text-tertiary">{t("intake_channels.email.disabled_hint")}</span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        emailChannel.email_alias && handleCopyAddress(emailChannel.email_alias.full_address)
                      }
                      className="rounded-sm p-1 hover:bg-layer-1"
                      title={t("intake_channels.email.copy_address")}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerateEmail(emailChannel.id)}
                      disabled={regeneratingChannelId === emailChannel.id}
                      className="rounded-sm p-1 hover:bg-layer-1"
                      title={t("intake_channels.email.regenerate")}
                    >
                      <RefreshCw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeleteChannelId(emailChannel.id)}
                      className="rounded-sm p-1 hover:bg-layer-1"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )}
            {!emailChannel && <p className="text-13 text-tertiary">—</p>}
          </div>

          {/* Slack channel mappings */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-13 font-medium text-primary">
                <Slack className="h-3.5 w-3.5" />
                Slack
              </div>
              {isAdmin && (
                <Button variant="neutral-primary" size="sm" onClick={() => setIsMappingModalOpen(true)}>
                  {t("slack_integration.mappings.add")}
                </Button>
              )}
            </div>
            {mappings?.length === 0 && <p className="text-13 text-tertiary">—</p>}
            {mappings?.map((mapping) => (
              <div
                key={mapping.id}
                className="flex items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2.5"
              >
                <div className="flex flex-col">
                  <span className="text-13 font-medium text-primary">
                    {mapping.slack_channel_name || mapping.slack_channel_id}
                  </span>
                  <span className="text-11 text-tertiary">{mapping.notify_on.join(", ") || "—"}</span>
                </div>
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setDeleteMappingId(mapping.id)}
                    className="rounded-sm p-1 hover:bg-layer-1"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <SlackChannelMappingModal
        isOpen={isMappingModalOpen}
        handleClose={() => setIsMappingModalOpen(false)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        onSaved={refreshMappings}
      />

      <AlertModalCore
        isOpen={!!deleteChannelId}
        handleClose={() => setDeleteChannelId(null)}
        handleSubmit={handleDeleteEmailChannel}
        isSubmitting={isDeleting}
        title={t("intake_channels.delete_confirm.title")}
        content={t("intake_channels.delete_confirm.description")}
      />
      <AlertModalCore
        isOpen={!!deleteMappingId}
        handleClose={() => setDeleteMappingId(null)}
        handleSubmit={handleDeleteMapping}
        isSubmitting={isDeleting}
        title={t("intake_channels.delete_confirm.title")}
        content={t("intake_channels.delete_confirm.description")}
      />
    </section>
  );
});
