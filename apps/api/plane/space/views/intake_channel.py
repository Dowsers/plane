# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import base64
import binascii
import json
import re
import uuid
from io import BytesIO

# Django imports
from django.conf import settings
from django.utils import timezone

# Third party imports
from crum import impersonate
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

# Module imports
from .base import BaseAPIView
from plane.app.serializers.issue import IssueCreateSerializer
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.slack_sync_task import dispatch_slack_channel_notifications
from plane.db.models import (
    EmailIssueThread,
    FileAsset,
    InboundEmailAlias,
    IntakeMessageLog,
    Issue,
    IssueComment,
    Project,
    SlackChannelProjectMapping,
    SlackIssueThread,
    SlackUserConnection,
    SlackWorkspaceConnection,
)
from plane.db.models.intake_channel import (
    EMAIL_INTAKE_EXTERNAL_SOURCE,
    SLACK_LINK_CODE_TTL,
    generate_slack_link_code,
)
from plane.settings.storage import S3Storage
from plane.utils.exception_logger import log_exception
from plane.utils.integration_bot import get_or_create_integration_bot
from plane.db.models.user import BotTypeEnum
from plane.utils.path_validator import sanitize_filename
from plane.utils.slack_client import (
    SlackAPIError,
    add_reaction,
    get_permalink,
    post_ephemeral,
    post_message,
    views_open,
)
from plane.utils.slack_signature import verify_slack_signature

NOT_IMPLEMENTED_MESSAGE = (
    "This is a skeleton endpoint (docs/feature-specs/02-cycles-intake.md, "
    "'Intake omnicanal'). Channel resolution and signature verification are "
    "real; parsing the payload into an issue is not implemented in this "
    "iteration - see docker/api/omnichannel-intake-skeleton/README.md."
)


def _extract_header(headers, name):
    """
    Postmark's inbound-parse payload carries `In-Reply-To`/`References`
    (needed for exigence 9's threading match) inside a `Headers` array of
    `{"Name": ..., "Value": ...}` objects rather than as top-level JSON
    keys - this pulls one out by (case-insensitive) name.
    """
    for header in headers or []:
        if not isinstance(header, dict):
            continue
        if str(header.get("Name", "")).strip().lower() == name.lower():
            return header.get("Value")
    return None


def _create_attachments_for_issue(issue, attachments, project_id, workspace_id):
    """
    Exigence 5 - decodes each Postmark `Attachments[]` entry (base64
    `Content`) and creates a real `FileAsset` for it. Writes bytes
    directly to storage via `S3Storage.upload_file` (a thin
    `s3_client.upload_fileobj` wrapper) rather than through the
    `FileAsset.asset` Django `FileField`'s own `.save()` - this
    codebase's custom `S3Storage.__init__` (plane/settings/storage.py)
    builds its own boto3 client and deliberately does NOT call
    `super().__init__()`, so it never gets the `django-storages`
    `S3Boto3Storage` attributes (e.g. `file_overwrite`) that
    `FileField.save()`'s `get_available_name()` unconditionally reads -
    calling it raises `AttributeError`. `upload_file` is the one
    genuinely-used server-side-direct-write path already proven by
    `authentication/adapter/base.py` (OAuth avatar download), so this
    reuses that exact pattern instead of inventing a second one. An
    oversized attachment is skipped and logged rather than failing the
    whole issue creation (exigence 5's explicit requirement); an upload
    that fails at the storage layer (e.g. bucket unreachable) is skipped
    the same way rather than raising.
    """
    created = []
    storage = S3Storage()
    for attachment in attachments or []:
        if not isinstance(attachment, dict):
            continue
        name = sanitize_filename(str(attachment.get("Name") or "attachment")) or uuid.uuid4().hex
        content_type = attachment.get("ContentType") or "application/octet-stream"
        # Postmark's own ContentType often includes a `; name=...` suffix.
        content_type = content_type.split(";")[0].strip()
        raw_content = attachment.get("Content")
        if not raw_content:
            continue

        try:
            decoded = base64.b64decode(raw_content, validate=True)
        except (binascii.Error, ValueError) as e:
            log_exception(e)
            continue

        if len(decoded) > settings.FILE_SIZE_LIMIT:
            logger_context = {"issue_id": str(issue.id), "name": name, "size": len(decoded)}
            log_exception(Exception(f"Skipped oversized inbound email attachment: {logger_context}"))
            continue

        if content_type not in settings.ATTACHMENT_MIME_TYPES:
            # Not fatal - still attach it, but under a generic content
            # type, consistent with this being best-effort capture of
            # whatever an external sender attached rather than a strict
            # upload form the sender can correct and resubmit.
            content_type = "application/octet-stream"

        object_name = f"{workspace_id}/{uuid.uuid4().hex}-{name}"
        try:
            # upload_file's own except clause only catches boto3's
            # ClientError (a real, reachable-but-rejected S3/MinIO call) -
            # an instance with no storage bucket configured at all raises
            # a raw TypeError from deep inside s3transfer before ever
            # making a network call. Caught here too so a
            # storage-misconfigured instance degrades to "issue created,
            # attachment skipped" rather than 500ing the whole webhook
            # (same exigence 5 guarantee as the oversized-attachment
            # case above).
            uploaded = storage.upload_file(
                file_obj=BytesIO(decoded), object_name=object_name, content_type=content_type
            )
        except Exception as e:
            log_exception(e)
            uploaded = False
        if not uploaded:
            continue

        asset = FileAsset.objects.create(
            attributes={"name": name, "type": content_type, "size": len(decoded)},
            asset=object_name,
            size=len(decoded),
            workspace_id=workspace_id,
            project_id=project_id,
            issue_id=issue.id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            is_uploaded=True,
        )
        created.append(asset)
    return created


class EmailInboundWebhookEndpoint(BaseAPIView):
    """
    Receives inbound-parse webhooks from a provider. Target payload shape
    for this iteration is Postmark's "Inbound" webhook (JSON with
    `Subject`/`TextBody`/`HtmlBody`/`Attachments[]` base64 - chosen to
    avoid a raw-MIME parsing dependency, see
    docs/feature-specs/14-pricing-gap-remediation.md, "14d...", section 1,
    exigence 2). A SES-style raw-MIME connector is a documented future
    extension point (Hors perimetre), not implemented here.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        payload = request.data if isinstance(request.data, dict) else json.loads(request.body or "{}")

        to_address = str(payload.get("to") or payload.get("To") or payload.get("MailboxHash") or "").strip().lower()
        local_part = to_address.split("@")[0] if "@" in to_address else to_address

        alias = (
            InboundEmailAlias.objects.filter(local_part=local_part, is_active=True)
            .select_related("intake_channel")
            .first()
        )
        if alias is None or not alias.intake_channel.is_enabled:
            # Generic response - no confirmation of which aliases exist
            # (exigence 11/User Story 6).
            return Response({"error": "Unknown recipient"}, status=status.HTTP_404_NOT_FOUND)

        message_id = str(payload.get("MessageID") or payload.get("Message-Id") or payload.get("message_id") or "")

        # Exigence 8 - idempotent against provider retries: a Message-Id
        # already logged for this project is never processed twice.
        if message_id and IntakeMessageLog.objects.filter(
            project_id=alias.project_id, channel_type="EMAIL", external_message_id=message_id
        ).exists():
            return Response(status=status.HTTP_200_OK)

        IntakeMessageLog.objects.create(
            project_id=alias.project_id,
            workspace_id=alias.workspace_id,
            direction="INBOUND",
            channel_type="EMAIL",
            external_message_id=message_id or None,
            raw_payload=payload,
        )

        from_address = str(payload.get("From") or payload.get("from") or "").strip()
        # Postmark also sends a parsed `FromFull.Email` - prefer the bare
        # address when present since `From` can be `"Name" <addr>`.
        from_full = payload.get("FromFull") or {}
        if isinstance(from_full, dict) and from_full.get("Email"):
            from_address = str(from_full["Email"]).strip()

        subject = str(payload.get("Subject") or "(no subject)").strip()[:255]
        text_body = payload.get("TextBody") or ""
        html_body = payload.get("HtmlBody") or ""
        description_html = html_body or (f"<p>{text_body}</p>" if text_body else "<p></p>")

        headers = payload.get("Headers") or []
        in_reply_to = _extract_header(headers, "In-Reply-To") or ""
        references = _extract_header(headers, "References") or ""
        candidate_ids = [rid.strip() for rid in (in_reply_to + " " + references).split() if rid.strip()]

        thread = None
        if candidate_ids:
            thread = EmailIssueThread.objects.filter(
                intake_channel_id=alias.intake_channel_id, outbound_message_id__in=candidate_ids
            ).select_related("issue").first()

        email_bot = get_or_create_integration_bot(alias.workspace, BotTypeEnum.EMAIL_BOT)

        if thread is not None:
            # Exigence 9 - a reply to a known outbound notification is a
            # comment on the existing issue, not a new issue.
            with impersonate(email_bot):
                IssueComment.objects.create(
                    issue_id=thread.issue_id,
                    project_id=thread.project_id,
                    workspace_id=thread.workspace_id,
                    actor=email_bot,
                    comment_html=description_html,
                    comment_stripped=text_body or subject,
                    external_source="email",
                    external_id=message_id or None,
                )
            try:
                issue_activity.delay(
                    type="comment.activity.created",
                    requested_data=json.dumps({"comment_html": description_html}),
                    actor_id=str(email_bot.id),
                    issue_id=str(thread.issue_id),
                    project_id=str(thread.project_id),
                    current_instance=None,
                    epoch=int(timezone.now().timestamp()),
                    notification=True,
                )
            except Exception as e:
                log_exception(e)
            _create_attachments_for_issue(
                thread.issue, payload.get("Attachments"), thread.project_id, thread.workspace_id
            )
            return Response(status=status.HTTP_200_OK)

        # Exigence 4 - new issue in the project the alias belongs to.
        project = Project.objects.filter(pk=alias.project_id).first()
        if project is None:
            return Response({"error": "Unknown recipient"}, status=status.HTTP_404_NOT_FOUND)

        issue = create_issue_from_email(project, subject, description_html, email_bot, sender_address=from_address)

        _create_attachments_for_issue(issue, payload.get("Attachments"), project.id, project.workspace_id)

        # Exigence 7's audit/dedup requirement is satisfied by `log`
        # itself (found via `external_message_id` on retry, see the
        # idempotency check above) rather than by populating
        # `log.intake_issue` - that FK points at `IntakeIssue` (the
        # web-form staging table), and the email path creates a real
        # `Issue` directly rather than staging through `IntakeIssue` (see
        # Questions ouvertes #1 in the spec); the created Issue is instead
        # discoverable via the new `EmailIssueThread` row created below.

        return Response(status=status.HTTP_200_OK)


def _resolve_slack_actor(connection, slack_user_id):
    """
    Exigence 3 - a Slack action is attributed to the linked Plane user if
    one exists, otherwise to the workspace's "Slack Bot" system user
    (get_or_create_integration_bot), never silently to some other human.
    """
    user_connection = SlackUserConnection.objects.filter(
        slack_connection=connection, slack_user_id=slack_user_id, user__isnull=False
    ).first()
    if user_connection is not None:
        return user_connection.user, True
    return get_or_create_integration_bot(connection.workspace, BotTypeEnum.SLACK_BOT), False


def _default_state_for_project(project):
    from plane.db.models import State, StateGroup

    if project.default_state_id:
        state = State.objects.filter(pk=project.default_state_id, project_id=project.id).first()
        if state is not None:
            return state
    return State.objects.filter(project_id=project.id, group=StateGroup.BACKLOG.value).order_by("sequence").first()


def create_issue_from_slack(project, name, description_html, actor_user):
    """
    Shared issue-creation helper for both the `/plane create <text>`
    inline fallback and the (untestable-end-to-end) Block Kit modal
    submission path - single choke point so both call sites stay
    consistent, mirroring the pattern already proven by
    bgtasks/recurring_issue_task.py::materialize_occurrence (
    IssueCreateSerializer + crum.impersonate works with zero HTTP request
    context).
    """
    state = _default_state_for_project(project)
    payload = {"name": name[:255], "description_html": description_html or "<p></p>"}
    if state is not None:
        payload["state_id"] = str(state.id)

    with impersonate(actor_user):
        serializer = IssueCreateSerializer(
            data=payload,
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        issue = serializer.save()

        requested_data = json.dumps({"name": issue.name, "description_html": issue.description_html})

        def _fire_activity():
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=requested_data,
                actor_id=str(actor_user.id),
                issue_id=str(issue.id),
                project_id=str(project.id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
            )
            dispatch_slack_channel_notifications.delay(
                project_id=str(project.id),
                event_type="issue_created",
                summary_text=f"New issue created from Slack: {issue.name}",
                payload_summary={"issue_id": str(issue.id)},
            )

        _fire_activity()

    return issue


def create_issue_from_email(project, name, description_html, actor_user, sender_address):
    """
    14d ("Intake Email and Slack", levee du squelette, section 1) - the
    email-channel equivalent of `create_issue_from_slack` above, same
    choke-point shape (IssueCreateSerializer + crum.impersonate). Sets
    `external_source`/`external_id` on the created issue (exigence 6/9)
    so the outbound reply-notification task
    (plane.bgtasks.intake_email_task.send_issue_comment_email_reply) can
    later find the original sender's address without a second model.

    Does NOT create an `EmailIssueThread` row itself - the very first one
    is created lazily by `send_issue_comment_email_reply` the first time
    a team member actually comments (that's the first real outbound
    Message-ID that can plausibly receive a reply). Until a team member
    replies, an external sender's follow-up email on the same subject
    simply won't match any `EmailIssueThread` and will be treated as a
    new issue - an accepted MVP gap for this iteration (see Hors
    perimetre / Questions ouvertes), no different in spirit from the
    Slack side only anchoring `SlackIssueThread` once the bot's own
    confirmation message exists.
    """
    state = _default_state_for_project(project)
    payload = {"name": name[:255], "description_html": description_html or "<p></p>"}
    if state is not None:
        payload["state_id"] = str(state.id)

    with impersonate(actor_user):
        serializer = IssueCreateSerializer(
            data=payload,
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
            },
        )
        serializer.is_valid(raise_exception=True)
        issue = serializer.save()
        if sender_address:
            Issue.objects.filter(pk=issue.id).update(
                external_source=EMAIL_INTAKE_EXTERNAL_SOURCE, external_id=sender_address[:255]
            )
            issue.external_source = EMAIL_INTAKE_EXTERNAL_SOURCE
            issue.external_id = sender_address[:255]

        requested_data = json.dumps({"name": issue.name, "description_html": issue.description_html})
        try:
            # The Issue row is already committed at this point - a
            # broker hiccup dispatching the (best-effort) activity-feed/
            # notification task must never turn into a 500 on the
            # inbound webhook (which would make an external email
            # provider retry and could duplicate the issue despite the
            # exigence 8 idempotency check being keyed on Message-Id
            # that's already recorded by now).
            issue_activity.delay(
                type="issue.activity.created",
                requested_data=requested_data,
                actor_id=str(actor_user.id),
                issue_id=str(issue.id),
                project_id=str(project.id),
                current_instance=None,
                epoch=int(timezone.now().timestamp()),
                notification=True,
            )
        except Exception as e:
            log_exception(e)

    return issue


class SlackSlashCommandEndpoint(BaseAPIView):
    """
    `/plane create [title]` and `/plane link` (exigence 2, 3, 4 - "3. App
    Slack open-source"). Slack posts slash commands as
    application/x-www-form-urlencoded (a materially different shape from
    the Events API's JSON body or the interactive endpoint's single
    `payload` field) - handled as its own endpoint rather than folded
    into SlackInteractiveWebhookEndpoint.

    Two `/plane create` behaviors, both real:
    - `text` provided ("/plane create Fix the login bug"): creates the
      issue immediately in the channel's mapped project (documented
      simpler fallback - fully testable, no live Slack round-trip
      needed).
    - `text` empty ("/plane create"): opens a Block Kit modal via
      `views.open` for the fuller exigence 4 field set (project/title/
      description/assignee/label/priority/state). Real request-building
      code, but the actual open (and the `view_submission` it would
      trigger) needs a live `trigger_id` a real Slack client produces -
      NOT verifiable end-to-end from this sandbox. See
      docker/api/slack-app/README.md.
    """

    permission_classes = [AllowAny]

    def post(self, request):
        body = request.body.decode("utf-8") if isinstance(request.body, bytes) else str(request.body)
        data = request.data

        team_id = data.get("team_id")
        connection = SlackWorkspaceConnection.objects.filter(slack_team_id=team_id, is_active=True).first()
        if connection is None:
            return Response(
                {"response_type": "ephemeral", "text": "Unknown Slack workspace."}, status=status.HTTP_200_OK
            )

        if not verify_slack_signature(
            connection.signing_secret,
            request.headers.get("X-Slack-Request-Timestamp"),
            body,
            request.headers.get("X-Slack-Signature"),
        ):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        command = (data.get("command") or "").strip()
        text = (data.get("text") or "").strip()
        channel_id = data.get("channel_id")
        slack_user_id = data.get("user_id")

        if command == "/plane link":
            code = generate_slack_link_code()
            pending, _ = SlackUserConnection.objects.update_or_create(
                slack_connection=connection,
                slack_user_id=slack_user_id,
                user=None,
                defaults={
                    "workspace_id": connection.workspace_id,
                    "verification_code": code,
                    "code_expires_at": timezone.now() + SLACK_LINK_CODE_TTL,
                },
            )
            return Response(
                {
                    "response_type": "ephemeral",
                    "text": (
                        f"To link your Slack account, go to Plane > Workspace Settings > Integrations > Slack "
                        f"and enter this code: *{code}* (expires in 15 minutes)."
                    ),
                },
                status=status.HTTP_200_OK,
            )

        if command == "/plane create":
            mapping = SlackChannelProjectMapping.objects.filter(
                slack_connection=connection, slack_channel_id=channel_id, is_active=True
            ).select_related("project").first()

            if not text:
                if not mapping:
                    return Response(
                        {
                            "response_type": "ephemeral",
                            "text": "This channel isn't mapped to a Plane project yet - an admin needs to add a "
                            "channel mapping first, or use `/plane create <title>`.",
                        },
                        status=status.HTTP_200_OK,
                    )
                trigger_id = data.get("trigger_id")
                try:
                    views_open(
                        connection.bot_access_token,
                        trigger_id,
                        _build_create_issue_modal(mapping.project),
                    )
                except SlackAPIError as e:
                    log_exception(e)
                return Response(status=status.HTTP_200_OK)

            if not mapping:
                return Response(
                    {
                        "response_type": "ephemeral",
                        "text": "This channel isn't mapped to a Plane project - ask an admin to add a mapping first.",
                    },
                    status=status.HTTP_200_OK,
                )

            actor_user, is_linked = _resolve_slack_actor(connection, slack_user_id)
            issue = create_issue_from_slack(mapping.project, text, "", actor_user)

            thread_ts = None
            try:
                message = post_message(
                    connection.bot_access_token,
                    channel=channel_id,
                    text=f"Issue created: {issue.name} ({issue.project.identifier}-{issue.sequence_id})",
                )
                thread_ts = message.get("ts")
            except SlackAPIError as e:
                log_exception(e)

            if thread_ts:
                SlackIssueThread.objects.get_or_create(
                    slack_channel_id=channel_id,
                    slack_message_ts=thread_ts,
                    defaults={
                        "issue": issue,
                        "project_id": issue.project_id,
                        "workspace_id": issue.workspace_id,
                        "slack_connection": connection,
                        "source": "created_from_slack",
                    },
                )

            return Response(
                {
                    "response_type": "ephemeral",
                    "text": f"Created {issue.project.identifier}-{issue.sequence_id}: {issue.name}",
                },
                status=status.HTTP_200_OK,
            )

        return Response({"response_type": "ephemeral", "text": "Unknown command."}, status=status.HTTP_200_OK)


def _build_create_issue_modal(
    project, prefill_title="", prefill_description="", source_channel_id=None, source_message_ts=None
):
    """
    Real Block Kit JSON (exigence 4's field set). Building this is
    testable (it's just a dict); actually opening/receiving it back via
    `view_submission` is not verifiable from this sandbox - see the class
    docstring above. `source_channel_id`/`source_message_ts` (set only
    when opened from a message shortcut) are threaded through
    `private_metadata` so `_handle_view_submission` can react with a
    checkmark and anchor the SlackIssueThread on the ORIGINAL message
    (exigence 6/7) instead of creating a fresh confirmation message.
    """
    metadata = {"project_id": str(project.id)}
    if source_channel_id and source_message_ts:
        metadata["source_channel_id"] = source_channel_id
        metadata["source_message_ts"] = source_message_ts
    return {
        "type": "modal",
        "callback_id": "plane_create_issue",
        "private_metadata": json.dumps(metadata),
        "title": {"type": "plain_text", "text": "Create Plane issue"},
        "submit": {"type": "plain_text", "text": "Create"},
        "blocks": [
            {
                "type": "input",
                "block_id": "title_block",
                "label": {"type": "plain_text", "text": "Title"},
                "element": {
                    "type": "plain_text_input",
                    "action_id": "title",
                    "initial_value": prefill_title[:255],
                },
            },
            {
                "type": "input",
                "block_id": "description_block",
                "optional": True,
                "label": {"type": "plain_text", "text": "Description"},
                "element": {
                    "type": "plain_text_input",
                    "action_id": "description",
                    "multiline": True,
                    "initial_value": prefill_description[:3000],
                },
            },
        ],
    }


class SlackEventsWebhookEndpoint(BaseAPIView):
    """
    Slack Events API receiver. Implements the URL verification handshake,
    real signature verification, and now (category 7 + 14d section 2):
    - `message` events with a `thread_ts` matching a known
      SlackIssueThread -> creates a Plane comment (exigence 9).
    - `app_uninstalled` -> deactivates the workspace connection and its
      channel mappings (exigence 14).
    - `app_mention` (14d, section 2) -> creates an issue from the
      mention's text in the channel's mapped project - see
      `_handle_app_mention`. Every other `event_type` still returns a
      501 with `NOT_IMPLEMENTED_MESSAGE` (14d exigence 11 - no silent
      success on an uncovered gap).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        body = request.body.decode("utf-8") if isinstance(request.body, bytes) else str(request.body)
        payload = request.data if isinstance(request.data, dict) else json.loads(body or "{}")

        # Slack's one-time URL verification challenge - required before
        # Slack will start sending real events, and independently testable.
        if payload.get("type") == "url_verification":
            return Response({"challenge": payload.get("challenge")}, status=status.HTTP_200_OK)

        team_id = payload.get("team_id")
        connection = SlackWorkspaceConnection.objects.filter(slack_team_id=team_id, is_active=True).first()
        if connection is None:
            return Response({"error": "Unknown Slack team"}, status=status.HTTP_404_NOT_FOUND)

        signature_valid = verify_slack_signature(
            connection.signing_secret,
            request.headers.get("X-Slack-Request-Timestamp"),
            body,
            request.headers.get("X-Slack-Signature"),
        )
        if not signature_valid:
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        event = payload.get("event", {}) or {}
        # Pre-existing bug found and fixed here (not introduced by
        # category 7): IntakeMessageLog is a ProjectBaseModel (`project`
        # is a required, non-nullable FK - see
        # plane/db/models/intake_channel.py) but this call never set it,
        # so ProjectBaseModel.save()'s `self.workspace = self.project.workspace`
        # raised Project.RelatedObjectDoesNotExist for ANY payload that
        # reached this line - meaning this call site was apparently never
        # exercised end-to-end by a real event before category 7's tests
        # exposed it (the Category 2 skeleton always returned 501
        # immediately after, but AFTER this line, not before it). A
        # workspace-level Slack event isn't inherently tied to one
        # project, so the project is resolved (best-effort) via the
        # event's channel<->project mapping; if no mapping exists yet,
        # the log entry is skipped entirely rather than crashing the
        # whole webhook (IntakeMessageLog is best-effort observability
        # per its own docstring, not required for correctness).
        log_project_id = (
            SlackChannelProjectMapping.objects.filter(
                slack_connection=connection, slack_channel_id=event.get("channel")
            )
            .values_list("project_id", flat=True)
            .first()
        )
        if log_project_id is not None:
            IntakeMessageLog.objects.create(
                project_id=log_project_id,
                workspace_id=connection.workspace_id,
                direction="INBOUND",
                channel_type="SLACK",
                external_message_id=str(event.get("ts", "")),
                raw_payload=payload,
            )

        event_type = payload.get("event", {}).get("type") if "event" in payload else payload.get("type")

        if event_type == "app_uninstalled":
            connection.is_active = False
            connection.save(update_fields=["is_active"])
            SlackChannelProjectMapping.objects.filter(slack_connection=connection).update(is_active=False)
            return Response(status=status.HTTP_200_OK)

        if event_type == "message":
            self._handle_thread_reply(connection, event)
            return Response(status=status.HTTP_200_OK)

        if event_type == "app_mention":
            self._handle_app_mention(connection, event)
            return Response(status=status.HTTP_200_OK)

        return Response({"error": NOT_IMPLEMENTED_MESSAGE}, status=status.HTTP_501_NOT_IMPLEMENTED)

    def _handle_thread_reply(self, connection, event):
        """
        Exigence 9/10 - Slack -> Plane half of the bidirectional comment
        sync. Anti-loop: any event carrying a `bot_id` (posted by ANY
        Slack bot, including our own - Slack sets this on every message
        our own `chat.postMessage` calls produce) is ignored outright,
        before even looking up a thread. This is what stops
        sync_issue_comment_to_slack's own outbound post from being read
        back in here as a new human reply.
        """
        if event.get("bot_id"):
            return
        if event.get("subtype") is not None:
            # Message edits/deletes/joins etc. - only plain new messages
            # are treated as comment replies in this iteration.
            return

        thread_ts = event.get("thread_ts")
        channel_id = event.get("channel")
        ts = event.get("ts")
        if not thread_ts or not channel_id or not ts:
            return

        thread = SlackIssueThread.objects.filter(slack_channel_id=channel_id, slack_message_ts=thread_ts).first()
        if thread is None:
            return

        # Idempotency - Slack (and our own retry handling) may redeliver
        # the same event; a comment already recorded for this exact
        # Slack message must never be duplicated.
        if IssueComment.objects.filter(issue_id=thread.issue_id, external_source="slack", external_id=ts).exists():
            return

        slack_user_id = event.get("user")
        actor_user, is_linked = _resolve_slack_actor(connection, slack_user_id)
        text = event.get("text", "")
        comment_html = f"<p>{text}</p>" if is_linked else f"<p><em>via Slack ({slack_user_id}):</em> {text}</p>"

        with impersonate(actor_user):
            IssueComment.objects.create(
                issue_id=thread.issue_id,
                project_id=thread.project_id,
                workspace_id=thread.workspace_id,
                actor=actor_user,
                comment_html=comment_html,
                comment_stripped=text,
                external_source="slack",
                external_id=ts,
            )
        issue_activity.delay(
            type="comment.activity.created",
            requested_data=json.dumps({"comment_html": comment_html}),
            actor_id=str(actor_user.id),
            issue_id=str(thread.issue_id),
            project_id=str(thread.project_id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
        )

    def _handle_app_mention(self, connection, event):
        """
        14d ("Intake Email and Slack", levee du squelette, section 2,
        exigence 1-10) - mentioning the bot in a channel creates an issue
        from the mention's text, the most natural first-contact gesture
        with the integration (no slash command / message shortcut /
        modal needed). Reuses every resolution/creation primitive already
        proven by the other two Slack creation paths
        (SlackSlashCommandEndpoint, SlackInteractiveWebhookEndpoint) -
        channel<->project mapping, actor resolution, create_issue_from_slack,
        SlackIssueThread anchoring - rather than introducing any new logic
        of its own.

        Exigence 3/9 - an `app_mention` posted IN a thread
        (`event.get("thread_ts")` set) is deliberately left to
        `_handle_thread_reply` (already called for every plain `message`
        event Slack also sends alongside `app_mention` for the same
        post) rather than creating a second issue for the same message -
        see Questions ouvertes #1, decided this way for this iteration
        since Slack always emits both event types for an in-thread
        mention and `_handle_thread_reply` already owns "reply in a known
        thread" semantics.
        """
        if event.get("thread_ts"):
            return

        channel_id = event.get("channel")
        ts = event.get("ts")
        if not channel_id or not ts:
            return

        # Exigence 10 - dedup a redelivered app_mention on the same
        # principle as _handle_thread_reply: a SlackIssueThread already
        # anchored to this exact message means it was already handled.
        if SlackIssueThread.objects.filter(slack_channel_id=channel_id, slack_message_ts=ts).exists():
            return

        mapping = (
            SlackChannelProjectMapping.objects.filter(
                slack_connection=connection, slack_channel_id=channel_id, is_active=True
            )
            .select_related("project")
            .first()
        )
        if mapping is None:
            try:
                post_ephemeral(
                    connection.bot_access_token,
                    channel=channel_id,
                    user=event.get("user"),
                    text=(
                        "This channel isn't mapped to a Plane project yet - an admin needs to add a channel "
                        "mapping first (Workspace Settings > Integrations > Slack)."
                    ),
                )
            except SlackAPIError as e:
                log_exception(e)
            return

        # Strips the leading `<@BOT_ID>` mention token Slack prefixes the
        # text with - whatever remains becomes the issue title.
        text = re.sub(r"^\s*<@[A-Z0-9]+>\s*", "", event.get("text", "") or "").strip()
        if not text:
            try:
                post_message(
                    connection.bot_access_token,
                    channel=channel_id,
                    text="I couldn't find any text to create an issue from - try `@Plane <issue title>`.",
                    thread_ts=ts,
                )
            except SlackAPIError as e:
                log_exception(e)
            return

        slack_user_id = event.get("user")
        actor_user, _ = _resolve_slack_actor(connection, slack_user_id)

        try:
            issue = create_issue_from_slack(mapping.project, text, "", actor_user)
        except Exception as e:
            # Exigence 9 - any unexpected failure (including a Slack API
            # error surfaced by create_issue_from_slack's own
            # dispatch_slack_channel_notifications call) is caught here so
            # Slack always gets a 200 and never retries this event in a
            # loop; still logged for visibility.
            log_exception(e)
            return

        confirmation_ts = None
        try:
            message = post_message(
                connection.bot_access_token,
                channel=channel_id,
                text=f"Created {issue.project.identifier}-{issue.sequence_id}: {issue.name}",
                thread_ts=ts,
            )
            confirmation_ts = message.get("ts")
            add_reaction(connection.bot_access_token, channel_id, ts)
        except SlackAPIError as e:
            log_exception(e)

        SlackIssueThread.objects.get_or_create(
            slack_channel_id=channel_id,
            slack_message_ts=confirmation_ts or ts,
            defaults={
                "issue": issue,
                "project_id": issue.project_id,
                "workspace_id": issue.workspace_id,
                "slack_connection": connection,
                "source": "created_from_slack",
            },
        )


class SlackInteractiveWebhookEndpoint(BaseAPIView):
    """
    Slack interactive components. Signature verification is real. Now
    handles (category 7):
    - `message_action` (message shortcut, exigence 1/5) -> opens a
      prefilled Block Kit modal. Real request-building code; the actual
      open/submission round-trip is untestable here (needs a live
      `trigger_id`), same caveat as SlackSlashCommandEndpoint.
    - `view_submission` -> creates the issue from the modal's field
      values (works whether reached via the slash command or the message
      shortcut - both use `callback_id="plane_create_issue"`).
    """

    permission_classes = [AllowAny]

    def post(self, request):
        body = request.body.decode("utf-8") if isinstance(request.body, bytes) else str(request.body)
        payload_raw = request.data.get("payload") if hasattr(request, "data") else None
        payload = json.loads(payload_raw) if payload_raw else {}

        team_id = (payload.get("team") or {}).get("id")
        connection = SlackWorkspaceConnection.objects.filter(slack_team_id=team_id, is_active=True).first()
        if connection is None:
            return Response({"error": "Unknown Slack team"}, status=status.HTTP_404_NOT_FOUND)

        signature_valid = verify_slack_signature(
            connection.signing_secret,
            request.headers.get("X-Slack-Request-Timestamp"),
            body,
            request.headers.get("X-Slack-Signature"),
        )
        if not signature_valid:
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        payload_type = payload.get("type")

        if payload_type == "message_action" and payload.get("callback_id") == "plane_create_issue_shortcut":
            return self._handle_message_shortcut(connection, payload)

        if payload_type == "view_submission" and (payload.get("view") or {}).get("callback_id") == "plane_create_issue":
            return self._handle_view_submission(connection, payload)

        return Response({"error": NOT_IMPLEMENTED_MESSAGE}, status=status.HTTP_501_NOT_IMPLEMENTED)

    def _handle_message_shortcut(self, connection, payload):
        """Exigence 5 - prefills title with the message's first line,
        description with the full body, per the spec. Untestable
        end-to-end (needs a live trigger_id) - see class docstring."""
        message = payload.get("message", {}) or {}
        text = message.get("text", "")
        first_line = text.split("\n", 1)[0]
        channel_id = (payload.get("channel") or {}).get("id")

        mapping = SlackChannelProjectMapping.objects.filter(
            slack_connection=connection, slack_channel_id=channel_id, is_active=True
        ).select_related("project").first()
        if mapping is None:
            return Response(status=status.HTTP_200_OK)

        permalink = None
        try:
            permalink_data = get_permalink(connection.bot_access_token, channel_id, message.get("ts"))
            permalink = permalink_data.get("permalink")
        except SlackAPIError as e:
            log_exception(e)

        description = text
        if permalink:
            description = f"{text}\n\nOriginal Slack message: {permalink}"

        try:
            views_open(
                connection.bot_access_token,
                payload.get("trigger_id"),
                _build_create_issue_modal(
                    mapping.project,
                    prefill_title=first_line,
                    prefill_description=description,
                    source_channel_id=channel_id,
                    source_message_ts=message.get("ts"),
                ),
            )
        except SlackAPIError as e:
            log_exception(e)
        return Response(status=status.HTTP_200_OK)

    def _handle_view_submission(self, connection, payload):
        view = payload.get("view", {})
        metadata = json.loads(view.get("private_metadata") or "{}")
        project = Project.objects.filter(pk=metadata.get("project_id")).first()
        if project is None:
            return Response({"response_action": "clear"}, status=status.HTTP_200_OK)

        values = view.get("state", {}).get("values", {})
        title = values.get("title_block", {}).get("title", {}).get("value", "Untitled")
        description = values.get("description_block", {}).get("description", {}).get("value", "")

        slack_user_id = (payload.get("user") or {}).get("id")
        actor_user, _ = _resolve_slack_actor(connection, slack_user_id)
        issue = create_issue_from_slack(project, title, f"<p>{description}</p>" if description else "", actor_user)

        # Exigence 6/7 - when this modal was opened from a message
        # shortcut, react with a checkmark on the ORIGINAL message and
        # anchor the SlackIssueThread there (rather than posting a new
        # confirmation message), so future thread replies on that exact
        # message sync as comments.
        source_channel_id = metadata.get("source_channel_id")
        source_message_ts = metadata.get("source_message_ts")
        if source_channel_id and source_message_ts:
            try:
                add_reaction(connection.bot_access_token, source_channel_id, source_message_ts)
            except SlackAPIError as e:
                log_exception(e)
            SlackIssueThread.objects.get_or_create(
                slack_channel_id=source_channel_id,
                slack_message_ts=source_message_ts,
                defaults={
                    "issue": issue,
                    "project_id": issue.project_id,
                    "workspace_id": issue.workspace_id,
                    "slack_connection": connection,
                    "source": "created_from_slack",
                },
            )

        try:
            post_ephemeral(
                connection.bot_access_token,
                channel=slack_user_id,
                user=slack_user_id,
                text=f"Created {issue.project.identifier}-{issue.sequence_id}: {issue.name}",
            )
        except SlackAPIError as e:
            log_exception(e)

        return Response({"response_action": "clear"}, status=status.HTTP_200_OK)
