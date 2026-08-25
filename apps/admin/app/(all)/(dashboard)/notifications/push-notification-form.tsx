/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { useForm } from "react-hook-form";
import useSWR, { mutate } from "swr";
import { Copy, RefreshCw } from "lucide-react";
// plane imports
import { Button } from "@plane/propel/button";
import { InstanceService } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IFormattedInstanceConfiguration } from "@plane/types";
import { Loader, ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// components
import type { TControllerInputFormField } from "@/components/common/controller-input";
import { ControllerInput } from "@/components/common/controller-input";
// hooks
import { useInstance } from "@/hooks/store";

type Props = {
  config: IFormattedInstanceConfiguration;
};

type SecretFormValues = {
  vapid_admin_email: string;
  vapid_private_key: string;
};

const instanceService = new InstanceService();
const PUSH_CONFIG_SWR_KEY = "INSTANCE_PUSH_NOTIFICATION_CONFIG";

/**
 * Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
 * plane-selfhost), feature 3 - god-mode VAPID/kill-switch/test-push form.
 *
 * Two separate backing stores, both surfaced in one screen:
 * - `PUSH_NOTIFICATIONS_ENABLED` / `VAPID_PUBLIC_KEY` live on the generic
 *   `InstanceConfiguration` table (`config` prop, same
 *   `updateInstanceConfigurations` every other god-mode toggle in this app
 *   already uses) - neither is a secret.
 * - `vapid_admin_email`/`vapid_private_key` live on the dedicated,
 *   genuinely write-only `PushNotificationConfig` model, fetched here via
 *   a local `useSWR` (no mobx store - same precedent as this app's own
 *   SAML pages). `vapid_private_key` is NEVER returned by the API - the
 *   password field always starts blank and is only ever sent back to the
 *   server if the admin actually typed a new value.
 */
export function InstancePushNotificationForm(props: Props) {
  const { config } = props;
  const [isGenerating, setIsGenerating] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isTogglingKillSwitch, setIsTogglingKillSwitch] = useState(false);
  // store
  const { updateInstanceConfigurations, fetchInstanceConfigurations } = useInstance();

  const { data: pushConfig, isLoading: isPushConfigLoading } = useSWR(PUSH_CONFIG_SWR_KEY, () =>
    instanceService.getPushNotificationConfig()
  );

  const {
    handleSubmit,
    control,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<SecretFormValues>({
    values: { vapid_admin_email: pushConfig?.vapid_admin_email ?? "", vapid_private_key: "" },
  });

  const isKillSwitchEnabled = config["PUSH_NOTIFICATIONS_ENABLED"] === "1";
  const vapidPublicKey = config["VAPID_PUBLIC_KEY"];

  const secretFormFields: TControllerInputFormField[] = [
    {
      key: "vapid_admin_email",
      type: "text",
      label: "VAPID contact email",
      description: "The contact address Web Push services may use to reach you about this VAPID key. Not a secret.",
      placeholder: "admin@example.com",
      error: Boolean(errors.vapid_admin_email),
      required: false,
    },
    {
      key: "vapid_private_key",
      type: "password",
      label: "VAPID private key",
      description: pushConfig?.is_vapid_configured
        ? "A VAPID private key is already configured. Leave this blank to keep it, or paste a new one to replace it."
        : "Generate a keypair below, or paste an externally-generated VAPID private key here.",
      placeholder: pushConfig?.is_vapid_configured ? "••••••••••••••••" : "Paste a VAPID private key",
      error: Boolean(errors.vapid_private_key),
      required: false,
    },
  ];

  const handleToggleKillSwitch = async (value: boolean) => {
    setIsTogglingKillSwitch(true);
    try {
      await updateInstanceConfigurations({ PUSH_NOTIFICATIONS_ENABLED: value ? "1" : "0" });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: `Push notifications ${value ? "enabled" : "disabled"} for this instance`,
      });
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Failed to update the push notification kill switch",
      });
    } finally {
      setIsTogglingKillSwitch(false);
    }
  };

  const handleGenerateVapidKeys = async () => {
    setIsGenerating(true);
    try {
      await instanceService.generateVapidKeys();
      await Promise.all([fetchInstanceConfigurations(), mutate(PUSH_CONFIG_SWR_KEY)]);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "A new VAPID keypair was generated. Every previously subscribed browser will need to re-subscribe.",
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to generate a VAPID keypair" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCopyPublicKey = () => {
    if (!vapidPublicKey) return;
    copyTextToClipboard(vapidPublicKey);
    setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "VAPID public key copied to clipboard" });
  };

  const handleSendTest = async () => {
    setIsTesting(true);
    try {
      // Only ever resolves for a 2xx response - `PushNotificationTestEndpoint`
      // returns HTTP 400 (caught below) whenever `success` would be
      // `false` (no VAPID key configured, no active subscription, or
      // every subscribed browser's send failed), never a 200 with
      // `success: false`.
      const result = await instanceService.sendTestPushNotification();
      const successCount = result.results.filter((item) => item.success).length;
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Test sent",
        message: `Delivered to ${successCount}/${result.results.length} of your subscribed browser(s).`,
      });
    } catch (error: unknown) {
      const err = error as { error?: string; results?: { success: boolean }[] };
      const message =
        err?.error ??
        (err?.results
          ? "The test push failed on every one of your subscribed browsers. Check your VAPID configuration."
          : "Failed to send a test push notification.");
      setToast({ type: TOAST_TYPE.ERROR, title: "Test failed", message });
    } finally {
      setIsTesting(false);
    }
  };

  const onSubmitSecrets = async (formData: SecretFormValues) => {
    const payload: Record<string, string> = {};
    // Non-secret - safe to always include, even blank (clears the contact
    // email if the admin removes it).
    payload.vapid_admin_email = formData.vapid_admin_email;
    // Secret - only include if the admin actually typed a new value; an
    // empty string here would otherwise blank out an already-configured
    // key (`PushNotificationConfigEndpoint.patch` only touches keys
    // PRESENT in the request body).
    if (formData.vapid_private_key) payload.vapid_private_key = formData.vapid_private_key;

    try {
      const updated = await instanceService.updatePushNotificationConfig(payload);
      mutate(PUSH_CONFIG_SWR_KEY, updated, false);
      reset({ vapid_admin_email: updated.vapid_admin_email ?? "", vapid_private_key: "" });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success",
        message: "Push notification settings updated successfully",
      });
    } catch (_error) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error", message: "Failed to update push notification settings" });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex max-w-4xl items-center justify-between gap-4 rounded-md border border-subtle px-4 py-3">
        <div>
          <div className="text-13 font-medium text-primary">Push notifications enabled</div>
          <div className="text-11 text-tertiary">
            Instance-wide kill switch. Off by default - members' own preferences have no effect while this is off.
          </div>
        </div>
        <ToggleSwitch value={isKillSwitchEnabled} onChange={handleToggleKillSwitch} disabled={isTogglingKillSwitch} />
      </div>

      <div className="space-y-3">
        <div>
          <div className="pb-1 text-18 font-medium text-primary">VAPID (Web Push)</div>
          <div className="text-13 font-regular text-tertiary">
            Required for browsers to receive push notifications from this instance.
          </div>
        </div>

        <div className="flex flex-col gap-1">
          <h4 className="text-13 text-tertiary">VAPID public key</h4>
          <div className="flex max-w-xl items-center gap-2">
            <code className="w-full truncate rounded-md border border-subtle bg-layer-1 px-3 py-2 text-12 text-secondary">
              {vapidPublicKey || "Not generated yet"}
            </code>
            {vapidPublicKey && (
              <button
                type="button"
                onClick={handleCopyPublicKey}
                className="shrink-0 rounded-md border border-subtle p-2 text-tertiary hover:bg-layer-2"
              >
                <Copy className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {isPushConfigLoading ? (
          <Loader className="space-y-4">
            <Loader.Item height="50px" width="75%" />
            <Loader.Item height="50px" width="75%" />
          </Loader>
        ) : (
          <div className="grid-col grid w-full max-w-4xl grid-cols-1 items-start justify-between gap-10 lg:grid-cols-2">
            {secretFormFields.map((field) => (
              <ControllerInput
                key={field.key}
                control={control}
                type={field.type}
                name={field.key}
                label={field.label}
                description={field.description}
                placeholder={field.placeholder}
                error={field.error}
                required={field.required}
              />
            ))}
          </div>
        )}

        <div className="flex max-w-4xl items-center gap-4 py-1">
          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit(onSubmitSecrets)}
            loading={isSubmitting}
            disabled={!isDirty}
          >
            {isSubmitting ? "Saving" : "Save changes"}
          </Button>
          <Button
            variant="secondary"
            size="lg"
            prependIcon={<RefreshCw className="size-3.5" />}
            onClick={handleGenerateVapidKeys}
            loading={isGenerating}
          >
            Generate VAPID keys
          </Button>
          <Button variant="secondary" size="lg" onClick={handleSendTest} loading={isTesting}>
            Send test notification
          </Button>
        </div>
      </div>
    </div>
  );
}
