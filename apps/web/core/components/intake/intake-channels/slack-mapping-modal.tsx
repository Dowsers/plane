/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { X } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSlackNotifyEvent } from "@plane/types";
import { Button, Checkbox, EModalPosition, EModalWidth, Input, ModalCore } from "@plane/ui";
// services
import { SlackChannelMappingService, SlackWorkspaceConnectionService } from "@/services/inbox";

const slackChannelMappingService = new SlackChannelMappingService();
const slackWorkspaceConnectionService = new SlackWorkspaceConnectionService();

// Mirrors SLACK_NOTIFY_EVENT_CHOICES (apps/api/plane/db/models/intake_channel.py).
const NOTIFY_EVENT_OPTIONS: TSlackNotifyEvent[] = [
  "issue_created",
  "issue_status_changed",
  "issue_assigned",
  "comment_added",
  "issue_closed",
];

type Props = {
  isOpen: boolean;
  handleClose: () => void;
  workspaceSlug: string;
  projectId: string;
  onSaved: () => void;
};

/**
 * 14d ("Intake Email and Slack", levee du squelette, section 3, exigence
 * 7) - the spec's own text mentions a `conversations_list` proxy for a
 * live channel picker, but no such endpoint is actually registered
 * anywhere in apps/api/plane/app/urls (`plane.utils.slack_client.
 * conversations_list` exists as a client function only, never wired to a
 * view) - and section 3's own "Considerations API/UX" endpoint list
 * explicitly says no new backend endpoint is required for this section.
 * Rather than add one (out of the stated scope), the channel ID is a
 * manual text field - an admin copies it from Slack (right-click a
 * channel > View channel details > channel ID at the bottom). Documented
 * scope decision, not an oversight.
 */
export const SlackChannelMappingModal = observer(function SlackChannelMappingModal(props: Props) {
  const { isOpen, handleClose, workspaceSlug, projectId, onSaved } = props;
  const { t } = useTranslation();

  const [channelId, setChannelId] = useState("");
  const [channelName, setChannelName] = useState("");
  const [notifyOn, setNotifyOn] = useState<TSlackNotifyEvent[]>([...NOTIFY_EVENT_OPTIONS]);
  const [isSaving, setIsSaving] = useState(false);

  const { data: connectionStatus } = useSWR(
    isOpen ? `SLACK_CONNECTION_STATUS_${workspaceSlug}` : null,
    isOpen ? () => slackWorkspaceConnectionService.retrieve(workspaceSlug) : null
  );

  useEffect(() => {
    if (!isOpen) {
      setChannelId("");
      setChannelName("");
      setNotifyOn([...NOTIFY_EVENT_OPTIONS]);
    }
  }, [isOpen]);

  const toggleNotifyOn = (event: TSlackNotifyEvent) => {
    setNotifyOn((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]));
  };

  const handleSave = async () => {
    if (!channelId.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: t("toast.error"), message: "Slack channel ID is required." });
      return;
    }

    setIsSaving(true);
    try {
      await slackChannelMappingService.create(workspaceSlug, projectId, {
        slack_channel_id: channelId.trim(),
        slack_channel_name: channelName.trim(),
        notify_on: notifyOn,
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("slack_integration.toast.mapping_add_success"),
      });
      onSaved();
      handleClose();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? "Unable to add the mapping.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const hasConnection = connectionStatus?.connected === true;

  return (
    <ModalCore isOpen={isOpen} handleClose={handleClose} position={EModalPosition.TOP} width={EModalWidth.XL}>
      <div className="flex max-h-[85vh] flex-col gap-4 overflow-y-auto py-5">
        <div className="flex items-center justify-between px-5">
          <h4 className="text-18 font-medium text-primary">{t("slack_integration.mappings.add")}</h4>
          <button onClick={handleClose}>
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-5">
          {!hasConnection && connectionStatus !== undefined && (
            <p className="rounded-md bg-layer-1 p-2.5 text-13 text-tertiary">
              {t("intake_channels.slack.no_connection")}
            </p>
          )}
          <Input
            id="slack-mapping-channel-id"
            name="slack-mapping-channel-id"
            type="text"
            placeholder={t("slack_integration.mappings.channel_id_label")}
            value={channelId}
            onChange={(e) => setChannelId(e.target.value)}
            inputSize="sm"
            disabled={!hasConnection}
          />
          <Input
            id="slack-mapping-channel-name"
            name="slack-mapping-channel-name"
            type="text"
            placeholder={t("slack_integration.mappings.channel_name_label")}
            value={channelName}
            onChange={(e) => setChannelName(e.target.value)}
            inputSize="sm"
            disabled={!hasConnection}
          />
          <div className="flex flex-col gap-1.5">
            <p className="text-13 text-secondary">{t("slack_integration.mappings.notify_on_label")}</p>
            {NOTIFY_EVENT_OPTIONS.map((event) => (
              <label
                key={event}
                htmlFor={`notify-on-${event}`}
                className="flex items-center gap-1.5 text-13 text-secondary"
              >
                <Checkbox
                  id={`notify-on-${event}`}
                  checked={notifyOn.includes(event)}
                  onChange={() => toggleNotifyOn(event)}
                  disabled={!hasConnection}
                />
                {event}
              </label>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-subtle px-5 pt-4">
          <Button variant="neutral-primary" size="sm" onClick={handleClose} disabled={isSaving}>
            {t("cancel")}
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} loading={isSaving} disabled={!hasConnection}>
            {t("save")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
