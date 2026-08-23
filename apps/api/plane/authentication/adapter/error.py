# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

AUTHENTICATION_ERROR_CODES = {
    # Global
    "INSTANCE_NOT_CONFIGURED": 5000,
    "INVALID_EMAIL": 5005,
    "EMAIL_REQUIRED": 5010,
    "SIGNUP_DISABLED": 5015,
    "MAGIC_LINK_LOGIN_DISABLED": 5016,
    "PASSWORD_LOGIN_DISABLED": 5018,
    "USER_ACCOUNT_DEACTIVATED": 5019,
    # Password strength
    "INVALID_PASSWORD": 5020,
    "PASSWORD_TOO_WEAK": 5021,
    "SMTP_NOT_CONFIGURED": 5025,
    # Sign Up
    "USER_ALREADY_EXIST": 5030,
    "AUTHENTICATION_FAILED_SIGN_UP": 5035,
    "REQUIRED_EMAIL_PASSWORD_SIGN_UP": 5040,
    "INVALID_EMAIL_SIGN_UP": 5045,
    "INVALID_EMAIL_MAGIC_SIGN_UP": 5050,
    "MAGIC_SIGN_UP_EMAIL_CODE_REQUIRED": 5055,
    "EMAIL_PASSWORD_AUTHENTICATION_DISABLED": 5056,
    # Sign In
    "USER_DOES_NOT_EXIST": 5060,
    "AUTHENTICATION_FAILED_SIGN_IN": 5065,
    "REQUIRED_EMAIL_PASSWORD_SIGN_IN": 5070,
    "INVALID_EMAIL_SIGN_IN": 5075,
    "INVALID_EMAIL_MAGIC_SIGN_IN": 5080,
    "MAGIC_SIGN_IN_EMAIL_CODE_REQUIRED": 5085,
    # Both Sign in and Sign up for magic
    "INVALID_MAGIC_CODE_SIGN_IN": 5090,
    "INVALID_MAGIC_CODE_SIGN_UP": 5092,
    "EXPIRED_MAGIC_CODE_SIGN_IN": 5095,
    "EXPIRED_MAGIC_CODE_SIGN_UP": 5097,
    "EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_IN": 5100,
    "EMAIL_CODE_ATTEMPT_EXHAUSTED_SIGN_UP": 5102,
    # Oauth
    "OAUTH_NOT_CONFIGURED": 5104,
    "GOOGLE_NOT_CONFIGURED": 5105,
    "GITHUB_NOT_CONFIGURED": 5110,
    "GITHUB_USER_NOT_IN_ORG": 5122,
    "GITLAB_NOT_CONFIGURED": 5111,
    "GITEA_NOT_CONFIGURED": 5112,
    "GOOGLE_OAUTH_PROVIDER_ERROR": 5115,
    "GITHUB_OAUTH_PROVIDER_ERROR": 5120,
    "GITLAB_OAUTH_PROVIDER_ERROR": 5121,
    "GITEA_OAUTH_PROVIDER_ERROR": 5123,
    # Reset Password
    "INVALID_PASSWORD_TOKEN": 5125,
    "EXPIRED_PASSWORD_TOKEN": 5130,
    # Change password
    "INCORRECT_OLD_PASSWORD": 5135,
    "MISSING_PASSWORD": 5138,
    "INVALID_NEW_PASSWORD": 5140,
    # set password
    "PASSWORD_ALREADY_SET": 5145,
    # Admin
    "ADMIN_ALREADY_EXIST": 5150,
    "REQUIRED_ADMIN_EMAIL_PASSWORD_FIRST_NAME": 5155,
    "INVALID_ADMIN_EMAIL": 5160,
    "INVALID_ADMIN_PASSWORD": 5165,
    "REQUIRED_ADMIN_EMAIL_PASSWORD": 5170,
    "ADMIN_AUTHENTICATION_FAILED": 5175,
    "ADMIN_USER_ALREADY_EXIST": 5180,
    "ADMIN_USER_DOES_NOT_EXIST": 5185,
    "ADMIN_USER_DEACTIVATED": 5190,
    # Bot / agent actors (docs/feature-specs/09-ai-features.md "7. Type
    # d'acteur agent de premiere classe" in plane-selfhost, exigence 7) -
    # applies to every `is_bot=True` user, not just WORKSPACE_AGENT: a
    # GitHub/GitLab/Slack/... integration bot shouldn't be able to log in
    # via password/OAuth either.
    "BOT_AUTHENTICATION_NOT_ALLOWED": 5195,
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 6 ("Politiques de securite configurables") -
    # exigence 3/6. Raised by the email/password and magic-link credential
    # providers (`plane.authentication.provider.credentials.*`, via the
    # shared `CredentialAdapter.authenticate()` choke point) when the
    # login email's domain is covered by a verified
    # `WorkspaceVerifiedDomain` whose workspace has
    # `WorkspaceSecurityPolicy.enforce_sso_only=True` - never raised for
    # OAuth providers, which are exactly what this error tells the user to
    # use instead (`payload["allowed_methods"]`).
    "SSO_ENFORCED_FOR_DOMAIN": 5200,
    # Exigence 8 - re-authentication challenge. Raised by
    # `plane.utils.reauth.require_recent_authentication` when
    # `WorkspaceSecurityPolicy.force_reauth_for_sensitive_actions=True` and
    # the user's last real authentication (`User.token_updated_at`) is
    # older than the 15-minute window - see that module's own docstring.
    "REAUTH_REQUIRED": 5205,
    "REAUTH_FAILED": 5210,
    # Rate limit
    "RATE_LIMIT_EXCEEDED": 5900,
    # Unknown
    "AUTHENTICATION_FAILED": 5999,
}


class AuthenticationException(Exception):
    error_code = None
    error_message = None
    payload = {}

    def __init__(self, error_code, error_message, payload={}):
        self.error_code = error_code
        self.error_message = error_message
        self.payload = payload

    def get_error_dict(self):
        error = {"error_code": self.error_code, "error_message": self.error_message}
        for key in self.payload:
            error[key] = self.payload[key]

        return error
