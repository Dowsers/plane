/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
import { EAuthModes, EAuthSteps } from "@plane/constants";
import type { IEmailCheckData, TSAMLDiscoverResponse } from "@plane/types";
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import { authErrorHandler } from "@/helpers/authentication.helper";
// hooks
import { useInstance } from "@/hooks/store/use-instance";
import { useAppRouter } from "@/hooks/use-app-router";
// services
import { AuthService } from "@/services/auth.service";
// local components
import { AuthEmailForm } from "./email";
import { AuthPasswordForm } from "./password";
import { AuthUniqueCodeForm } from "./unique-code";

type TAuthFormRoot = {
  authStep: EAuthSteps;
  authMode: EAuthModes;
  email: string;
  setEmail: (email: string) => void;
  setAuthMode: (authMode: EAuthModes) => void;
  setAuthStep: (authStep: EAuthSteps) => void;
  setErrorInfo: (errorInfo: TAuthErrorInfo | undefined) => void;
  currentAuthMode: EAuthModes;
  /** Category 11 (docs/feature-specs/11-admin-security-sso.md in
   * plane-selfhost), feature 1 ("SSO SAML 2.0 natif") - reports the
   * `/auth/saml/discover/` result for the just-submitted email back up to
   * `AuthRoot`, which owns whether to show the normal OAuth/password/OTP
   * UI or the SAML-only "Continue with {IdP}" button. */
  onSsoDiscovered: (info: TSAMLDiscoverResponse | null) => void;
};

const authService = new AuthService();

export const AuthFormRoot = observer(function AuthFormRoot(props: TAuthFormRoot) {
  const {
    authStep,
    authMode,
    email,
    setEmail,
    setAuthMode,
    setAuthStep,
    setErrorInfo,
    currentAuthMode,
    onSsoDiscovered,
  } = props;
  // router
  const router = useAppRouter();
  // query params
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next_path");
  // states
  const [isExistingEmail, setIsExistingEmail] = useState(false);
  // hooks
  const { config } = useInstance();

  const isSMTPConfigured = config?.is_smtp_configured || false;

  // submit handler- email verification
  const handleEmailVerification = async (data: IEmailCheckData) => {
    setEmail(data.email);
    setErrorInfo(undefined);

    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), feature 1 ("SSO SAML 2.0 natif"), exigence 6 - check
    // SAML routing BEFORE the normal email-check flow: if the domain is
    // covered by an active SAML configuration, short-circuit straight to
    // the "Continue with {IdP}" UI instead of ever asking for a password
    // or OTP. Fails open on a network/server hiccup on this check alone -
    // SSO discovery is a UX nicety here, not the real enforcement (that
    // happens server-side, at actual login time, for every credential
    // provider alike - see `Adapter.complete_login_or_signup`).
    try {
      const ssoInfo = await authService.discoverSAML(data.email);
      onSsoDiscovered(ssoInfo.sso_applies ? ssoInfo : null);
      if (ssoInfo.sso_applies) return;
    } catch (error) {
      console.error(error);
      onSsoDiscovered(null);
    }

    await authService
      .emailCheck(data)
      .then(async (response) => {
        if (response.existing) {
          if (currentAuthMode === EAuthModes.SIGN_UP) setAuthMode(EAuthModes.SIGN_IN);
          if (response.status === "MAGIC_CODE") {
            setAuthStep(EAuthSteps.UNIQUE_CODE);
            generateEmailUniqueCode(data.email).catch(() => {});
          } else if (response.status === "CREDENTIAL") {
            setAuthStep(EAuthSteps.PASSWORD);
          }
        } else {
          if (currentAuthMode === EAuthModes.SIGN_IN) setAuthMode(EAuthModes.SIGN_UP);
          if (response.status === "MAGIC_CODE") {
            setAuthStep(EAuthSteps.UNIQUE_CODE);
            generateEmailUniqueCode(data.email).catch(() => {});
          } else if (response.status === "CREDENTIAL") {
            setAuthStep(EAuthSteps.PASSWORD);
          }
        }
        setIsExistingEmail(response.existing);
        return;
      })
      .catch((error) => {
        const errorhandler = authErrorHandler(error?.error_code?.toString(), data?.email || undefined);
        if (errorhandler?.type) setErrorInfo(errorhandler);
      });
  };

  const handleEmailClear = () => {
    setAuthMode(currentAuthMode);
    setErrorInfo(undefined);
    setEmail("");
    setAuthStep(EAuthSteps.EMAIL);
    router.push(currentAuthMode === EAuthModes.SIGN_IN ? `/` : "/sign-up");
  };

  // generating the unique code
  const generateEmailUniqueCode = async (targetEmail: string): Promise<{ code: string } | undefined> => {
    if (!isSMTPConfigured) return;
    const payload = { email: targetEmail };
    return await authService
      .generateUniqueCode(payload)
      .then(() => ({ code: "" }))
      .catch((error) => {
        const errorhandler = authErrorHandler(error?.error_code?.toString());
        if (errorhandler?.type) setErrorInfo(errorhandler);
        throw error;
      });
  };

  if (authStep === EAuthSteps.EMAIL) {
    return <AuthEmailForm defaultEmail={email} onSubmit={handleEmailVerification} />;
  }
  if (authStep === EAuthSteps.UNIQUE_CODE) {
    return (
      <AuthUniqueCodeForm
        mode={authMode}
        email={email}
        isExistingEmail={isExistingEmail}
        handleEmailClear={handleEmailClear}
        generateEmailUniqueCode={generateEmailUniqueCode}
        nextPath={nextPath || undefined}
      />
    );
  }
  if (authStep === EAuthSteps.PASSWORD) {
    return (
      <AuthPasswordForm
        mode={authMode}
        isSMTPConfigured={isSMTPConfigured}
        email={email}
        handleEmailClear={handleEmailClear}
        handleAuthStep={(step: EAuthSteps) => {
          if (step === EAuthSteps.UNIQUE_CODE) generateEmailUniqueCode(email).catch(() => {});
          setAuthStep(step);
        }}
        nextPath={nextPath || undefined}
      />
    );
  }

  return <></>;
});
