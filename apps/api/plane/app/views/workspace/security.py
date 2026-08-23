# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Category 11 (docs/feature-specs/11-admin-security-sso.md in
plane-selfhost), feature 6 - "Politiques de securite configurables".

Read-access policy (exigence 1): Admin+ read (`@allow_permission([ROLE.
ADMIN], level="WORKSPACE")` - Owner is always ALSO an Admin-role
`WorkspaceMember`, an invariant `WorkspaceOwnerTransferEndpoint` itself
enforces on every ownership change, so this one check already covers
"Admin or Owner"), Owner-only write - built on the already-shipped
`is_workspace_owner()` (category 11 features 3+5, decision #4), the exact
same function `WorkSpaceViewSet.destroy()`/`WorkspaceOwnerTransferEndpoint`
already use, rather than a bespoke inline comparison.

Domain verification design decision (spec's own open question #3 - sync
vs. async Celery+polling): SYNCHRONOUS. Unlike category 9's LLM calls
(genuinely unbounded/unpredictable latency, which is why those features
poll), a DNS TXT lookup and a single HTTP GET are each hard-bounded by this
feature's own code (`plane.utils.domain_verification`: 5s DNS timeout/
lifetime, 5s HTTP timeout, tried at most twice for HTML_FILE - https then
http) - worst case is a bounded ~10-15s, not "can hang indefinitely". A
"Verify now" button click is also an explicit, deliberate user action (not
a passive background wait), so a bounded synchronous round-trip is the
more honest choice here: it keeps the frontend simple (no poll loop, no
extra state machine) without hiding any real risk of an unbounded stall.
"""

from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.response import Response

# Module imports
from plane.app.permissions import ROLE, allow_permission, is_workspace_owner
from plane.app.serializers import WorkspaceSecurityPolicySerializer, WorkspaceVerifiedDomainSerializer
from plane.app.views.base import BaseAPIView
from plane.authentication.adapter.error import AuthenticationException
from plane.authentication.provider.credentials.email import EmailProvider
from plane.authentication.provider.credentials.magic_code import MagicCodeProvider
from plane.bgtasks.magic_link_code_task import magic_link
from plane.bgtasks.webhook_task import webhook_activity
from plane.db.models import (
    AuditEventType,
    DomainVerificationMethod,
    Workspace,
    WorkspaceSecurityPolicy,
    WorkspaceVerifiedDomain,
)
from plane.utils.audit_log import log_audit_event
from plane.utils.cache import invalidate_cache, invalidate_cache_directly
from plane.utils.domain_verification import generate_verification_token, verify_domain_ownership
from plane.utils.host import base_host
from plane.utils.reauth import guard_sensitive_action, mark_reauthenticated
from plane.utils.security_policy import validate_enforce_sso_only_change


class WorkspaceSecurityPolicyEndpoint(BaseAPIView):
    """
    GET   /api/workspaces/<slug>/security-policy/ - Admin+ read.
    PATCH /api/workspaces/<slug>/security-policy/ - Owner only.

    No row exists until the first PATCH (`get_or_create`, matching
    `WorkspaceAIConfigEndpoint`'s own precedent for a per-workspace
    singleton settings row) - `GET` on a workspace with no row yet returns
    a synthesized response reflecting the model's own defaults rather than
    creating one as a side effect of a read.
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        policy = WorkspaceSecurityPolicy.objects.filter(workspace__slug=slug).first()
        if policy is None:
            defaults = WorkspaceSecurityPolicySerializer(WorkspaceSecurityPolicy()).data
            defaults.pop("id", None)
            defaults.pop("workspace", None)
            return Response(defaults, status=status.HTTP_200_OK)
        return Response(WorkspaceSecurityPolicySerializer(policy).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    @invalidate_cache(path="/api/workspaces/:slug/security-policy/", user=False, url_params=True)
    def patch(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).select_related("security_policy").first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        # Exigence 1 - "Admin" (the `@allow_permission([ROLE.ADMIN], ...)`
        # decorator above) may only READ; write is Owner-exclusive. Same
        # generalization pattern as `WorkSpaceViewSet.destroy()`.
        if not is_workspace_owner(request.user, slug):
            return Response(
                {"error": "Only the workspace owner can perform this action."},
                status=status.HTTP_403_FORBIDDEN,
            )

        # Exigence 8 - modifying the security policy is itself a listed
        # sensitive action, gated by that SAME policy's own
        # `force_reauth_for_sensitive_actions` (read from the current,
        # pre-mutation row - a brand-new workspace with no policy row yet
        # has nothing to gate against).
        blocked = guard_sensitive_action(request.user, workspace=workspace)
        if blocked:
            return blocked

        policy, _ = WorkspaceSecurityPolicy.objects.get_or_create(workspace=workspace)
        old_value = WorkspaceSecurityPolicySerializer(policy).data
        old_value.pop("id", None)
        old_value.pop("workspace", None)

        # Exigence 4 + 10 - anti-lockout guards, only relevant when
        # `enforce_sso_only` is part of this PATCH and being turned ON.
        turning_sso_only_on = (
            "enforce_sso_only" in request.data
            and bool(request.data.get("enforce_sso_only"))
            and not policy.enforce_sso_only
        )
        if turning_sso_only_on:
            error = validate_enforce_sso_only_change(request.user, workspace, True)
            if error:
                return Response({"error": error}, status=status.HTTP_400_BAD_REQUEST)

        serializer = WorkspaceSecurityPolicySerializer(policy, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        serializer.save()

        new_value = WorkspaceSecurityPolicySerializer(policy).data
        new_value.pop("id", None)
        new_value.pop("workspace", None)

        # Exigence 9 - satisfied via the already-shipped merged audit log
        # (category 11 features 3+5), not a separate activity mechanism.
        log_audit_event(
            AuditEventType.SECURITY_POLICY_UPDATED,
            request=request,
            workspace=workspace,
            actor=request.user,
            target_type="WorkspaceSecurityPolicy",
            target_id=str(policy.id),
            old_value=old_value,
            new_value=new_value,
        )
        webhook_activity.delay(
            event="security_policy",
            verb="updated",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=str(policy.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={"workspace_id": str(workspace.id), "old_value": old_value, "new_value": new_value},
        )
        # Exigence 11 - invalidate the workspace/member cache after write.
        invalidate_cache_directly(
            path=f"/api/workspaces/{slug}/members/", user=False, request=request, multiple=True
        )

        return Response(WorkspaceSecurityPolicySerializer(policy).data, status=status.HTTP_200_OK)


class WorkspaceVerifiedDomainEndpoint(BaseAPIView):
    """
    GET    /api/workspaces/<slug>/verified-domains/     - list (Admin+).
    POST   /api/workspaces/<slug>/verified-domains/     - create (Owner).
    DELETE /api/workspaces/<slug>/verified-domains/<pk>/ - delete (Owner).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def get(self, request, slug):
        domains = WorkspaceVerifiedDomain.objects.filter(workspace__slug=slug)
        return Response(WorkspaceVerifiedDomainSerializer(domains, many=True).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug):
        workspace = Workspace.objects.filter(slug=slug).first()
        if workspace is None:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        if not is_workspace_owner(request.user, slug):
            return Response(
                {"error": "Only the workspace owner can manage verified domains."},
                status=status.HTTP_403_FORBIDDEN,
            )

        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        data.setdefault("verification_method", DomainVerificationMethod.DNS_TXT)

        serializer = WorkspaceVerifiedDomainSerializer(data=data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        domain = serializer.validated_data["domain"]
        if WorkspaceVerifiedDomain.objects.filter(workspace=workspace, domain=domain).exists():
            return Response(
                {"error": "This domain is already registered for this workspace."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        verified_domain = serializer.save(
            workspace=workspace,
            verification_token=generate_verification_token(),
            is_verified=False,
        )

        log_audit_event(
            AuditEventType.VERIFIED_DOMAIN_ADDED,
            request=request,
            workspace=workspace,
            actor=request.user,
            target_type="WorkspaceVerifiedDomain",
            target_id=str(verified_domain.id),
            metadata={"domain": verified_domain.domain, "verification_method": verified_domain.verification_method},
        )
        webhook_activity.delay(
            event="verified_domain",
            verb="created",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=str(verified_domain.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={"workspace_id": str(workspace.id), "domain": verified_domain.domain},
        )

        return Response(WorkspaceVerifiedDomainSerializer(verified_domain).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        verified_domain = WorkspaceVerifiedDomain.objects.filter(workspace__slug=slug, pk=pk).first()
        if verified_domain is None:
            return Response({"error": "Verified domain not found"}, status=status.HTTP_404_NOT_FOUND)

        if not is_workspace_owner(request.user, slug):
            return Response(
                {"error": "Only the workspace owner can manage verified domains."},
                status=status.HTTP_403_FORBIDDEN,
            )

        log_audit_event(
            AuditEventType.VERIFIED_DOMAIN_REMOVED,
            request=request,
            workspace=verified_domain.workspace,
            actor=request.user,
            target_type="WorkspaceVerifiedDomain",
            target_id=str(verified_domain.id),
            metadata={"domain": verified_domain.domain},
        )
        webhook_activity.delay(
            event="verified_domain",
            verb="deleted",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=request.user.id,
            slug=slug,
            current_site=base_host(request=request, is_app=True),
            event_id=str(verified_domain.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override={"workspace_id": str(verified_domain.workspace_id), "domain": verified_domain.domain},
        )

        verified_domain.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceVerifiedDomainVerifyEndpoint(BaseAPIView):
    """
    POST /api/workspaces/<slug>/verified-domains/<pk>/verify/

    Synchronous - see this module's own docstring for the sync-vs-async
    reasoning (spec's own open question #3).
    """

    @allow_permission([ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, pk):
        verified_domain = WorkspaceVerifiedDomain.objects.filter(workspace__slug=slug, pk=pk).first()
        if verified_domain is None:
            return Response({"error": "Verified domain not found"}, status=status.HTTP_404_NOT_FOUND)

        if not is_workspace_owner(request.user, slug):
            return Response(
                {"error": "Only the workspace owner can manage verified domains."},
                status=status.HTTP_403_FORBIDDEN,
            )

        was_verified = verified_domain.is_verified
        success, detail = verify_domain_ownership(
            domain=verified_domain.domain,
            method=verified_domain.verification_method,
            token=verified_domain.verification_token,
        )

        if success and not was_verified:
            verified_domain.is_verified = True
            verified_domain.verified_at = timezone.now()
            verified_domain.save()

            log_audit_event(
                AuditEventType.DOMAIN_VERIFICATION_STATUS_CHANGED,
                request=request,
                workspace=verified_domain.workspace,
                actor=request.user,
                target_type="WorkspaceVerifiedDomain",
                target_id=str(verified_domain.id),
                old_value={"is_verified": False},
                new_value={"is_verified": True},
                metadata={"domain": verified_domain.domain, "detail": detail},
            )
            webhook_activity.delay(
                event="verified_domain",
                verb="verified",
                field=None,
                old_value=None,
                new_value=None,
                actor_id=request.user.id,
                slug=slug,
                current_site=base_host(request=request, is_app=True),
                event_id=str(verified_domain.id),
                old_identifier=None,
                new_identifier=None,
                event_data_override={
                    "workspace_id": str(verified_domain.workspace_id),
                    "domain": verified_domain.domain,
                },
            )

        return Response(
            {
                "is_verified": verified_domain.is_verified,
                "verified_at": verified_domain.verified_at,
                "detail": detail,
            },
            status=status.HTTP_200_OK if success else status.HTTP_400_BAD_REQUEST,
        )


class WorkspaceReauthChallengeEndpoint(BaseAPIView):
    """
    POST /api/workspaces/<slug>/reauth/

    Exigence 8 - generic, reusable "confirm you are still you" challenge.
    `slug` is accepted (for URL/permission symmetry with every other
    endpoint in this file and for future per-workspace auditing) but the
    challenge itself is account-level, not workspace-scoped - refreshing
    `User.last_authenticated_at` reopens EVERY workspace's sensitive-action gate
    for this user at once, matching how the underlying "last real
    authentication" moment already works for login itself.

    Body:
      `{"method": "password", "password": "..."}`
      `{"method": "magic_code", "action": "request"}` - sends a fresh OTP.
      `{"method": "magic_code", "action": "confirm", "code": "..."}`

    Reuses the EXISTING credential-provider verification logic
    (`EmailProvider`/`MagicCodeProvider.set_user_data()`, the exact classes
    the real login endpoints use) rather than reimplementing password/OTP
    checking - only `set_user_data()` is called (not the full
    `authenticate()`/`complete_login_or_signup()` chain a fresh login
    would run), since the user here is already an authenticated session,
    not signing in.

    Note this endpoint is itself workspace-scoped in the URL, so it is
    ALSO subject to `plane.utils.session_activity`'s idle-timeout gate
    (exigence 7) like every other `/api/workspaces/<slug>/...` endpoint -
    deliberately not exempted. The two mechanisms are different gates with
    different remedies: exigence 7's idle timeout means the workspace
    SESSION itself has gone stale and needs a full fresh login (which
    naturally also refreshes `last_authenticated_at` as a side effect of
    `user_login()`); this endpoint only refreshes `last_authenticated_at`
    without resetting `last_workspace_activity_at`, so it would not
    actually clear an idle-timeout condition even if called - there is
    nothing to bypass here, an idle-timed-out user genuinely needs the
    frontend to route them through the real login flow, not this
    challenge.
    """

    @allow_permission([ROLE.ADMIN, ROLE.MEMBER, ROLE.GUEST], level="WORKSPACE")
    def post(self, request, slug):
        method = request.data.get("method")

        if method == "password":
            password = request.data.get("password")
            if not password:
                return Response({"error": "password is required"}, status=status.HTTP_400_BAD_REQUEST)
            if request.user.is_password_autoset:
                return Response(
                    {"error": "No password is set on this account. Use method='magic_code' instead."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            try:
                provider = EmailProvider(request=request, key=request.user.email, code=password, is_signup=False)
                provider.set_user_data()
            except AuthenticationException as e:
                return Response(e.get_error_dict(), status=status.HTTP_401_UNAUTHORIZED)

            mark_reauthenticated(request.user)
            return Response({"reauthenticated": True}, status=status.HTTP_200_OK)

        if method == "magic_code":
            action = request.data.get("action", "request")
            email = request.user.email
            key = f"magic_{email}"

            if action == "request":
                try:
                    provider = MagicCodeProvider(request=request, key=email)
                    redis_key, token = provider.initiate()
                except AuthenticationException as e:
                    return Response(e.get_error_dict(), status=status.HTTP_400_BAD_REQUEST)
                magic_link.delay(email, redis_key, token)
                return Response({"message": "Verification code sent."}, status=status.HTTP_200_OK)

            if action == "confirm":
                code = request.data.get("code")
                if not code:
                    return Response({"error": "code is required"}, status=status.HTTP_400_BAD_REQUEST)
                try:
                    provider = MagicCodeProvider(request=request, key=key, code=code)
                    provider.set_user_data()
                except AuthenticationException as e:
                    return Response(e.get_error_dict(), status=status.HTTP_401_UNAUTHORIZED)

                mark_reauthenticated(request.user)
                return Response({"reauthenticated": True}, status=status.HTTP_200_OK)

            return Response({"error": "action must be 'request' or 'confirm'"}, status=status.HTTP_400_BAD_REQUEST)

        return Response(
            {"error": "method must be 'password' or 'magic_code'"},
            status=status.HTTP_400_BAD_REQUEST,
        )
