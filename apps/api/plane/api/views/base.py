# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import zoneinfo
import logging

# Django imports
from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist, ValidationError
from django.db import IntegrityError
from django.urls import resolve
from django.utils import timezone

# Third party imports
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.viewsets import ModelViewSet
from rest_framework.exceptions import APIException, Throttled
from rest_framework.generics import GenericAPIView

# Module imports
from plane.api.middleware.api_authentication import APIKeyAuthentication
from plane.api.rate_limit import ApiKeyRateThrottle, TieredSlidingWindowRateThrottle
from plane.utils.exception_logger import log_exception
from plane.utils.paginator import BasePaginator
from plane.utils.core.mixins import ReadReplicaControlMixin


logger = logging.getLogger("plane.api")


class TimezoneMixin:
    """
    This enables timezone conversion according
    to the user set timezone
    """

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.user.is_authenticated:
            timezone.activate(zoneinfo.ZoneInfo(request.user.user_timezone))
        else:
            timezone.deactivate()


class BaseAPIView(TimezoneMixin, GenericAPIView, ReadReplicaControlMixin, BasePaginator):
    authentication_classes = [APIKeyAuthentication]

    permission_classes = [IsAuthenticated]

    use_read_replica = False

    def filter_queryset(self, queryset):
        for backend in list(self.filter_backends):
            queryset = backend().filter_queryset(self.request, queryset, self)
        return queryset

    def get_throttles(self):
        # Any X-Api-Key-authenticated request (personal token or service
        # token alike) goes through the single tiered sliding-window
        # throttle - it resolves the effective limit per-token internally
        # (tier + override), so the old service-vs-personal branching that
        # used to live here (two near-duplicate SimpleRateThrottle
        # subclasses) collapsed into one class. See
        # `plane.api.rate_limit.TieredSlidingWindowRateThrottle`.
        api_key = self.request.headers.get("X-Api-Key")

        if api_key:
            return [TieredSlidingWindowRateThrottle()]

        # Defensive fallback only - IsAuthenticated + APIKeyAuthentication
        # mean a request without an X-Api-Key header never reaches
        # throttling in practice (it is rejected at the permission check
        # first). Kept unchanged from the pre-existing behavior.
        return [ApiKeyRateThrottle()]

    def handle_exception(self, exc):
        """
        Handle any exception that occurs, by returning an appropriate response,
        or re-raising the error.
        """
        # Rate-limit 429s get their own response shape (exigence 6):
        # {"error_code": "rate_limit_exceeded", "retry_after": <seconds>}
        # plus the standard Retry-After header - handled here, before
        # falling through to the shared/global DRF exception handler
        # (`plane.authentication.adapter.exception.auth_exception_handler`),
        # which already maps every other Throttled exception in this
        # codebase (login, asset upload, NL filter assistant, ...) to a
        # differently-shaped, integer-error-code body. Scoping the new
        # shape to this one base class keeps that existing convention for
        # every other throttle untouched.
        if isinstance(exc, Throttled):
            retry_after = int(exc.wait) if exc.wait is not None else 60
            response = Response(
                {"error_code": "rate_limit_exceeded", "retry_after": retry_after},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )
            response["Retry-After"] = str(retry_after)
            return response

        try:
            response = super().handle_exception(exc)
            return response
        except Exception as e:
            if isinstance(e, IntegrityError):
                return Response(
                    {"error": "The payload is not valid"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if isinstance(e, ValidationError):
                return Response(
                    {"error": "Please provide valid detail"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if isinstance(e, ObjectDoesNotExist):
                return Response(
                    {"error": "The requested resource does not exist."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if isinstance(e, KeyError):
                return Response(
                    {"error": "The required key does not exist."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            log_exception(e)
            return Response(
                {"error": "Something went wrong please try again later"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def dispatch(self, request, *args, **kwargs):
        try:
            response = super().dispatch(request, *args, **kwargs)
            if settings.DEBUG:
                from django.db import connection

                print(f"{request.method} - {request.get_full_path()} of Queries: {len(connection.queries)}")
            return response
        except Exception as exc:
            response = self.handle_exception(exc)
            return exc

    def finalize_response(self, request, response, *args, **kwargs):
        # Call super to get the default response
        response = super().finalize_response(request, response, *args, **kwargs)

        # Add custom headers if they exist in the request META
        ratelimit_limit = request.META.get("X-RateLimit-Limit")
        if ratelimit_limit is not None:
            response["X-RateLimit-Limit"] = ratelimit_limit

        ratelimit_remaining = request.META.get("X-RateLimit-Remaining")
        if ratelimit_remaining is not None:
            response["X-RateLimit-Remaining"] = ratelimit_remaining

        ratelimit_reset = request.META.get("X-RateLimit-Reset")
        if ratelimit_reset is not None:
            response["X-RateLimit-Reset"] = ratelimit_reset

        return response

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug", None)

    @property
    def project_id(self):
        project_id = self.kwargs.get("project_id", None)
        if project_id:
            return project_id

        if resolve(self.request.path_info).url_name == "project":
            return self.kwargs.get("pk", None)

    @property
    def fields(self):
        fields = [field for field in self.request.GET.get("fields", "").split(",") if field]
        return fields if fields else None

    @property
    def expand(self):
        expand = [expand for expand in self.request.GET.get("expand", "").split(",") if expand]
        return expand if expand else None


class BaseViewSet(TimezoneMixin, ReadReplicaControlMixin, ModelViewSet, BasePaginator):
    model = None

    authentication_classes = [APIKeyAuthentication]
    permission_classes = [
        IsAuthenticated,
    ]
    use_read_replica = False

    def get_queryset(self):
        try:
            return self.model.objects.all()
        except Exception as e:
            log_exception(e)
            raise APIException("Please check the view", status.HTTP_400_BAD_REQUEST)

    def handle_exception(self, exc):
        """
        Handle any exception that occurs, by returning an appropriate response,
        or re-raising the error.
        """
        try:
            response = super().handle_exception(exc)
            return response
        except Exception as e:
            if isinstance(e, IntegrityError):
                log_exception(e)
                return Response(
                    {"error": "The payload is not valid"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if isinstance(e, ValidationError):
                logger.warning(
                    "Validation Error",
                    extra={
                        "error_code": "VALIDATION_ERROR",
                        "error_message": str(e),
                    },
                )
                return Response(
                    {"error": "Please provide valid detail"},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            if isinstance(e, ObjectDoesNotExist):
                logger.warning(
                    "Object Does Not Exist",
                    extra={
                        "error_code": "OBJECT_DOES_NOT_EXIST",
                        "error_message": str(e),
                    },
                )
                return Response(
                    {"error": "The required object does not exist."},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if isinstance(e, KeyError):
                logger.error(
                    "Key Error",
                    extra={
                        "error_code": "KEY_ERROR",
                        "error_message": str(e),
                    },
                )
                return Response(
                    {"error": "The required key does not exist."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            log_exception(e)
            return Response(
                {"error": "Something went wrong please try again later"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR,
            )

    def dispatch(self, request, *args, **kwargs):
        try:
            response = super().dispatch(request, *args, **kwargs)

            if settings.DEBUG:
                from django.db import connection

                print(f"{request.method} - {request.get_full_path()} of Queries: {len(connection.queries)}")

            return response
        except Exception as exc:
            response = self.handle_exception(exc)
            return response

    @property
    def workspace_slug(self):
        return self.kwargs.get("slug", None)

    @property
    def project_id(self):
        project_id = self.kwargs.get("project_id", None)
        if project_id:
            return project_id

        if resolve(self.request.path_info).url_name == "project":
            return self.kwargs.get("pk", None)

    @property
    def fields(self):
        fields = [field for field in self.request.GET.get("fields", "").split(",") if field]
        return fields if fields else None

    @property
    def expand(self):
        expand = [expand for expand in self.request.GET.get("expand", "").split(",") if expand]
        return expand if expand else None
