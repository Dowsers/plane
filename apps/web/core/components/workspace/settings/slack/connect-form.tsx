/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Button, Input } from "@plane/ui";
// services
import { SlackWorkspaceConnectionService } from "@/services/inbox";

const slackWorkspaceConnectionService = new SlackWorkspaceConnectionService();

type Props = {
  workspaceSlug: string;
  onConnected: () => void;
};

/**
 * 14d ("Intake Email and Slack", levee du squelette, section 3, exigence
 * 5) - manual bot-token connection form. The token/secret are submitted
 * once and never redisplayed - `SlackWorkspaceConnectionSerializer` on
 * the backend has `read_only_fields = fields` and never returns them
 * (apps/api/plane/app/serializers/intake_channel.py), and this form
 * clears its own local state on success so nothing lingers in React
 * state either.
 */
export const SlackConnectForm = observer(function SlackConnectForm(props: Props) {
  const { workspaceSlug, onConnected } = props;
  const { t } = useTranslation();

  const [botToken, setBotToken] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    if (!botToken.trim() || !signingSecret.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: "Both the bot token and signing secret are required.",
      });
      return;
    }

    setIsConnecting(true);
    try {
      await slackWorkspaceConnectionService.connectWithBotToken(workspaceSlug, {
        bot_access_token: botToken.trim(),
        signing_secret: signingSecret.trim(),
      });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("slack_integration.toast.connect_success"),
      });
      setBotToken("");
      setSigningSecret("");
      onConnected();
    } catch (error: any) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: error?.error ?? t("slack_integration.toast.connect_error"),
      });
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
      <div className="flex flex-col gap-1">
        <h5 className="text-14 font-medium text-primary">{t("slack_integration.connect_form.title")}</h5>
        <p className="text-13 text-tertiary">{t("slack_integration.connect_form.description")}</p>
      </div>
      <div className="flex flex-col gap-2">
        <Input
          type="password"
          placeholder={t("slack_integration.connect_form.bot_token_label")}
          value={botToken}
          onChange={(e) => setBotToken(e.target.value)}
          inputSize="sm"
          autoComplete="off"
        />
        <Input
          type="password"
          placeholder={t("slack_integration.connect_form.signing_secret_label")}
          value={signingSecret}
          onChange={(e) => setSigningSecret(e.target.value)}
          inputSize="sm"
          autoComplete="off"
        />
      </div>
      <div>
        <Button variant="primary" size="sm" onClick={handleConnect} loading={isConnecting}>
          {t("slack_integration.connect_form.submit")}
        </Button>
      </div>
    </div>
  );
});
