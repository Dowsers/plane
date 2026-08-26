# Generated manually, following the format of
# 0179_add_team_member_and_team_project.py - Category 13
# (docs/feature-specs/13-teamspaces.md in plane-selfhost), features 1-3:
# adds the new, deliberately separate/parallel Teamspace/TeamspaceMember/
# TeamspaceProject models (feature 1), the TeamspaceView model (feature 3),
# and the `teamspace` FK on the existing Page model (feature 3).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion
import plane.db.models.view
import uuid


class Migration(migrations.Migration):

    dependencies = [
        ('db', '0180_drop_orphaned_description_columns'),
    ]

    operations = [
        migrations.CreateModel(
            name='Teamspace',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(max_length=255, verbose_name='Teamspace Name')),
                ('description', models.TextField(blank=True, verbose_name='Teamspace Description')),
                ('logo_props', models.JSONField(default=dict)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
                ('workspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='workspace_teamspaces', to='db.workspace')),
            ],
            options={
                'verbose_name': 'Teamspace',
                'verbose_name_plural': 'Teamspaces',
                'db_table': 'teamspaces',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='TeamspaceMember',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('role', models.PositiveSmallIntegerField(choices=[(20, 'Lead'), (15, 'Member')], default=15)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('member', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='user_teamspaces', to=settings.AUTH_USER_MODEL)),
                ('teamspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teamspace_members', to='db.teamspace')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
            ],
            options={
                'verbose_name': 'Teamspace Member',
                'verbose_name_plural': 'Teamspace Members',
                'db_table': 'teamspace_members',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='TeamspaceProject',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('project', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='project_teamspaces', to='db.project')),
                ('teamspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teamspace_projects', to='db.teamspace')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
            ],
            options={
                'verbose_name': 'Teamspace Project',
                'verbose_name_plural': 'Teamspace Projects',
                'db_table': 'teamspace_projects',
                'ordering': ('-created_at',),
            },
        ),
        migrations.CreateModel(
            name='TeamspaceView',
            fields=[
                ('created_at', models.DateTimeField(auto_now_add=True, verbose_name='Created At')),
                ('updated_at', models.DateTimeField(auto_now=True, verbose_name='Last Modified At')),
                ('deleted_at', models.DateTimeField(blank=True, null=True, verbose_name='Deleted At')),
                ('id', models.UUIDField(db_index=True, default=uuid.uuid4, editable=False, primary_key=True, serialize=False, unique=True)),
                ('name', models.CharField(max_length=255, verbose_name='View Name')),
                ('description', models.TextField(blank=True, verbose_name='View Description')),
                ('query', models.JSONField(default=dict, verbose_name='View Query')),
                ('filters', models.JSONField(default=dict)),
                ('display_filters', models.JSONField(default=plane.db.models.view.get_default_display_filters)),
                ('display_properties', models.JSONField(default=plane.db.models.view.get_default_display_properties)),
                ('access', models.PositiveSmallIntegerField(choices=[(0, 'Private'), (1, 'Public')], default=1)),
                ('sort_order', models.FloatField(default=65535)),
                ('logo_props', models.JSONField(default=dict)),
                ('is_locked', models.BooleanField(default=False)),
                ('archived_at', models.DateTimeField(null=True)),
                ('created_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_created_by', to=settings.AUTH_USER_MODEL, verbose_name='Created By')),
                ('owned_by', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teamspace_views', to=settings.AUTH_USER_MODEL)),
                ('teamspace', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='teamspace_views', to='db.teamspace')),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='%(class)s_updated_by', to=settings.AUTH_USER_MODEL, verbose_name='Last Modified By')),
            ],
            options={
                'verbose_name': 'Teamspace View',
                'verbose_name_plural': 'Teamspace Views',
                'db_table': 'teamspace_views',
                'ordering': ('-created_at',),
            },
        ),
        migrations.AddField(
            model_name='page',
            name='teamspace',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='teamspace_pages', to='db.teamspace'),
        ),
        migrations.AddIndex(
            model_name='teamspace',
            index=models.Index(fields=['workspace'], name='teamspace_workspace_idx'),
        ),
        migrations.AddIndex(
            model_name='teamspacemember',
            index=models.Index(fields=['teamspace'], name='teamspace_member_teamspace_idx'),
        ),
        migrations.AddIndex(
            model_name='teamspaceproject',
            index=models.Index(fields=['teamspace'], name='teamspace_proj_teamspace_idx'),
        ),
        migrations.AddConstraint(
            model_name='teamspace',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('workspace', 'name'), name='teamspace_unique_workspace_name_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='teamspace',
            unique_together={('workspace', 'name', 'deleted_at')},
        ),
        migrations.AddConstraint(
            model_name='teamspacemember',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('teamspace', 'member'), name='teamspace_member_unique_teamspace_member_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='teamspacemember',
            unique_together={('teamspace', 'member', 'deleted_at')},
        ),
        migrations.AddConstraint(
            model_name='teamspaceproject',
            constraint=models.UniqueConstraint(condition=models.Q(('deleted_at__isnull', True)), fields=('teamspace', 'project'), name='teamspace_project_unique_teamspace_project_when_deleted_at_null'),
        ),
        migrations.AlterUniqueTogether(
            name='teamspaceproject',
            unique_together={('teamspace', 'project', 'deleted_at')},
        ),
    ]
