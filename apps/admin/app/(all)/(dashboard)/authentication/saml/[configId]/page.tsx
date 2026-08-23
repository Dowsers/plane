/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import useSWR from "swr";
import { Plus } from "lucide-react";
// plane imports
import { InstanceService } from "@plane/services";
import { CopyIcon } from "@plane/propel/icons";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TSAMLSignatureAlgorithm, TSAMLVerifiedDomain } from "@plane/types";
import { AlertModalCore, CustomSelect, Input, Loader, ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard, dnsTxtRecordValue, renderFormattedDate } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { LabeledInput, Section } from "@/components/authentication/saml-form-fields";
// helpers
import { SAML_CONFIG_STATUS_LABELS, getSamlConfigStatus } from "@/helpers/saml-config-status";
import {
  readAndClearSamlTestConnectionResult,
  rememberPendingSamlTestConnection,
} from "@/helpers/saml-test-connection";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();

const SIGNATURE_ALGORITHM_OPTIONS: { value: TSAMLSignatureAlgorithm; label: string }[] = [
  { value: "rsa-sha256", label: "RSA-SHA256 (recommended)" },
  { value: "rsa-sha384", label: "RSA-SHA384" },
  { value: "rsa-sha512", label: "RSA-SHA512" },
];

type TDraft = {
  name: string;
  idp_entity_id: string;
  idp_sso_url: string;
  idp_slo_url: string;
  idp_certificate: string;
  metadata_url: string;
  signature_algorithm: TSAMLSignatureAlgorithm;
  clock_skew_tolerance_seconds: string;
  attribute_email: string;
  attribute_first_name: string;
  attribute_last_name: string;
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - edit page: covers
 * the remaining two conceptual steps of the spec's own suggested wizard
 * (domain + DNS TXT verification, and "test connection") on top of the
 * same metadata/attribute-mapping fields from the create page - see that
 * page's own docstring for why this isn't a literal wizard component.
 */
const InstanceSAMLConfigurationDetailPage = observer(function InstanceSAMLConfigurationDetailPage(
  props: Route.ComponentProps
) {
  const { configId } = props.params;
  const router = useRouter();

  const {
    data: config,
    isLoading,
    mutate,
  } = useSWR(configId ? ["INSTANCE_SAML_CONFIGURATION", configId] : null, () =>
    instanceService.getSamlConfiguration(configId)
  );

  const [draft, setDraft] = useState<TDraft | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);
  const [isTogglingEnforce, setIsTogglingEnforce] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isTestingConnection, setIsTestingConnection] = useState(false);
  const [newDomain, setNewDomain] = useState("");
  const [isAddingDomain, setIsAddingDomain] = useState(false);
  const [verifyingDomainId, setVerifyingDomainId] = useState<string | null>(null);

  // Sync the editable draft from the fetched value - only while not
  // mid-save, matching this category's own `SecurityPolicyPanel`
  // precedent, so a save-in-flight round trip never clobbers a mid-edit.
  useEffect(() => {
    if (config && !isSaving) {
      setDraft({
        name: config.name,
        idp_entity_id: config.idp_entity_id,
        idp_sso_url: config.idp_sso_url,
        idp_slo_url: config.idp_slo_url ?? "",
        idp_certificate: config.idp_certificate,
        metadata_url: config.metadata_url ?? "",
        signature_algorithm: config.signature_algorithm,
        clock_skew_tolerance_seconds: String(config.clock_skew_tolerance_seconds),
        attribute_email: config.attribute_mapping.email ?? "",
        attribute_first_name: config.attribute_mapping.first_name ?? "",
        attribute_last_name: config.attribute_mapping.last_name ?? "",
      });
    }
  }, [config, isSaving]);

  // Exigence 13 - report the result of a test-connection round trip
  // stashed by `(home)/layout.tsx` before this page even had a chance to
  // mount (the ACS test-mode branch always redirects to the bare admin
  // root first - see `@/helpers/saml-test-connection`'s own docstring).
  useEffect(() => {
    const rawQuery = readAndClearSamlTestConnectionResult();
    if (!rawQuery) return;
    const params = new URLSearchParams(rawQuery);
    if (params.get("saml_test_result") === "success") {
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Test connection succeeded",
        message: `Valid assertion received for ${params.get("saml_test_email") || "the test identity"}.`,
      });
    } else if (params.get("saml_test_result") === "error") {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Test connection failed",
        message: params.get("saml_test_detail") || "The IdP response could not be validated. Check server logs.",
      });
    }
    // Only ever meant to run once, right after mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isDirty = useMemo(() => {
    if (!draft || !config) return false;
    return (
      draft.name !== config.name ||
      draft.idp_entity_id !== config.idp_entity_id ||
      draft.idp_sso_url !== config.idp_sso_url ||
      draft.idp_slo_url !== (config.idp_slo_url ?? "") ||
      draft.idp_certificate !== config.idp_certificate ||
      draft.metadata_url !== (config.metadata_url ?? "") ||
      draft.signature_algorithm !== config.signature_algorithm ||
      draft.clock_skew_tolerance_seconds !== String(config.clock_skew_tolerance_seconds) ||
      draft.attribute_email !== (config.attribute_mapping.email ?? "") ||
      draft.attribute_first_name !== (config.attribute_mapping.first_name ?? "") ||
      draft.attribute_last_name !== (config.attribute_mapping.last_name ?? "")
    );
  }, [draft, config]);

  const update = (patch: Partial<TDraft>) => setDraft((prev) => (prev ? { ...prev, ...patch } : prev));

  const handleSave = async () => {
    if (!draft || !config) return;
    setIsSaving(true);
    try {
      const updated = await instanceService.updateSamlConfiguration(config.id, {
        name: draft.name.trim(),
        idp_entity_id: draft.idp_entity_id.trim(),
        idp_sso_url: draft.idp_sso_url.trim(),
        idp_slo_url: draft.idp_slo_url.trim() || null,
        idp_certificate: draft.idp_certificate.trim(),
        metadata_url: draft.metadata_url.trim() || null,
        signature_algorithm: draft.signature_algorithm,
        clock_skew_tolerance_seconds: Number(draft.clock_skew_tolerance_seconds) || 180,
        attribute_mapping: {
          email: draft.attribute_email.trim(),
          first_name: draft.attribute_first_name.trim() || undefined,
          last_name: draft.attribute_last_name.trim() || undefined,
        },
      });
      await mutate(updated, false);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Saved", message: "SAML configuration updated." });
    } catch (error: unknown) {
      const err = error as { error?: string } & Record<string, string[] | undefined>;
      const firstFieldError = Object.values(err ?? {}).find((v) => Array.isArray(v) && v.length > 0)?.[0];
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not save",
        message: err?.error ?? firstFieldError ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleToggleEnabled = async () => {
    if (!config) return;
    setIsTogglingEnabled(true);
    try {
      const updated = await instanceService.updateSamlConfiguration(config.id, { is_enabled: !config.is_enabled });
      await mutate(updated, false);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: updated.is_enabled ? "Configuration enabled" : "Configuration disabled",
        message: updated.is_enabled
          ? "Members of a verified domain can now sign in via this IdP."
          : "This domain falls back to the instance's default authentication methods immediately.",
      });
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not update",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handleToggleEnforce = async () => {
    if (!config) return;
    setIsTogglingEnforce(true);
    try {
      const updated = await instanceService.updateSamlConfiguration(config.id, { enforce_sso: !config.enforce_sso });
      await mutate(updated, false);
    } catch (error: unknown) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not update",
        message: err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsTogglingEnforce(false);
    }
  };

  const handleDelete = async () => {
    if (!config) return;
    setIsDeleting(true);
    try {
      await instanceService.deleteSamlConfiguration(config.id);
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Deleted", message: "SAML configuration removed." });
      router.push("/authentication/saml");
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not delete",
        message: "Something went wrong. Please try again.",
      });
      setIsDeleting(false);
    }
  };

  const handleAddDomain = async () => {
    if (!config || !newDomain.trim()) return;
    setIsAddingDomain(true);
    try {
      const domain = await instanceService.addSamlDomain(config.id, { domain: newDomain.trim() });
      await mutate((prev) => (prev ? { ...prev, domains: [domain, ...prev.domains] } : prev), false);
      setNewDomain("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Domain added",
        message: 'Publish the DNS TXT record below, then hit "Verify now".',
      });
    } catch (error: unknown) {
      const err = error as { error?: string; domain?: string[] };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not add domain",
        message: err?.error ?? err?.domain?.[0] ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsAddingDomain(false);
    }
  };

  const handleVerifyDomain = async (domain: TSAMLVerifiedDomain) => {
    if (!config) return;
    setVerifyingDomainId(domain.id);
    try {
      const result = await instanceService.verifySamlDomain(config.id, domain.id);
      if (result.is_verified) {
        setToast({ type: TOAST_TYPE.SUCCESS, title: "Domain verified", message: result.detail });
      } else {
        setToast({ type: TOAST_TYPE.ERROR, title: "Verification failed", message: result.detail });
      }
      await mutate();
    } catch (error: unknown) {
      const err = error as { detail?: string; error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Verification failed",
        message: err?.detail ?? err?.error ?? "Something went wrong. Please try again.",
      });
    } finally {
      setVerifyingDomainId(null);
    }
  };

  const handleTestConnection = async () => {
    if (!config) return;
    setIsTestingConnection(true);
    try {
      const { redirect_url } = await instanceService.testSamlConnection(config.id);
      rememberPendingSamlTestConnection(config.id);
      // Real browser navigation to the IdP - not a fetch. The result
      // comes back later via the ACS endpoint's own redirect, handled by
      // `(home)/layout.tsx` + this page's own mount effect above.
      window.location.assign(redirect_url);
    } catch (_error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not start test connection",
        message: "Could not build a signed AuthnRequest for this configuration. Check server logs.",
      });
      setIsTestingConnection(false);
    }
  };

  const copy = (value: string) => {
    copyTextToClipboard(value).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Copied to clipboard." })
    );
  };

  if (isLoading || !config || !draft) {
    return (
      <PageWrapper header={{ title: "SAML configuration", description: "Loading..." }}>
        <Loader className="space-y-8">
          <Loader.Item height="50px" width="50%" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
          <Loader.Item height="50px" />
        </Loader>
      </PageWrapper>
    );
  }

  const status = getSamlConfigStatus(config);
  const hasVerifiedDomain = config.domains.some((domain) => domain.is_verified);

  return (
    <PageWrapper
      header={{
        title: config.name,
        description: `Status: ${SAML_CONFIG_STATUS_LABELS[status]}`,
        actions: (
          <Link href="/authentication/saml" className={getButtonStyling("secondary", "sm")}>
            Back to list
          </Link>
        ),
      }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <Section title="Enablement" description="Controls whether this IdP is actually used for login.">
          <div className="flex items-center justify-between rounded-lg border border-subtle bg-layer-2 px-4 py-3">
            <div>
              <div className="text-13 font-medium text-primary">Enabled</div>
              <div className="text-11 text-tertiary">
                {hasVerifiedDomain
                  ? "Members of a verified domain below can sign in via this IdP."
                  : "Requires at least one verified domain before it can be turned on."}
              </div>
            </div>
            <ToggleSwitch
              value={config.is_enabled}
              onChange={handleToggleEnabled}
              disabled={isTogglingEnabled || (!config.is_enabled && !hasVerifiedDomain)}
              size="sm"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-subtle bg-layer-2 px-4 py-3">
            <div>
              <div className="text-13 font-medium text-primary">Enforce SSO for this domain</div>
              <div className="text-11 text-tertiary">
                Blocks email/password, magic-link, and every OAuth provider for members of this configuration&apos;s
                domain(s) - only this IdP may be used.
              </div>
            </div>
            <ToggleSwitch
              value={config.enforce_sso}
              onChange={handleToggleEnforce}
              disabled={isTogglingEnforce}
              size="sm"
            />
          </div>
        </Section>

        <Section title="Service provider metadata" description="Give this to your IdP administrator.">
          <div className="flex flex-col gap-2">
            <span className="text-13 font-medium text-tertiary">SP Entity ID</span>
            <button
              type="button"
              onClick={() => copy(config.sp_entity_id)}
              className="flex items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-2 px-3 py-2 text-left text-13"
            >
              <span className="truncate">{config.sp_entity_id}</span>
              <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
            </button>
          </div>
        </Section>

        <Section
          title="Verified domains"
          description="A domain must be verified before this configuration can be enabled."
        >
          <div className="flex items-center gap-2">
            <Input
              type="text"
              value={newDomain}
              onChange={(e) => setNewDomain(e.target.value)}
              placeholder="example.com"
              className="w-full"
              autoComplete="off"
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={handleAddDomain}
              disabled={!newDomain.trim()}
              loading={isAddingDomain}
            >
              <Plus className="size-3.5" />
              Add
            </Button>
          </div>

          {config.domains.length === 0 ? (
            <p className="text-13 text-tertiary">No domain added yet.</p>
          ) : (
            <div className="flex flex-col gap-3">
              {config.domains.map((domain) => (
                <div
                  key={domain.id}
                  className="flex flex-col gap-2 rounded-lg border border-subtle bg-layer-2 px-4 py-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="text-13 font-medium text-primary">{domain.domain}</div>
                    <span
                      className={`rounded-sm px-2 py-0.5 text-11 ${
                        domain.is_verified
                          ? "bg-success-subtle text-success-primary"
                          : "bg-warning-subtle text-warning-primary"
                      }`}
                    >
                      {domain.is_verified ? `Verified ${renderFormattedDate(domain.verified_at ?? "")}` : "Pending"}
                    </span>
                  </div>
                  {!domain.is_verified && (
                    <>
                      <div className="text-11 text-tertiary">
                        Add the following TXT record on your domain&apos;s DNS, then hit &quot;Verify now&quot;.
                      </div>
                      <div className="flex items-center gap-2 text-11">
                        <code className="rounded-md border border-subtle bg-layer-1 px-2 py-1">TXT</code>
                        <code className="rounded-md border border-subtle bg-layer-1 px-2 py-1">{domain.domain}</code>
                        <button
                          type="button"
                          onClick={() => copy(dnsTxtRecordValue(domain.verification_token))}
                          className="flex flex-1 items-center justify-between gap-2 truncate rounded-md border border-subtle bg-layer-1 px-2 py-1 text-left"
                        >
                          <span className="truncate">{dnsTxtRecordValue(domain.verification_token)}</span>
                          <CopyIcon className="size-3.5 shrink-0 text-placeholder" />
                        </button>
                      </div>
                      <div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => handleVerifyDomain(domain)}
                          loading={verifyingDomainId === domain.id}
                        >
                          Verify now
                        </Button>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Identity provider metadata" description="Provided by your IdP (Okta, Azure AD, ...).">
          <LabeledInput
            label="Display name"
            required
            value={draft.name}
            onChange={(value) => update({ name: value })}
          />
          <LabeledInput
            label="IdP Entity ID"
            required
            value={draft.idp_entity_id}
            onChange={(value) => update({ idp_entity_id: value })}
          />
          <LabeledInput
            label="IdP SSO URL"
            required
            value={draft.idp_sso_url}
            onChange={(value) => update({ idp_sso_url: value })}
          />
          <LabeledInput
            label="IdP SLO URL (optional)"
            value={draft.idp_slo_url}
            onChange={(value) => update({ idp_slo_url: value })}
          />
          <LabeledInput
            label="IdP metadata URL (optional)"
            value={draft.metadata_url}
            onChange={(value) => update({ metadata_url: value })}
          />
          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-tertiary" htmlFor="idp_certificate_edit">
              IdP X.509 certificate (PEM) <span className="text-danger-primary">*</span>
            </label>
            <textarea
              id="idp_certificate_edit"
              value={draft.idp_certificate}
              onChange={(e) => update({ idp_certificate: e.target.value })}
              rows={6}
              className="font-mono w-full rounded-md border border-subtle bg-surface-1 px-3 py-2 text-12 text-primary placeholder:text-placeholder"
            />
          </div>
        </Section>

        <Section title="Security" description="Signature algorithm and assertion clock-skew tolerance.">
          <div className="flex flex-col gap-1">
            <span className="text-13 font-medium text-tertiary">Signature algorithm</span>
            <CustomSelect
              value={draft.signature_algorithm}
              onChange={(value: TSAMLSignatureAlgorithm) => update({ signature_algorithm: value })}
              label={
                SIGNATURE_ALGORITHM_OPTIONS.find((option) => option.value === draft.signature_algorithm)?.label ??
                draft.signature_algorithm
              }
              buttonClassName="border border-subtle bg-layer-2 w-full"
            >
              {SIGNATURE_ALGORITHM_OPTIONS.map((option) => (
                <CustomSelect.Option key={option.value} value={option.value}>
                  {option.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
          <LabeledInput
            label="Clock skew tolerance (seconds)"
            type="number"
            value={draft.clock_skew_tolerance_seconds}
            onChange={(value) => update({ clock_skew_tolerance_seconds: value })}
          />
        </Section>

        <Section
          title="Attribute mapping"
          description="Names of the SAML attributes your IdP emits (Name or FriendlyName)."
        >
          <LabeledInput
            label="Email attribute"
            required
            value={draft.attribute_email}
            onChange={(value) => update({ attribute_email: value })}
          />
          <LabeledInput
            label="First name attribute (optional)"
            value={draft.attribute_first_name}
            onChange={(value) => update({ attribute_first_name: value })}
          />
          <LabeledInput
            label="Last name attribute (optional)"
            value={draft.attribute_last_name}
            onChange={(value) => update({ attribute_last_name: value })}
          />
        </Section>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="primary" size="lg" onClick={handleSave} disabled={!isDirty} loading={isSaving}>
              {isSaving ? "Saving..." : "Save changes"}
            </Button>
            <Button variant="secondary" size="lg" onClick={handleTestConnection} loading={isTestingConnection}>
              Test connection
            </Button>
          </div>
          <Button variant="error-outline" size="lg" onClick={() => setIsDeleteModalOpen(true)}>
            Delete configuration
          </Button>
        </div>
      </div>

      <AlertModalCore
        isOpen={isDeleteModalOpen}
        handleClose={() => setIsDeleteModalOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        title="Delete SAML configuration"
        content="This permanently deletes this configuration and every domain attached to it. Members of those domains immediately fall back to the instance's default authentication methods. This cannot be undone."
      />
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "SAML Configuration - God Mode" }];

export default InstanceSAMLConfigurationDetailPage;
