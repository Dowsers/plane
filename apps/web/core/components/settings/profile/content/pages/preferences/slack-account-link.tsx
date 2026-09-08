/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import useSWR, { mutate } from "swr";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, CustomSelect, Input, Loader } from "@plane/ui";
// hooks
import { useWorkspace } from "@/hooks/store/use-workspace";
import { useUserSettings } from "@/hooks/store/user";
// services
import { SlackUserConnectionService } from "@/services/inbox";

const slackUserConnectionService = new SlackUserConnectionService();

const LINK_STATUS_KEY = (workspaceSlug: string) => `SLACK_USER_LINK_STATUS_${workspaceSlug}`;

/**
 * 14d ("Intake Email and Slack", levee du squelette, section 3, exigence
 * 8) - lives under account-level Profile Settings
 * (`/settings/profile/preferences`, no `:workspaceSlug` in the URL), so
 * this needs its own workspace picker exactly like
 * `PermissionsProfileSettings` (content/pages/permissions.tsx) does for
 * the same structural reason - `useWorkspace().currentWorkspace` is
 * derived from the URL and is always null here.
 *
 * Linking itself is a two-step flow, both already real on the backend:
 * 1. `/plane link` in Slack generates a short-lived code
 *    (SlackSlashCommandEndpoint, apps/api/plane/space/views/intake_channel.py).
 * 2. The signed-in Plane user pastes that code here, which POSTs it to
 *    `SlackUserLinkVerifyEndpoint` to complete the link. There is no
 *    "generate a code from Plane's own UI" path - Slack's own slash
 *    command is where the code originates, since the account being
 *    linked is a SLACK identity, not a Plane one - so this UI is a code
 *    INPUT, not a code display, despite this file living next to the
 *    (differently-shaped) code-display flow on the Slack side.
 */
export const SlackAccountLinkSettings = observer(function SlackAccountLinkSettings() {
  const { t } = useTranslation();
  const { workspaces } = useWorkspace();
  const { data: userSettings } = useUserSettings();

  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  const [isUnlinking, setIsUnlinking] = useState(false);

  const workspaceList = useMemo(() => Object.values(workspaces ?? {}), [workspaces]);

  useEffect(() => {
    if (selectedSlug || workspaceList.length === 0) return;
    const preferredSlug =
      userSettings?.workspace?.last_workspace_slug ?? userSettings?.workspace?.fallback_workspace_slug;
    const preferredWorkspace = workspaceList.find((workspace) => workspace.slug === preferredSlug);
    setSelectedSlug(preferredWorkspace?.slug ?? workspaceList[0].slug);
  }, [workspaceList, userSettings, selectedSlug]);

  const { data: linkStatus, isLoading } = useSWR(
    selectedSlug ? LINK_STATUS_KEY(selectedSlug) : null,
    selectedSlug ? () => slackUserConnectionService.retrieve(selectedSlug) : null
  );

  const refresh = () => selectedSlug && mutate(LINK_STATUS_KEY(selectedSlug));

  const handleVerify = async () => {
    if (!selectedSlug || !code.trim()) return;
    setIsVerifying(true);
    try {
      await slackUserConnectionService.verify(selectedSlug, code.trim());
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("account_settings.slack_account_link.toast.verify_success"),
      });
      setCode("");
      refresh();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("account_settings.slack_account_link.toast.verify_error"),
      });
    } finally {
      setIsVerifying(false);
    }
  };

  const handleUnlink = async () => {
    if (!selectedSlug) return;
    setIsUnlinking(true);
    try {
      await slackUserConnectionService.unlink(selectedSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("account_settings.slack_account_link.toast.unlink_success"),
      });
      refresh();
    } finally {
      setIsUnlinking(false);
    }
  };

  if (workspaceList.length === 0) {
    return (
      <section className="flex flex-col gap-y-3">
        <div className="text-h6-medium text-primary">{t("account_settings.slack_account_link.heading")}</div>
        <p className="text-body-xs-regular text-tertiary">{t("account_settings.slack_account_link.no_workspace")}</p>
      </section>
    );
  }

  const isLinked = linkStatus?.linked === true;

  return (
    <section className="flex flex-col gap-y-3">
      <div className="flex flex-col gap-y-1">
        <div className="text-h6-medium text-primary">{t("account_settings.slack_account_link.heading")}</div>
        <p className="text-body-xs-regular text-tertiary">{t("account_settings.slack_account_link.description")}</p>
      </div>

      {workspaceList.length > 1 && selectedSlug && (
        <div className="flex items-center gap-2">
          <span className="text-body-xs-medium text-secondary">Workspace</span>
          <CustomSelect
            value={selectedSlug}
            onChange={(value: string) => setSelectedSlug(value)}
            label={workspaceList.find((workspace) => workspace.slug === selectedSlug)?.name}
            buttonClassName="border border-subtle bg-layer-2"
          >
            {workspaceList.map((workspace) => (
              <CustomSelect.Option key={workspace.id} value={workspace.slug}>
                {workspace.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </div>
      )}

      {!selectedSlug || isLoading ? (
        <Loader className="flex flex-col gap-2">
          <Loader.Item height="40px" />
        </Loader>
      ) : isLinked ? (
        <div className="flex items-center justify-between gap-2 rounded-md border border-subtle p-3">
          <span className="text-body-xs-regular text-secondary">
            {t("account_settings.slack_account_link.linked_as", {
              name: linkStatus.slack_user_display_name || linkStatus.slack_user_id,
            })}
          </span>
          <Button variant="danger" size="sm" onClick={handleUnlink} loading={isUnlinking}>
            {t("account_settings.slack_account_link.unlink")}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-md border border-subtle p-3">
          <p className="text-body-xs-regular text-tertiary">{t("account_settings.slack_account_link.instructions")}</p>
          <code className="w-fit rounded bg-layer-1 px-2 py-1 text-13">/plane link</code>
          <div className="mt-2 flex flex-col gap-1.5">
            <span className="text-body-xs-medium text-secondary">
              {t("account_settings.slack_account_link.verify_label")}
            </span>
            <div className="flex items-center gap-2">
              <Input
                id="slack-account-link-code"
                name="slack-account-link-code"
                type="text"
                placeholder={t("account_settings.slack_account_link.verify_placeholder")}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                inputSize="sm"
                className="w-40"
              />
              <Button variant="primary" size="sm" onClick={handleVerify} loading={isVerifying}>
                {t("account_settings.slack_account_link.verify_submit")}
              </Button>
            </div>
            <span className="text-11 text-tertiary">{t("account_settings.slack_account_link.code_expires")}</span>
          </div>
        </div>
      )}
    </section>
  );
});
