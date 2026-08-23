/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
// plane imports
import { InstanceService } from "@plane/services";
import { Button, getButtonStyling } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TInstanceSAMLConfigurationCreatePayload, TSAMLSignatureAlgorithm } from "@plane/types";
import { CustomSelect } from "@plane/ui";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
import { LabeledInput, Section } from "@/components/authentication/saml-form-fields";
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

const DEFAULT_DRAFT: TDraft = {
  name: "",
  idp_entity_id: "",
  idp_sso_url: "",
  idp_slo_url: "",
  idp_certificate: "",
  metadata_url: "",
  signature_algorithm: "rsa-sha256",
  clock_skew_tolerance_seconds: "180",
  attribute_email: "email",
  attribute_first_name: "first_name",
  attribute_last_name: "last_name",
};

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - step 1 of the
 * spec's own suggested 3-step wizard ("métadonnées IdP -> vérification de
 * domaine -> mapping d'attributs + test"). Built as a single scrollable
 * form (all three conceptual sections visible at once, incl. attribute
 * mapping) rather than a literal multi-step wizard component: this app
 * has no existing multi-step-wizard primitive anywhere, every other
 * god-mode config surface (Google/GitHub/GitLab/Gitea, security policy)
 * is a single form, and a config genuinely needs to exist (this page's
 * own POST) before a domain can be attached to it at all - so "domain
 * verification" can only ever be a SEPARATE page/step in practice
 * (`../[configId]`), not a literal wizard step here. This page therefore
 * only covers IdP metadata + attribute mapping; domain verification and
 * "test connection" live on the edit page once the config exists.
 */
const CreateInstanceSAMLConfigurationPage = observer(function CreateInstanceSAMLConfigurationPage(
  _props: Route.ComponentProps
) {
  const router = useRouter();
  const [draft, setDraft] = useState<TDraft>(DEFAULT_DRAFT);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const update = (patch: Partial<TDraft>) => setDraft((prev) => ({ ...prev, ...patch }));

  const isValid =
    draft.name.trim().length > 0 &&
    draft.idp_entity_id.trim().length > 0 &&
    draft.idp_sso_url.trim().length > 0 &&
    draft.idp_certificate.trim().length > 0 &&
    draft.attribute_email.trim().length > 0;

  const handleSubmit = async () => {
    if (!isValid) return;
    setIsSubmitting(true);
    const payload: TInstanceSAMLConfigurationCreatePayload = {
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
    };
    try {
      const created = await instanceService.createSamlConfiguration(payload);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "SAML configuration created",
        message: "Add and verify a domain, then enable this configuration.",
      });
      router.push(`/authentication/saml/${created.id}`);
    } catch (error: unknown) {
      const err = error as { error?: string } & Record<string, string[] | undefined>;
      const firstFieldError = Object.values(err ?? {}).find((v) => Array.isArray(v) && v.length > 0)?.[0];
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Could not create SAML configuration",
        message: err?.error ?? firstFieldError ?? "Something went wrong. Please try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <PageWrapper
      header={{
        title: "Add SAML configuration",
        description: "Enter the identity provider's metadata. You can add and verify a domain on the next screen.",
      }}
    >
      <div className="mx-auto flex max-w-2xl flex-col gap-8">
        <Section title="Identity" description="How this configuration is identified in god-mode and by the SP.">
          <LabeledInput
            label="Display name"
            required
            value={draft.name}
            onChange={(value) => update({ name: value })}
            placeholder="Okta - Acme Corp"
          />
        </Section>

        <Section title="Identity provider metadata" description="Provided by your IdP (Okta, Azure AD, ...).">
          <LabeledInput
            label="IdP Entity ID"
            required
            value={draft.idp_entity_id}
            onChange={(value) => update({ idp_entity_id: value })}
            placeholder="https://idp.example.com/entity"
          />
          <LabeledInput
            label="IdP SSO URL"
            required
            value={draft.idp_sso_url}
            onChange={(value) => update({ idp_sso_url: value })}
            placeholder="https://idp.example.com/sso"
          />
          <LabeledInput
            label="IdP SLO URL (optional)"
            value={draft.idp_slo_url}
            onChange={(value) => update({ idp_slo_url: value })}
            placeholder="https://idp.example.com/slo"
          />
          <LabeledInput
            label="IdP metadata URL (optional)"
            value={draft.metadata_url}
            onChange={(value) => update({ metadata_url: value })}
            placeholder="https://idp.example.com/metadata"
          />
          <div className="flex flex-col gap-1">
            <label className="text-13 font-medium text-tertiary" htmlFor="idp_certificate">
              IdP X.509 certificate (PEM) <span className="text-danger-primary">*</span>
            </label>
            <textarea
              id="idp_certificate"
              value={draft.idp_certificate}
              onChange={(e) => update({ idp_certificate: e.target.value })}
              placeholder="-----BEGIN CERTIFICATE-----&#10;...&#10;-----END CERTIFICATE-----"
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

        <div className="flex items-center gap-3">
          <Button variant="primary" size="lg" onClick={handleSubmit} disabled={!isValid} loading={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create configuration"}
          </Button>
          <Link href="/authentication/saml" className={getButtonStyling("secondary", "lg")}>
            Cancel
          </Link>
        </div>
      </div>
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Add SAML Configuration - God Mode" }];

export default CreateInstanceSAMLConfigurationPage;
