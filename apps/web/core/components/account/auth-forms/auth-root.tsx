/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useSearchParams } from "next/navigation";
// plane imports
import type { TSAMLDiscoverResponse } from "@plane/types";
import { OAuthOptions } from "@plane/ui";
// helpers
import type { TAuthErrorInfo } from "@/helpers/authentication.helper";
import {
  EAuthModes,
  EAuthSteps,
  EAuthenticationErrorCodes,
  EErrorAlertType,
  authErrorHandler,
} from "@/helpers/authentication.helper";
// hooks
import { useOAuthConfig } from "@/hooks/oauth";
import { useInstance } from "@/hooks/store/use-instance";
// local imports
import { TermsAndConditions } from "../terms-and-conditions";
import { AuthBanner } from "./auth-banner";
import { AuthHeader, AuthHeaderBase } from "./auth-header";
import { AuthFormRoot } from "./form-root";
import { SAMLContinueForm } from "./saml-continue";

type TAuthRoot = {
  authMode: EAuthModes;
};

export const AuthRoot = observer(function AuthRoot(props: TAuthRoot) {
  //router
  const searchParams = useSearchParams();
  // query params
  const emailParam = searchParams.get("email");
  const invitation_id = searchParams.get("invitation_id");
  const workspaceSlug = searchParams.get("slug");
  const error_code = searchParams.get("error_code");
  const nextPath = searchParams.get("next_path");
  // props
  const { authMode: currentAuthMode } = props;
  // states
  const [authMode, setAuthMode] = useState<EAuthModes | undefined>(undefined);
  const [authStep, setAuthStep] = useState<EAuthSteps>(EAuthSteps.EMAIL);
  const [email, setEmail] = useState(emailParam ? emailParam.toString() : "");
  const [errorInfo, setErrorInfo] = useState<TAuthErrorInfo | undefined>(undefined);
  // Category 11 (docs/feature-specs/11-admin-security-sso.md in
  // plane-selfhost), feature 1 ("SSO SAML 2.0 natif"), exigence 6 - result
  // of `POST /auth/saml/discover/` for the currently entered email, set by
  // `AuthFormRoot` right after email submit (before it would otherwise
  // move on to the password/unique-code step). While `sso_applies` is
  // true, OAuth options and the normal email/password/OTP form are both
  // hidden in favor of `SAMLContinueForm` below - `authStep` itself is
  // deliberately left at `EAuthSteps.EMAIL` throughout (discovery short-
  // circuits before any `setAuthStep` call), so clearing this state alone
  // is enough to fall back to the normal email step.
  const [ssoDiscovery, setSsoDiscovery] = useState<TSAMLDiscoverResponse | null>(null);
  // store hooks
  const { config } = useInstance();
  // derived values
  const oAuthActionText = authMode === EAuthModes.SIGN_UP ? "Sign up" : "Sign in";
  const { isOAuthEnabled, oAuthOptions } = useOAuthConfig(oAuthActionText);
  const isEmailBasedAuthEnabled = config?.is_email_password_enabled || config?.is_magic_login_enabled;
  const noAuthMethodsAvailable = !isOAuthEnabled && !isEmailBasedAuthEnabled;

  useEffect(() => {
    if (!authMode && currentAuthMode) setAuthMode(currentAuthMode);
  }, [currentAuthMode, authMode]);

  useEffect(() => {
    if (error_code && authMode) {
      const errorhandler = authErrorHandler(error_code?.toString() as EAuthenticationErrorCodes);
      if (errorhandler) {
        // password error handler
        if ([EAuthenticationErrorCodes.AUTHENTICATION_FAILED_SIGN_UP].includes(errorhandler.code)) {
          setAuthMode(EAuthModes.SIGN_UP);
          setAuthStep(EAuthSteps.PASSWORD);
        }
        if ([EAuthenticationErrorCodes.AUTHENTICATION_FAILED_SIGN_IN].includes(errorhandler.code)) {
          setAuthMode(EAuthModes.SIGN_IN);
          setAuthStep(EAuthSteps.PASSWORD);
        }
        // magic_code error handler
        if (
          [
            EAuthenticationErrorCodes.INVALID_MAGIC_CODE_SIGN_UP,
            EAuthenticationErrorCodes.INVALID_EMAIL_MAGIC_SIGN_UP,
            EAuthenticationErrorCodes.EXPIRED_MAGIC_CODE_SIGN_UP,
            EAuthenticationErrorCodes.EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_UP,
          ].includes(errorhandler.code)
        ) {
          setAuthMode(EAuthModes.SIGN_UP);
          setAuthStep(EAuthSteps.UNIQUE_CODE);
        }
        if (
          [
            EAuthenticationErrorCodes.INVALID_MAGIC_CODE_SIGN_IN,
            EAuthenticationErrorCodes.INVALID_EMAIL_MAGIC_SIGN_IN,
            EAuthenticationErrorCodes.EXPIRED_MAGIC_CODE_SIGN_IN,
            EAuthenticationErrorCodes.EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_IN,
          ].includes(errorhandler.code)
        ) {
          setAuthMode(EAuthModes.SIGN_IN);
          setAuthStep(EAuthSteps.UNIQUE_CODE);
        }

        setErrorInfo(errorhandler);
      }
    }
  }, [error_code, authMode]);

  if (!authMode) return <></>;

  if (noAuthMethodsAvailable) {
    return (
      <AuthContainer>
        <AuthHeaderBase
          header="No authentication methods available"
          subHeader="Please contact your administrator to enable authentication for your instance."
        />
      </AuthContainer>
    );
  }

  return (
    <AuthContainer>
      {errorInfo && errorInfo?.type === EErrorAlertType.BANNER_ALERT && (
        <AuthBanner message={errorInfo.message} handleBannerData={(value) => setErrorInfo(value)} />
      )}
      <AuthHeader
        workspaceSlug={workspaceSlug?.toString() || undefined}
        invitationId={invitation_id?.toString() || undefined}
        invitationEmail={email || undefined}
        authMode={authMode}
        currentAuthStep={authStep}
      />
      {ssoDiscovery?.sso_applies ? (
        // Exigence 6 - a domain covered by an active SAML configuration
        // shows ONLY the "Continue with {IdP}" button: no OAuth options,
        // no password/OTP form.
        <SAMLContinueForm
          email={email}
          name={ssoDiscovery.name}
          loginUrl={ssoDiscovery.login_url}
          nextPath={nextPath?.toString() || undefined}
          handleEmailClear={() => {
            setSsoDiscovery(null);
            setEmail("");
          }}
        />
      ) : (
        <>
          {isOAuthEnabled && (
            <OAuthOptions
              options={oAuthOptions}
              compact={authStep === EAuthSteps.PASSWORD}
              showDivider={isEmailBasedAuthEnabled}
            />
          )}
          {isEmailBasedAuthEnabled && (
            <AuthFormRoot
              authStep={authStep}
              authMode={authMode}
              email={email}
              setEmail={(nextEmail) => setEmail(nextEmail)}
              setAuthMode={(nextAuthMode) => setAuthMode(nextAuthMode)}
              setAuthStep={(nextAuthStep) => setAuthStep(nextAuthStep)}
              setErrorInfo={(nextErrorInfo) => setErrorInfo(nextErrorInfo)}
              currentAuthMode={currentAuthMode}
              onSsoDiscovered={setSsoDiscovery}
            />
          )}
        </>
      )}
      <TermsAndConditions authType={authMode} />
    </AuthContainer>
  );
});

function AuthContainer({ children }: { children: React.ReactNode }) {
  return (
    <div className="mt-10 flex w-full flex-grow flex-col items-center justify-center py-6">
      <div className="relative flex w-full max-w-[22.5rem] flex-col gap-6">{children}</div>
    </div>
  );
}
