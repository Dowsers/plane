/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import Link from "next/link";
import useSWR from "swr";
import { Plus, ShieldCheck } from "lucide-react";
// plane imports
import { InstanceService } from "@plane/services";
import { getButtonStyling } from "@plane/propel/button";
import { Loader } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// helpers
import { SAML_CONFIG_STATUS_LABELS, getSamlConfigStatus } from "@/helpers/saml-config-status";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - god-mode
 * Authentication > SAML SSO: lists every `InstanceSAMLConfiguration` with
 * its derived status. Instance-admin-only by construction - every
 * `(dashboard)` page in this app is already behind the admin session
 * check in the shared dashboard layout, and the backend endpoints
 * themselves are instance-admin-only regardless (decision #6).
 */
const InstanceSAMLListPage = observer(function InstanceSAMLListPage(_props: Route.ComponentProps) {
  const { data: configs, isLoading } = useSWR("INSTANCE_SAML_CONFIGURATIONS", () =>
    instanceService.samlConfigurations()
  );

  return (
    <PageWrapper
      header={{
        title: "SAML SSO",
        description:
          "Configure one or more SAML 2.0 identity providers, each bound to a verified email domain, for SSO login and just-in-time provisioning.",
        actions: (
          <Link href="/authentication/saml/create" className={getButtonStyling("primary", "sm")}>
            <Plus className="size-3.5" />
            Add configuration
          </Link>
        ),
      }}
    >
      {isLoading ? (
        <Loader className="space-y-3">
          <Loader.Item height="56px" />
          <Loader.Item height="56px" />
        </Loader>
      ) : (configs?.length ?? 0) === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-subtle bg-layer-2 px-6 py-12 text-center">
          <ShieldCheck className="size-8 text-placeholder" />
          <div className="text-16 font-medium text-primary">No SAML configuration yet</div>
          <div className="max-w-md text-13 text-tertiary">
            Add a configuration to let members of a verified email domain sign in through your organization&apos;s
            identity provider (Okta, Azure AD, Google Workspace, ...).
          </div>
          <Link href="/authentication/saml/create" className={getButtonStyling("secondary", "sm")}>
            Add configuration
          </Link>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {configs?.map((config) => {
            const status = getSamlConfigStatus(config);
            return (
              <Link
                key={config.id}
                href={`/authentication/saml/${config.id}`}
                className="flex items-center gap-4 rounded-lg border border-subtle bg-layer-2 px-4 py-3 transition-colors hover:bg-layer-3"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-layer-1">
                  <ShieldCheck className="size-5 text-tertiary" />
                </div>
                <div className="grow">
                  <div className="text-13 leading-5 font-medium text-primary">{config.name}</div>
                  <div className="text-11 leading-5 font-regular text-tertiary">{config.idp_entity_id}</div>
                </div>
                <SAMLStatusPill status={status} />
              </Link>
            );
          })}
        </div>
      )}
    </PageWrapper>
  );
});

function SAMLStatusPill({ status }: { status: ReturnType<typeof getSamlConfigStatus> }) {
  const toneClassName =
    status === "active"
      ? "bg-success-subtle text-success-primary"
      : status === "domain_unverified"
        ? "bg-warning-subtle text-warning-primary"
        : "bg-surface-2 text-tertiary";
  return (
    <span className={`shrink-0 rounded-sm px-2 py-0.5 text-11 font-medium ${toneClassName}`}>
      {SAML_CONFIG_STATUS_LABELS[status]}
    </span>
  );
}

export const meta: Route.MetaFunction = () => [{ title: "SAML SSO - God Mode" }];

export default InstanceSAMLListPage;
