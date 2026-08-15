# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Hand-curated (not raw `makemigrations` output) - this session's working
# tree was shared, concurrently, with two other agents building the rest
# of category 7 (GitHub/GitLab, Slack/Figma) at the same time. A plain
# `manage.py makemigrations` run here would have interleaved their
# in-progress, not-yet-finalized model changes into this file (confirmed:
# it did, on the first attempt - discarded). This file's operations were
# extracted from that generated output, keeping only the operations that
# correspond to this session's own models
# (docs/feature-specs/07-integrations-git.md, features 5 "Integration
# Sentry native" and 6 "Pont support client type Zendesk/Front", in
# plane-selfhost) - every field/constraint/index definition below is
# copied verbatim from Django's own autodetector output for these models,
# not hand-typed from scratch.

from django.conf import settings
import django.contrib.postgres.fields
from django.db import migrations, models
import django.db.models.deletion
import plane.db.fields
import plane.db.models.support
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0151_remove_legacy_integration_models'),
    ]

    operations = [
        migrations.CreateModel(
            name='WorkspaceSupportConnector',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('provider', models.CharField(choices=[('zendesk', 'Zendesk'), ('front', 'Front'), ('generic_webhook', 'Generic Webhook')], max_length=32)),
                ('name', models.CharField(max_length=255)),
                ('domain', models.CharField(blank=True, max_length=255)),
                ('api_token', plane.db.fields.EncryptedTextField(blank=True)),
                ('token_last_4', models.CharField(blank=True, max_length=4)),
                ('webhook_secret', plane.db.fields.EncryptedTextField(blank=True)),
                ('inbound_token', models.CharField(default=plane.db.models.support.get_inbound_token, editable=False, max_length=64, unique=True)),
                ('reopen_ticket_on_resolve', models.BooleanField(default=True)),
                ('reopen_note_visibility', models.CharField(choices=[('internal', 'Internal'), ('public', 'Public')], default='internal', max_length=10)),
                ('is_enabled', models.BooleanField(default=True)),
                ('generic_field_mapping', models.JSONField(blank=True, default=dict)),
                ('connected_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='support_connectors_made', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('default_project', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.project')),
                ('default_state', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.state')),
                ('project', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Workspace Support Connector',
                'verbose_name_plural': 'Workspace Support Connectors',
                'db_table': 'workspace_support_connectors',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='WorkspaceSentryConnection',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('org_slug', models.CharField(max_length=255)),
                ('base_url', models.URLField(default='https://sentry.io', help_text='Sentry base URL - override for self-hosted/on-premise Sentry (spec open question 2).')),
                ('api_token', plane.db.fields.EncryptedTextField()),
                ('token_last_4', models.CharField(blank=True, max_length=4)),
                ('webhook_secret', plane.db.fields.EncryptedTextField(blank=True, help_text="Sentry Internal Integration 'Client Secret' - verifies Sentry-Hook-Signature (exigence 11).")),
                ('is_active', models.BooleanField(default=True)),
                ('connected_at', models.DateTimeField(blank=True, null=True)),
                ('last_validated_at', models.DateTimeField(blank=True, null=True)),
                ('connected_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='sentry_connections_made', to=settings.AUTH_USER_MODEL)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Workspace Sentry Connection',
                'verbose_name_plural': 'Workspace Sentry Connections',
                'db_table': 'workspace_sentry_connections',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='SentryProjectSync',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('sentry_project_slug', models.CharField(max_length=255)),
                ('auto_resolve', models.BooleanField(default=True)),
                ('auto_reopen', models.BooleanField(default=True)),
                ('sync_comments_on_new_events', models.BooleanField(default=True)),
                ('comment_throttle_minutes', models.PositiveIntegerField(default=60)),
                ('is_active', models.BooleanField(default=True)),
                ('connection', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_syncs', to='db.workspacesentryconnection')),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('default_state', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.state')),
                ('label', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.label')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('reopen_state', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.state')),
                ('resolved_state', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='+', to='db.state')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Sentry Project Sync',
                'verbose_name_plural': 'Sentry Project Syncs',
                'db_table': 'sentry_project_syncs',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='IssueSupportTicket',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('external_ticket_id', models.CharField(max_length=255)),
                ('external_ticket_url', models.URLField(blank=True, max_length=1000)),
                ('requester_email', models.EmailField(blank=True, max_length=254, null=True)),
                ('requester_name', models.CharField(blank=True, max_length=255, null=True)),
                ('subject', models.CharField(blank=True, max_length=500)),
                ('priority', models.CharField(blank=True, max_length=50)),
                ('tags', django.contrib.postgres.fields.ArrayField(base_field=models.CharField(max_length=100), blank=True, default=list, size=None)),
                ('last_synced_status', models.CharField(blank=True, max_length=100)),
                ('last_message_snippet', models.CharField(blank=True, max_length=300)),
                ('sync_state', models.CharField(choices=[('SYNCED', 'Synced'), ('PENDING', 'Pending'), ('ERROR', 'Error')], default='PENDING', max_length=10)),
                ('last_sync_error', models.TextField(blank=True, null=True)),
                ('last_synced_at', models.DateTimeField(blank=True, null=True)),
                ('last_manual_refresh_at', models.DateTimeField(blank=True, null=True)),
                ('reopen_retry_count', models.PositiveSmallIntegerField(default=0)),
                ('connector', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='tickets', to='db.workspacesupportconnector')),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('issue', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='support_tickets', to='db.issue')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Issue Support Ticket',
                'verbose_name_plural': 'Issue Support Tickets',
                'db_table': 'issue_support_tickets',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='IssueSentryDetail',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('sentry_issue_id', models.CharField(db_index=True, max_length=255)),
                ('sentry_short_id', models.CharField(blank=True, max_length=255)),
                ('permalink', models.URLField(blank=True, max_length=1000)),
                ('level', models.CharField(blank=True, max_length=20)),
                ('status', models.CharField(choices=[('unresolved', 'Unresolved'), ('resolved', 'Resolved'), ('ignored', 'Ignored')], default='unresolved', max_length=20)),
                ('event_count', models.PositiveIntegerField(default=0)),
                ('last_seen_at', models.DateTimeField(blank=True, null=True)),
                ('last_synced_at', models.DateTimeField(blank=True, null=True)),
                ('last_occurrence_comment_at', models.DateTimeField(blank=True, null=True)),
                ('last_outbound_sync_status', models.CharField(blank=True, max_length=10, null=True)),
                ('last_sync_error', models.TextField(blank=True, null=True)),
                ('is_sync_active', models.BooleanField(default=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('issue', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='sentry_detail', to='db.issue')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('project_sync', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='issue_details', to='db.sentryprojectsync')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Issue Sentry Detail',
                'verbose_name_plural': 'Issue Sentry Details',
                'db_table': 'issue_sentry_details',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='IntegrationEventLog',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('provider', models.CharField(choices=[('sentry', 'Sentry'), ('zendesk', 'Zendesk'), ('front', 'Front'), ('generic_webhook', 'Generic Webhook')], db_index=True, max_length=32)),
                ('connector_id', models.UUIDField(blank=True, db_index=True, null=True)),
                ('direction', models.CharField(choices=[('IN', 'Inbound'), ('OUT', 'Outbound')], max_length=3)),
                ('event_type', models.CharField(blank=True, max_length=100)),
                ('external_event_id', models.CharField(blank=True, max_length=255, null=True)),
                ('payload', models.JSONField(blank=True, default=dict)),
                ('response_status', models.CharField(blank=True, max_length=10, null=True)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(null=True, on_delete=django.db.models.deletion.CASCADE, related_name='project_%(class)s', to='db.project')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_%(class)s', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Integration Event Log',
                'verbose_name_plural': 'Integration Event Logs',
                'db_table': 'integration_event_logs',
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddField(
            model_name='intakeissue',
            name='support_ticket',
            field=models.OneToOneField(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='intake_issue', to='db.issuesupportticket'),
        ),
        migrations.AddConstraint(
            model_name='workspacesentryconnection',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True), ('is_active', True)), fields=('workspace',), name='unique_active_sentry_connection_per_workspace'),
        ),
        migrations.AddConstraint(
            model_name='sentryprojectsync',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True), ('is_active', True)), fields=('project',), name='unique_active_sentry_sync_per_project'),
        ),
        migrations.AddConstraint(
            model_name='sentryprojectsync',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True), ('is_active', True)), fields=('connection', 'sentry_project_slug'), name='unique_active_sentry_project_mapping'),
        ),
        migrations.AddConstraint(
            model_name='issuesupportticket',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('connector', 'external_ticket_id', 'issue'), name='unique_support_ticket_per_connector_issue'),
        ),
        migrations.AddConstraint(
            model_name='issuesentrydetail',
            constraint=models.UniqueConstraint(fields=('workspace', 'sentry_issue_id'), name='unique_sentry_issue_per_workspace'),
        ),
        migrations.AddIndex(
            model_name='integrationeventlog',
            index=models.Index(fields=['workspace', 'provider', 'created_at'], name='integ_log_ws_provider_idx'),
        ),
        migrations.AddConstraint(
            model_name='integrationeventlog',
            constraint=models.UniqueConstraint(condition=models.Q(('direction', 'IN'), ('external_event_id__isnull', False)), fields=('connector_id', 'external_event_id'), name='unique_inbound_external_event_id_per_connector'),
        ),
    ]
