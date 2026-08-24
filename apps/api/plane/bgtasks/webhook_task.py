# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import hashlib
import hmac
import json
import logging
import uuid

import requests
from typing import Any, Dict, List, Optional, Union

# Third party imports
from celery import shared_task

# Django imports
from django.conf import settings
from django.db.models import Prefetch
from django.core.mail import EmailMultiAlternatives, get_connection
from django.core.serializers.json import DjangoJSONEncoder
from django.template.loader import render_to_string
from django.core.exceptions import ObjectDoesNotExist

# Module imports
from plane.api.serializers import (
    CycleIssueSerializer,
    CycleSerializer,
    IssueCommentSerializer,
    IssueExpandSerializer,
    ModuleIssueSerializer,
    ModuleSerializer,
    ProjectSerializer,
    UserLiteSerializer,
    IntakeIssueSerializer,
)
from plane.db.models import (
    Cycle,
    CycleIssue,
    Issue,
    IssueComment,
    Module,
    ModuleIssue,
    Project,
    User,
    Webhook,
    WebhookLog,
    IntakeIssue,
    IssueLabel,
    IssueAssignee,
)
from plane.license.utils.instance_value import get_email_configuration
from plane.utils.email import generate_plain_text_from_html
from plane.utils.exception_logger import log_exception
from plane.utils.ip_address import validate_url
from plane.settings.mongo import MongoConnection


SERIALIZER_MAPPER = {
    "project": ProjectSerializer,
    "issue": IssueExpandSerializer,
    "cycle": CycleSerializer,
    "module": ModuleSerializer,
    "cycle_issue": CycleIssueSerializer,
    "module_issue": ModuleIssueSerializer,
    "issue_comment": IssueCommentSerializer,
    "user": UserLiteSerializer,
    "intake_issue": IntakeIssueSerializer,
}

# Category 11 (docs/feature-specs/11-admin-security-sso.md in
# plane-selfhost), features 3+5 merged, decision #5 - every event gated by
# the single `Webhook.workspace_security` boolean column, keyed off the
# event string rather than one hardcoded `if event == ...` block per event
# (unlike every other boolean column above) precisely so that feature 6 of
# this same category ("Politiques de sécurité configurables"), which
# reuses this exact column for its own future events, only ever needs to
# add its event name(s) to this one set - never a new column, never a new
# dispatch branch.
WORKSPACE_SECURITY_EVENTS = {
    "audit_log",
    "workspace_ownership",
    "project_owner",
    # Category 11 feature 6 ("Politiques de securite configurables") - adds
    # its own event names to this SAME set exactly as the comment above
    # anticipated: `workspace_security_policy.updated` (event=
    # "security_policy", verb="updated") and `workspace_verified_domain.
    # created`/`.verified`/`.deleted` (event="verified_domain", verb=
    # "created"/"verified"/"deleted") - see
    # `plane.app.views.workspace.security` for the dispatch call sites.
    "security_policy",
    "verified_domain",
    # Category 11 feature 2 ("SCIM 2.0 natif") - same reuse, same
    # translation pattern as feature 6 above. The spec's own two named
    # event strings (`member.scim_provisioned`/`member.scim_deprovisioned`)
    # become event="scim_provisioning", verb="provisioned"/"deprovisioned"
    # (also "provisioned" again on a PATCH/PUT active:true reactivation -
    # see `plane.scim.provisioning` for the dispatch call sites).
    "scim_provisioning",
    # Category 11 feature 4 ("Constructeur de roles personnalises") -
    # same reuse. The spec's own named event
    # (`workspace_member.role_changed`) becomes event="workspace_member",
    # verb="role_changed" - see
    # `plane.app.views.workspace.member.WorkSpaceMemberViewSet.
    # partial_update` for the dispatch call site. Fires whenever EITHER
    # the legacy `role` integer OR `custom_role` actually changes (not
    # just the legacy field), since two different custom roles can share
    # the same legacy value.
    "workspace_member",
}

MODEL_MAPPER = {
    "project": Project,
    "issue": Issue,
    "cycle": Cycle,
    "module": Module,
    "cycle_issue": CycleIssue,
    "module_issue": ModuleIssue,
    "issue_comment": IssueComment,
    "user": User,
    "intake_issue": IntakeIssue,
}


logger = logging.getLogger("plane.worker")


def sign_webhook_payload(secret_key: Optional[str], payload: Dict[str, Any]) -> Optional[str]:
    """
    HMAC-SHA256 signing, extracted out of `webhook_send_task` below so it
    has exactly one implementation shared by every delivery path - real
    async event delivery here, and the synchronous API-Explorer test-send
    (`plane.app.views.webhook.base.WebhookTestSendEndpoint`, see
    docs/feature-specs/08-api-webhooks-cli.md "6. Explorateur d'API
    interactif" in plane-selfhost). A signature drift between those two
    paths would make a webhook that verifies fine in the explorer fail for
    real (or vice versa) - the kind of bug that's invisible until a
    receiver's HMAC check starts rejecting real traffic.
    """
    if not secret_key:
        return None
    hmac_signature = hmac.new(
        secret_key.encode("utf-8"), json.dumps(payload).encode("utf-8"), hashlib.sha256
    )
    return hmac_signature.hexdigest()


def get_issue_prefetches():
    return [
        Prefetch("label_issue", queryset=IssueLabel.objects.select_related("label")),
        Prefetch("issue_assignee", queryset=IssueAssignee.objects.select_related("assignee")),
    ]


def save_webhook_log(
    webhook: Webhook,
    request_method: str,
    request_headers: str,
    request_body: str,
    response_status: str,
    response_headers: str,
    response_body: str,
    retry_count: int,
    event_type: str,
) -> None:
    # webhook_logs
    mongo_collection = MongoConnection.get_collection("webhook_logs")

    log_data = {
        "workspace_id": str(webhook.workspace_id),
        "webhook": str(webhook.id),
        "event_type": str(event_type),
        "request_method": str(request_method),
        "request_headers": str(request_headers),
        "request_body": str(request_body),
        "response_status": str(response_status),
        "response_headers": str(response_headers),
        "response_body": str(response_body),
        "retry_count": retry_count,
    }

    mongo_save_success = False
    if mongo_collection is not None:
        try:
            # insert the log data into the mongo collection
            mongo_collection.insert_one(log_data)
            logger.info("Webhook log saved successfully to mongo")
            mongo_save_success = True
        except Exception as e:
            log_exception(e, warning=True)
            logger.error(f"Failed to save webhook log: {e}")
            mongo_save_success = False

    # if the mongo save is not successful, save the log data into the database
    if not mongo_save_success:
        try:
            # insert the log data into the database
            WebhookLog.objects.create(**log_data)
            logger.info("Webhook log saved successfully to database")
        except Exception as e:
            log_exception(e, warning=True)
            logger.error(f"Failed to save webhook log: {e}")


def get_model_data(event: str, event_id: Union[str, List[str]], many: bool = False) -> Dict[str, Any]:
    """
    Retrieve and serialize model data based on the event type.

    Args:
        event (str): The type of event/model to retrieve data for
        event_id (Union[str, List[str]]): The ID or list of IDs of the model instance(s)
        many (bool): Whether to retrieve multiple instances

    Returns:
        Dict[str, Any]: Serialized model data

    Raises:
        ValueError: If serializer is not found for the event
        ObjectDoesNotExist: If model instance is not found
    """
    model = MODEL_MAPPER.get(event)
    if model is None:
        raise ValueError(f"Model not found for event: {event}")

    try:
        if many:
            queryset = model.objects.filter(pk__in=event_id)
        else:
            queryset = model.objects.get(pk=event_id)

        serializer = SERIALIZER_MAPPER.get(event)

        if serializer is None:
            raise ValueError(f"Serializer not found for event: {event}")

        issue_prefetches = get_issue_prefetches()
        if event == "issue":
            if many:
                queryset = queryset.prefetch_related(*issue_prefetches)
            else:
                issue_id = queryset.id
                queryset = model.objects.filter(pk=issue_id).prefetch_related(*issue_prefetches).first()

            return serializer(queryset, many=many, context={"expand": ["labels", "assignees"]}).data
        else:
            return serializer(queryset, many=many).data
    except ObjectDoesNotExist:
        raise ObjectDoesNotExist(f"No {event} found with id: {event_id}")


@shared_task
def send_webhook_deactivation_email(webhook_id: str, receiver_id: str, current_site: str, reason: str) -> None:
    """
    Send an email notification when a webhook is deactivated.

    Args:
        webhook_id (str): ID of the deactivated webhook
        receiver_id (str): ID of the user to receive the notification
        current_site (str): Current site URL
        reason (str): Reason for webhook deactivation
    """
    try:
        (
            EMAIL_HOST,
            EMAIL_HOST_USER,
            EMAIL_HOST_PASSWORD,
            EMAIL_PORT,
            EMAIL_USE_TLS,
            EMAIL_USE_SSL,
            EMAIL_FROM,
        ) = get_email_configuration()

        receiver = User.objects.get(pk=receiver_id)
        webhook = Webhook.objects.get(pk=webhook_id)

        # Get the webhook payload
        subject = "Webhook Deactivated"
        message = f"Webhook {webhook.url} has been deactivated due to failed requests."

        # Send the mail
        context = {
            "email": receiver.email,
            "message": message,
            "webhook_url": f"{current_site}/{str(webhook.workspace.slug)}/settings/webhooks/{str(webhook.id)}",
        }
        html_content = render_to_string("emails/notifications/webhook-deactivate.html", context)
        text_content = generate_plain_text_from_html(html_content)

        # Set the email connection
        connection = get_connection(
            host=EMAIL_HOST,
            port=int(EMAIL_PORT),
            username=EMAIL_HOST_USER,
            password=EMAIL_HOST_PASSWORD,
            use_tls=EMAIL_USE_TLS == "1",
            use_ssl=EMAIL_USE_SSL == "1",
        )

        # Create the email message
        msg = EmailMultiAlternatives(
            subject=subject,
            body=text_content,
            from_email=EMAIL_FROM,
            to=[receiver.email],
            connection=connection,
        )
        msg.attach_alternative(html_content, "text/html")
        msg.send()
        logger.info("Email sent successfully.")
    except Exception as e:
        log_exception(e, warning=True)
        logger.error(f"Failed to send email: {e}")


@shared_task(
    bind=True,
    autoretry_for=(requests.RequestException,),
    retry_backoff=600,
    max_retries=5,
    retry_jitter=True,
)
def webhook_send_task(
    self,
    webhook_id: str,
    slug: str,
    event: str,
    event_data: Optional[Dict[str, Any]],
    action: str,
    current_site: str,
    activity: Optional[Dict[str, Any]],
) -> None:
    """
    Send webhook notifications to configured endpoints.

    Args:
        webhook (str): Webhook ID
        slug (str): Workspace slug
        event (str): Event type
        event_data (Optional[Dict[str, Any]]): Event data to be sent
        action (str): HTTP method/action
        current_site (str): Current site URL
        activity (Optional[Dict[str, Any]]): Activity data
    """
    try:
        webhook = Webhook.objects.get(id=webhook_id, workspace__slug=slug)

        headers = {
            "Content-Type": "application/json",
            "User-Agent": "Autopilot",
            "X-Plane-Delivery": str(uuid.uuid4()),
            "X-Plane-Event": event,
        }

        # # Your secret key
        event_data = json.loads(json.dumps(event_data, cls=DjangoJSONEncoder)) if event_data is not None else None

        activity = json.loads(json.dumps(activity, cls=DjangoJSONEncoder)) if activity is not None else None

        action = {
            "POST": "create",
            "PATCH": "update",
            "PUT": "update",
            "DELETE": "delete",
        }.get(action, action)

        payload = {
            "event": event,
            "action": action,
            "webhook_id": str(webhook.id),
            "workspace_id": str(webhook.workspace_id),
            "data": event_data,
            "activity": activity,
        }

        # Use HMAC for generating signature
        signature = sign_webhook_payload(webhook.secret_key, payload)
        if signature:
            headers["X-Plane-Signature"] = signature
    except Exception as e:
        log_exception(e)
        logger.error(f"Failed to send webhook: {e}")
        return

    try:
        # Re-validate the webhook URL at send time to prevent DNS-rebinding attacks
        validate_url(
            webhook.url,
            allowed_ips=settings.WEBHOOK_ALLOWED_IPS,
            allowed_hosts=settings.WEBHOOK_ALLOWED_HOSTS,
        )

        # Send the webhook event
        response = requests.post(webhook.url, headers=headers, json=payload, timeout=30)

        # Log the webhook request
        save_webhook_log(
            webhook=webhook,
            request_method=action,
            request_headers=headers,
            request_body=payload,
            response_status=response.status_code,
            response_headers=response.headers,
            response_body=response.text,
            retry_count=self.request.retries,
            event_type=event,
        )
        logger.info(f"Webhook {webhook.id} sent successfully")
    except requests.RequestException as e:
        # Log the failed webhook request
        save_webhook_log(
            webhook=webhook,
            request_method=action,
            request_headers=headers,
            request_body=payload,
            response_status=500,
            response_headers="",
            response_body=str(e),
            retry_count=self.request.retries,
            event_type=event,
        )
        logger.error(f"Webhook {webhook.id} failed with error: {e}")
        # Retry logic
        if self.request.retries >= self.max_retries:
            Webhook.objects.filter(pk=webhook.id).update(is_active=False)
            if webhook:
                # send email for the deactivation of the webhook
                send_webhook_deactivation_email.delay(
                    webhook_id=webhook.id,
                    receiver_id=webhook.created_by_id,
                    reason=str(e),
                    current_site=current_site,
                )
            return
        raise requests.RequestException()

    except Exception as e:
        log_exception(e)
        return


@shared_task
def webhook_activity(
    event: str,
    verb: str,
    field: Optional[str],
    old_value: Any,
    new_value: Any,
    actor_id: str | uuid.UUID,
    slug: str,
    current_site: str,
    event_id: str | uuid.UUID,
    old_identifier: Optional[str],
    new_identifier: Optional[str],
    event_data_override: Optional[Dict[str, Any]] = None,
) -> None:
    """
    Process and send webhook notifications for various activities in the system.

    This task filters relevant webhooks based on the event type and sends notifications
    to all active webhooks for the workspace.

    Args:
        event (str): Type of event (project, issue, module, cycle, issue_comment, workflow_rule,
            workflow_transition, issue_triage_suggestion)
        verb (str): Action performed (created, updated, deleted, triggered)
        field (Optional[str]): Name of the field that was changed
        old_value (Any): Previous value of the field
        new_value (Any): New value of the field
        actor_id (str | uuid.UUID): ID of the user who performed the action
        slug (str): Workspace slug
        current_site (str): Current site URL
        event_id (str | uuid.UUID): ID of the event object
        old_identifier (Optional[str]): Previous identifier if any
        new_identifier (Optional[str]): New identifier if any
        event_data_override (Optional[Dict[str, Any]]): When provided, used verbatim as
            the payload's `data` instead of looking the event up through
            MODEL_MAPPER/SERIALIZER_MAPPER. Needed for events like "workflow_rule"
            (docs/feature-specs/06-automation-workflow-sla.md, "Moteur de regles
            d'automatisation" in plane-selfhost) whose payload
            (`{rule_id, issue_id, actions_applied, status}`) isn't a serialized
            model instance. Same for "workflow_transition" (same doc,
            "Workflows gouvernes multi-etats avec approbations", section 4) -
            see plane/utils/workflow_transition_engine.py.

    Returns:
        None

    Note:
        The function silently returns on ObjectDoesNotExist exceptions to handle
        race conditions where objects might have been deleted.
    """
    try:
        webhooks = Webhook.objects.filter(workspace__slug=slug, is_active=True)

        if event == "project":
            webhooks = webhooks.filter(project=True)

        if event == "issue":
            webhooks = webhooks.filter(issue=True)

        if event == "module" or event == "module_issue":
            webhooks = webhooks.filter(module=True)

        if event == "cycle" or event == "cycle_issue":
            webhooks = webhooks.filter(cycle=True)

        if event == "issue_comment":
            webhooks = webhooks.filter(issue_comment=True)

        if event == "workflow_rule":
            webhooks = webhooks.filter(workflow_rule=True)

        if event == "workflow_transition":
            webhooks = webhooks.filter(workflow_transition=True)

        if event == "figma_link":
            webhooks = webhooks.filter(figma_link=True)

        if event == "pull_request_linked":
            webhooks = webhooks.filter(pull_request_linked=True)

        if event == "pull_request_state_changed":
            webhooks = webhooks.filter(pull_request_state_changed=True)

        if event == "merge_request_linked":
            webhooks = webhooks.filter(merge_request_linked=True)

        if event == "merge_request_state_changed":
            webhooks = webhooks.filter(merge_request_state_changed=True)

        if event == "merge_request_merged":
            webhooks = webhooks.filter(merge_request_merged=True)

        if event == "issue_triage_suggestion":
            webhooks = webhooks.filter(issue_triage_suggestion=True)

        if event in WORKSPACE_SECURITY_EVENTS:
            webhooks = webhooks.filter(workspace_security=True)

        event_data = (
            event_data_override
            if event_data_override is not None
            else ({"id": event_id} if verb == "deleted" else get_model_data(event=event, event_id=event_id))
        )

        # Category 9 feature 7 (docs/feature-specs/09-ai-features.md "7.
        # Type d'acteur agent de premiere classe" in plane-selfhost,
        # exigence 12) - `actor_type` (human|agent) on the issue/
        # issue_comment payload, derived from `actor.is_bot` broadly (not
        # specifically WORKSPACE_AGENT - any bot actor, including the
        # category-7 integration bots, is equally "not a human" from an
        # external receiver's point of view), so a runner can filter
        # "tickets assigned to me" without a separate API round-trip. No
        # new `Webhook` boolean field needed (spec's own data-model
        # section) - just this payload enrichment.
        if event in ("issue", "issue_comment") and isinstance(event_data, dict) and actor_id:
            actor_is_bot = User.objects.filter(pk=actor_id).values_list("is_bot", flat=True).first()
            event_data["actor_type"] = "agent" if actor_is_bot else "human"

        for webhook in webhooks:
            webhook_send_task.delay(
                webhook_id=webhook.id,
                slug=slug,
                event=event,
                event_data=event_data,
                action=verb,
                current_site=current_site,
                activity={
                    "field": field,
                    "new_value": new_value,
                    "old_value": old_value,
                    "actor": (get_model_data(event="user", event_id=actor_id) if actor_id else None),
                    "old_identifier": old_identifier,
                    "new_identifier": new_identifier,
                },
            )
        return
    except Exception as e:
        # Return if a does not exist error occurs
        if isinstance(e, ObjectDoesNotExist):
            return
        if settings.DEBUG:
            print(e)
        log_exception(e)
        return


@shared_task
def model_activity(model_name, model_id, requested_data, current_instance, actor_id, slug, origin=None):
    """Function takes in two json and computes differences between keys of both the json"""
    if current_instance is None:
        webhook_activity.delay(
            event=model_name,
            verb="created",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=actor_id,
            slug=slug,
            current_site=origin,
            event_id=model_id,
            old_identifier=None,
            new_identifier=None,
        )
        return

    # Load the current instance
    current_instance = json.loads(current_instance) if current_instance is not None else None

    # Loop through all keys in requested data and check the current value and requested value
    for key in requested_data:
        # Check if key is present in current instance or not
        if key in current_instance:
            current_value = current_instance.get(key, None)
            requested_value = requested_data.get(key, None)
            if current_value != requested_value:
                webhook_activity.delay(
                    event=model_name,
                    verb="updated",
                    field=key,
                    old_value=current_value,
                    new_value=requested_value,
                    actor_id=actor_id,
                    slug=slug,
                    current_site=origin,
                    event_id=model_id,
                    old_identifier=None,
                    new_identifier=None,
                )

    return
