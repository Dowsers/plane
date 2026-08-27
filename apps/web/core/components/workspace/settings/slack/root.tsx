/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useRouter, useSearchParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { CheckCircle2, XCircle } from "lucide-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { AlertModalCore, Button, Loader } from "@plane/ui";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
// services
import { SlackWorkspaceConnectionService } from "@/services/inbox";
// local imports
import { SlackConnectForm } from "./connect-form";

const slackWorkspaceConnectionService = new SlackWorkspaceConnectionService();

const CONNECTION_KEY = (workspaceSlug: string) => `SLACK_WORKSPACE_CONNECTION_${workspaceSlug}`;

type Props = {
  workspaceSlug: string;
};

export const SlackWorkspaceSettingsRoot = observer(function SlackWorkspaceSettingsRoot(props: Props) {
  const { workspaceSlug } = props;
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { config } = useInstance();

  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState(false);
  const [isDisconnecting, setIsDisconnecting] = useState(false);
  const [isExchangingOAuthCode, setIsExchangingOAuthCode] = useState(false);
  const oauthCodeHandled = useRef(false);

  const { data: connectionStatus, isLoading } = useSWR(CONNECTION_KEY(workspaceSlug), () =>
    slackWorkspaceConnectionService.retrieve(workspaceSlug)
  );

  const refresh = () => mutate(CONNECTION_KEY(workspaceSlug));

  // Exigence 6 - if this instance's own SLACK_REDIRECT_URI is pointed at
  // this exact settings page, Slack's OAuth redirect lands back here
  // with a `?code=...` query param - exchanged automatically on mount,
  // once, rather than requiring a separate dedicated callback route.
  useEffect(() => {
    const code = searchParams.get("code");
    if (!code || oauthCodeHandled.current) return;
    oauthCodeHandled.current = true;

    const exchangeCode = async () => {
      setIsExchangingOAuthCode(true);
      try {
        await slackWorkspaceConnectionService.connectWithOAuthCode(workspaceSlug, code);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("toast.success"),
          message: t("slack_integration.toast.connect_success"),
        });
        refresh();
      } catch (error: any) {
        setToast({
          type: TOAST_TYPE.ERROR,
          title: t("toast.error"),
          message: error?.error ?? t("slack_integration.toast.connect_error"),
        });
      } finally {
        setIsExchangingOAuthCode(false);
        router.replace(`/${workspaceSlug}/settings/slack`);
      }
    };

    void exchangeCode();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const handleDisconnect = async () => {
    setIsDisconnecting(true);
    try {
      await slackWorkspaceConnectionService.disconnect(workspaceSlug);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("toast.success"),
        message: t("slack_integration.toast.disconnect_success"),
      });
      refresh();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("toast.error"),
        message: t("slack_integration.toast.connect_error"),
      });
    } finally {
      setIsDisconnecting(false);
      setIsDisconnectModalOpen(false);
    }
  };

  const handleOAuthConnect = () => {
    if (!config?.slack_client_id) return;
    const redirectUri = `${window.location.origin}/${workspaceSlug}/settings/slack`;
    const scope = "chat:write,commands,channels:read,groups:read,app_mentions:read,reactions:write";
    const url = `https://slack.com/oauth/v2/authorize?client_id=${config.slack_client_id}&scope=${scope}&redirect_uri=${encodeURIComponent(redirectUri)}`;
    window.location.assign(url);
  };

  const isConnected = connectionStatus?.connected === true;

  if (isLoading || isExchangingOAuthCode) {
    return (
      <Loader className="mt-6 flex flex-col gap-2">
        <Loader.Item height="80px" />
      </Loader>
    );
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      <div className="flex items-center justify-between gap-2 rounded-md border border-subtle p-4">
        <div className="flex items-center gap-2">
          {isConnected ? (
            <CheckCircle2 className="h-4 w-4 text-success-primary" />
          ) : (
            <XCircle className="h-4 w-4 text-tertiary" />
          )}
          <div className="flex flex-col">
            <span className="text-14 font-medium text-primary">
              {isConnected
                ? connectionStatus.slack_team_name || t("slack_integration.status.connected")
                : t("slack_integration.status.not_connected")}
            </span>
            {isConnected && (
              <span className="text-11 text-tertiary">
                {connectionStatus.installation_method === "OAUTH" ? "OAuth" : "Manual bot token"}
              </span>
            )}
          </div>
        </div>
        {isConnected && (
          <Button variant="danger" size="sm" onClick={() => setIsDisconnectModalOpen(true)}>
            {t("slack_integration.disconnect")}
          </Button>
        )}
      </div>

      {!isConnected && (
        <div className="flex flex-col gap-4">
          {config?.slack_client_id && (
            <div className="flex flex-col gap-2 rounded-md border border-subtle p-4">
              <Button variant="primary" size="sm" className="w-fit" onClick={handleOAuthConnect}>
                {t("slack_integration.oauth_button")}
              </Button>
            </div>
          )}
          <SlackConnectForm workspaceSlug={workspaceSlug} onConnected={refresh} />
        </div>
      )}

      <AlertModalCore
        isOpen={isDisconnectModalOpen}
        handleClose={() => setIsDisconnectModalOpen(false)}
        handleSubmit={handleDisconnect}
        isSubmitting={isDisconnecting}
        title={t("slack_integration.disconnect_confirm.title")}
        content={t("slack_integration.disconnect_confirm.description")}
      />
    </div>
  );
});
