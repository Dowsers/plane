# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.license.api.views import (
    AdminUserPasswordResetLinkEndpoint,
    EmailCredentialCheckEndpoint,
    InstanceAdminEndpoint,
    InstanceAdminSignInEndpoint,
    InstanceAdminSignUpEndpoint,
    InstanceAuditLogEndpoint,
    InstanceConfigurationEndpoint,
    DisableEmailFeatureEndpoint,
    InstanceEndpoint,
    SignUpScreenVisitedEndpoint,
    InstanceAdminUserMeEndpoint,
    InstanceAdminSignOutEndpoint,
    InstanceAdminUserSessionEndpoint,
    InstanceWorkSpaceAvailabilityCheckEndpoint,
    InstanceWorkSpaceEndpoint,
    RateLimitTierEndpoint,
    InstanceSAMLConfigurationEndpoint,
    InstanceSAMLDomainEndpoint,
    InstanceSAMLDomainVerifyEndpoint,
    InstanceSAMLTestConnectionEndpoint,
    GenerateVapidKeysEndpoint,
    PushNotificationConfigEndpoint,
    PushNotificationTestEndpoint,
)

urlpatterns = [
    path("", InstanceEndpoint.as_view(), name="instance"),
    path("admins/", InstanceAdminEndpoint.as_view(), name="instance-admins"),
    path("admins/me/", InstanceAdminUserMeEndpoint.as_view(), name="instance-admins"),
    path(
        "admins/session/",
        InstanceAdminUserSessionEndpoint.as_view(),
        name="instance-admin-session",
    ),
    path(
        "admins/sign-out/",
        InstanceAdminSignOutEndpoint.as_view(),
        name="instance-admins",
    ),
    path("admins/<uuid:pk>/", InstanceAdminEndpoint.as_view(), name="instance-admins"),
    # No-SMTP-required admin-triggered password reset (returns the reset
    # link to the instance admin instead of emailing it) - god-mode-only
    # via `BaseAPIView`'s own default `InstanceAdminPermission`.
    path(
        "admin/users/reset-password-link/",
        AdminUserPasswordResetLinkEndpoint.as_view(),
        name="instance-admin-user-reset-password-link",
    ),
    path(
        "configurations/",
        InstanceConfigurationEndpoint.as_view(),
        name="instance-configuration",
    ),
    path(
        "configurations/disable-email-feature/",
        DisableEmailFeatureEndpoint.as_view(),
        name="disable-email-configuration",
    ),
    path(
        "admins/sign-in/",
        InstanceAdminSignInEndpoint.as_view(),
        name="instance-admin-sign-in",
    ),
    path(
        "admins/sign-up/",
        InstanceAdminSignUpEndpoint.as_view(),
        name="instance-admin-sign-in",
    ),
    path(
        "admins/sign-up-screen-visited/",
        SignUpScreenVisitedEndpoint.as_view(),
        name="instance-sign-up",
    ),
    path(
        "email-credentials-check/",
        EmailCredentialCheckEndpoint.as_view(),
        name="email-credential-check",
    ),
    path(
        "workspace-slug-check/",
        InstanceWorkSpaceAvailabilityCheckEndpoint.as_view(),
        name="instance-workspace-availability",
    ),
    path("workspaces/", InstanceWorkSpaceEndpoint.as_view(), name="instance-workspace"),
    path(
        "rate-limit-tiers/",
        RateLimitTierEndpoint.as_view(),
        name="rate-limit-tiers",
    ),
    path(
        "rate-limit-tiers/<uuid:pk>/",
        RateLimitTierEndpoint.as_view(),
        name="rate-limit-tiers-details",
    ),
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), features 3+5 merged, exigence 10.
    path(
        "audit-logs/",
        InstanceAuditLogEndpoint.as_view(),
        name="instance-audit-logs",
    ),
    # Category 11 (docs/feature-specs/11-admin-security-sso.md in
    # plane-selfhost), feature 1 "SSO SAML 2.0 natif" - instance-admin
    # (god-mode) endpoints. Instance-admin-only via `BaseAPIView`'s own
    # default `InstanceAdminPermission` (decision #6).
    path(
        "admin/saml-configurations/",
        InstanceSAMLConfigurationEndpoint.as_view(),
        name="instance-saml-configurations",
    ),
    path(
        "admin/saml-configurations/<uuid:pk>/",
        InstanceSAMLConfigurationEndpoint.as_view(),
        name="instance-saml-configuration-detail",
    ),
    path(
        "admin/saml-configurations/<uuid:pk>/domains/",
        InstanceSAMLDomainEndpoint.as_view(),
        name="instance-saml-configuration-domains",
    ),
    path(
        "admin/saml-configurations/<uuid:pk>/domains/<uuid:domain_id>/verify/",
        InstanceSAMLDomainVerifyEndpoint.as_view(),
        name="instance-saml-configuration-domain-verify",
    ),
    path(
        "admin/saml-configurations/<uuid:pk>/test-connection/",
        InstanceSAMLTestConnectionEndpoint.as_view(),
        name="instance-saml-configuration-test-connection",
    ),
    # Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
    # plane-selfhost), feature 3 "Notifications push en self-hosted" -
    # god-mode endpoints, namespaced under `configurations/push/` per the
    # spec's own "Endpoints admin instance" section. Instance-admin-only
    # via `BaseAPIView`'s own default `InstanceAdminPermission`.
    path(
        "configurations/push/",
        PushNotificationConfigEndpoint.as_view(),
        name="instance-push-notification-configuration",
    ),
    path(
        "configurations/push/generate-vapid-keys/",
        GenerateVapidKeysEndpoint.as_view(),
        name="instance-push-notification-generate-vapid-keys",
    ),
    path(
        "configurations/push/test/",
        PushNotificationTestEndpoint.as_view(),
        name="instance-push-notification-test",
    ),
]
