/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useRef, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useTheme } from "next-themes";
import useSWR from "swr";
import { ShieldCheck } from "lucide-react";
// plane internal packages
import { InstanceService } from "@plane/services";
import { setPromiseToast, setToast, TOAST_TYPE } from "@plane/propel/toast";
import type { TInstanceConfigurationKeys, TInstanceAuthenticationModes } from "@plane/types";
import { Loader, ToggleSwitch } from "@plane/ui";
import { cn, resolveGeneralTheme } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { AuthenticationMethodCard } from "@/components/authentication/authentication-method-card";
// helpers
import { canDisableAuthMethod } from "@/helpers/authentication";
import { getSamlConfigStatus } from "@/helpers/saml-config-status";
// hooks
import { useAuthenticationModes } from "@/hooks/oauth";
import { useInstance } from "@/hooks/store";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();

const InstanceAuthenticationPage = observer(function InstanceAuthenticationPage(_props: Route.ComponentProps) {
  // theme
  const { resolvedTheme: resolvedThemeAdmin } = useTheme();
  const resolvedTheme = resolveGeneralTheme(resolvedThemeAdmin);
  // Ref to store authentication modes for validation (avoids circular dependency)
  const authenticationModesRef = useRef<TInstanceAuthenticationModes[]>([]);
  // state
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  // store hooks
  const { fetchInstanceConfigurations, formattedConfig, updateInstanceConfigurations } = useInstance();
  // derived values
  const enableSignUpConfig = formattedConfig?.ENABLE_SIGNUP ?? "";
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 2 ("SCIM 2.0 natif"), exigence 3 - instance-
  // wide `ENABLE_SCIM` kill switch, defaulted off. A simple boolean toggle
  // (unlike SAML SSO above - SCIM has no per-configuration CRUD list, just
  // this one flag), following the exact same pattern as
  // `WorkspaceManagementPage`'s own `DISABLE_WORKSPACE_CREATION` toggle
  // (apps/admin/app/(all)/(dashboard)/workspace/page.tsx) - this app has no
  // generic config-schema-driven renderer, every god-mode surface hand-
  // builds its own toggle bound to a specific `formattedConfig` key.
  const enableScimConfig = formattedConfig?.ENABLE_SCIM ?? "";

  useSWR("INSTANCE_CONFIGURATIONS", () => fetchInstanceConfigurations());

  // Create updateConfig with validation - uses authenticationModesRef for current modes
  const updateConfig = useCallback(
    (key: TInstanceConfigurationKeys, value: string): void => {
      // Check if trying to disable (value === "0")
      if (value === "0") {
        // Check if this key is an authentication method key
        const currentAuthModes = authenticationModesRef.current;
        const isAuthMethodKey = currentAuthModes.some((method) => method.enabledConfigKey === key);

        // Only validate if this is an authentication method key
        if (isAuthMethodKey) {
          const canDisable = canDisableAuthMethod(key, currentAuthModes, formattedConfig);

          if (!canDisable) {
            setToast({
              type: TOAST_TYPE.ERROR,
              title: "Cannot disable authentication",
              message:
                "At least one authentication method must remain enabled. Please enable another method before disabling this one.",
            });
            return;
          }
        }
      }

      // Proceed with the update
      setIsSubmitting(true);

      const payload = {
        [key]: value,
      };

      const updateConfigPromise = updateInstanceConfigurations(payload);

      setPromiseToast(updateConfigPromise, {
        loading: "Saving configuration",
        success: {
          title: "Success",
          message: () => "Configuration saved successfully",
        },
        error: {
          title: "Error",
          message: () => "Failed to save configuration",
        },
      });

      void updateConfigPromise
        .then(() => {
          setIsSubmitting(false);
          return undefined;
        })
        .catch((err) => {
          console.error(err);
          setIsSubmitting(false);
        });
    },
    [formattedConfig, updateInstanceConfigurations]
  );

  // Get authentication modes - this will use updateConfig which includes validation
  const authenticationModes = useAuthenticationModes({
    disabled: isSubmitting,
    updateConfig,
    resolvedTheme,
  });

  // Update ref with latest authentication modes
  authenticationModesRef.current = authenticationModes;

  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 1 ("SSO SAML 2.0 natif"), exigence 1 - "le
  // god-mode expose une nouvelle section 'SSO SAML' dans les paramètres
  // d'authentification, au même niveau que les toggles Google/GitHub
  // existants." SAML doesn't fit the single on/off `AuthenticationMethodCard`
  // shape above (a config is a whole CRUD list, not one toggle key), so it
  // gets its own summary card below instead, linking through to the
  // dedicated list/create/edit pages.
  const { data: samlConfigs } = useSWR("INSTANCE_SAML_CONFIGURATIONS", () => instanceService.samlConfigurations());
  const activeSamlCount = samlConfigs?.filter((config) => getSamlConfigStatus(config) === "active").length ?? 0;
  const samlSummary =
    samlConfigs === undefined
      ? "Loading..."
      : samlConfigs.length === 0
        ? "No configuration yet."
        : `${samlConfigs.length} configuration${samlConfigs.length > 1 ? "s" : ""}, ${activeSamlCount} active.`;

  return (
    <PageWrapper
      header={{
        title: "Manage authentication modes for your instance",
        description: "Configure authentication modes for your team and restrict sign-ups to be invite only.",
      }}
    >
      {formattedConfig ? (
        <div className="space-y-3">
          <div className={cn("flex w-full items-center gap-14 rounded-sm")}>
            <div className="flex grow items-center gap-4">
              <div className="grow">
                <div className="pb-1 text-16 font-medium">Allow anyone to sign up even without an invite</div>
                <div className={cn("text-11 leading-5 font-regular text-tertiary")}>
                  Toggling this off will only let users sign up when they are invited.
                </div>
              </div>
            </div>
            <div className={`shrink-0 pr-4 ${isSubmitting && "opacity-70"}`}>
              <div className="flex items-center gap-4">
                <ToggleSwitch
                  value={Boolean(parseInt(enableSignUpConfig))}
                  onChange={() => {
                    if (Boolean(parseInt(enableSignUpConfig)) === true) {
                      updateConfig("ENABLE_SIGNUP", "0");
                    } else {
                      updateConfig("ENABLE_SIGNUP", "1");
                    }
                  }}
                  size="sm"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
          <div className="text-lg pt-6 font-medium">Available authentication modes</div>
          {authenticationModes.map((method) => (
            <AuthenticationMethodCard
              key={method.key}
              name={method.name}
              description={method.description}
              icon={method.icon}
              config={method.config}
              disabled={isSubmitting}
              unavailable={method.unavailable}
            />
          ))}

          <div className="text-lg pt-6 font-medium">SAML SSO</div>
          <Link href="/authentication/saml" className="block">
            <AuthenticationMethodCard
              name="SAML SSO"
              description={samlSummary}
              icon={<ShieldCheck className="h-6 w-6 p-0.5 text-tertiary" />}
              config={
                <span className="text-11 font-medium text-accent-primary">
                  {samlConfigs && samlConfigs.length > 0 ? "Manage" : "Configure"}
                </span>
              }
            />
          </Link>

          {/* Category 11, feature 2 ("SCIM 2.0 natif"), exigence 3 -
              instance-wide toggle, next to the SAML SSO / OAuth surfaces
              above. A workspace Owner/Admin still has to generate their own
              SCIM token from Workspace Settings > Security once this is on -
              this flag alone provisions nothing by itself. */}
          <div className="text-lg pt-6 font-medium">SCIM provisioning</div>
          <div className={cn("flex w-full items-center gap-14 rounded-sm")}>
            <div className="flex grow items-center gap-4">
              <div className="grow">
                <div className="pb-1 text-16 font-medium">Allow workspaces to provision members via SCIM</div>
                <div className={cn("text-11 leading-5 font-regular text-tertiary")}>
                  Lets a workspace Owner or Admin generate a SCIM 2.0 token and connect an identity provider (Okta,
                  Azure AD, Google Workspace) to automatically create, update, and deactivate members. Enabling this
                  instance-wide does not turn SCIM on for any workspace by itself - each workspace Owner/Admin still has
                  to generate their own token from Workspace Settings &gt; Security.
                </div>
              </div>
            </div>
            <div className={`shrink-0 pr-4 ${isSubmitting && "opacity-70"}`}>
              <div className="flex items-center gap-4">
                <ToggleSwitch
                  value={Boolean(parseInt(enableScimConfig))}
                  onChange={() => {
                    if (Boolean(parseInt(enableScimConfig)) === true) {
                      updateConfig("ENABLE_SCIM", "0");
                    } else {
                      updateConfig("ENABLE_SCIM", "1");
                    }
                  }}
                  size="sm"
                  disabled={isSubmitting}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Loader className="space-y-10">
          <Loader.Item height="50px" width="75%" />
          <Loader.Item height="50px" width="75%" />
          <Loader.Item height="50px" width="40%" />
          <Loader.Item height="50px" width="40%" />
          <Loader.Item height="50px" width="20%" />
        </Loader>
      )}
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Authentication Settings - Plane Web" }];

export default InstanceAuthenticationPage;
