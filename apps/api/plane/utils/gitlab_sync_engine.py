# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitLab MR<->issue linking + sync engine - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif") in
plane-selfhost.

SECURITY-CRITICAL: `resolve_referenced_issue` is the exact same
choke-point pattern as `plane.utils.github_sync_engine`'s own function of
the same name - every `Project`/`Issue` lookup here is scoped through
`repository.workspace_connection.workspace`, and additionally requires
the repository to actually be connected (`GitlabRepositoryProjectConnection`)
to the resolved project specifically (the GitLab "one repo -> one
project" cardinality - see gitlab_integration.py) before an issue is ever
returned. A webhook for one repository can never touch an issue in a
different workspace, or even a different project in the *same* workspace
that this repository isn't connected to.

TRANSITION DESIGN - deliberately different from GitHub's
"most-advanced-active-PR-wins" aggregation (github_sync_engine.py):
GitLab's own spec (exigence 8) does not ask for that aggregation at all -
it only asks for four independently-configurable event->State mappings
(open/ready/merge/close), each firing exactly once when its specific
real-world event happens. So this module is event-driven: each webhook
event determines the ONE trigger it corresponds to (`determine_trigger`)
and applies that transition directly, rather than recomputing an
aggregate status across every linked MR. The shared no-regression guard
(same rule as GitHub, added here per this task's own explicit brief even
though GitLab's spec text doesn't state it - see
`ProjectGitlabSyncSettings.allow_backward_transition`'s docstring) is what
keeps this safe against out-of-order events across multiple linked MRs.

METADATA SYNC LIMITATION (exigence 7): `description_html` is synced as a
plain HTML-escaped paragraph, not converted from GitLab's markdown into
Plane's Tiptap document schema - `description_binary`/`description_json`
(the collaborative-editor CRDT state) are left untouched. This is a real,
documented gap: opening the issue in Plane's rich editor after a
GitLab-driven description sync may not immediately reflect the synced
text until the editor's own document state is reconciled. Building a full
markdown->Tiptap converter was out of scope given this task's overall
size - see this feature's README.
"""

import json

from django.utils import timezone
from django.utils.html import escape

from plane.db.models.state import StateGroup
from plane.utils.exception_logger import log_exception

_REGRESSION_GUARDED_GROUPS = {StateGroup.COMPLETED.value, StateGroup.CANCELLED.value}

_DRAFT_TITLE_PREFIXES = ("draft:", "wip:", "[draft]", "[wip]")


def is_draft(mr_data):
    """Exigence 9: "champ draft/work_in_progress de l'API GitLab, ou
    prefixe Draft:/WIP: dans le titre"."""
    if mr_data.get("draft") or mr_data.get("work_in_progress"):
        return True
    title = (mr_data.get("title") or "").strip().lower()
    return any(title.startswith(prefix) for prefix in _DRAFT_TITLE_PREFIXES)


def determine_trigger(action, mr_data, changes=None):
    """Returns one of "open"/"ready"/"merge"/"close", or None if this
    event doesn't correspond to any configurable trigger (e.g. a plain
    label/assignee-only `update`, or opening as a draft - exigence 9
    explicitly withholds the "open" trigger until a draft MR is marked
    ready).

    `changes` - GitLab's own `changes` webhook key (`{field: {previous,
    current}}`), only present on `update` events - confirmed real shape
    via GitLab's own webhook documentation (see this feature's README).
    Used to detect exactly the draft->ready transition, as opposed to any
    other kind of `update` event.
    """
    if action in ("open", "reopen"):
        return None if is_draft(mr_data) else "open"
    if action == "merge":
        return "merge"
    if action == "close":
        return "close"
    if action == "update":
        draft_change = (changes or {}).get("draft")
        if draft_change and draft_change.get("previous") and not draft_change.get("current"):
            return "ready"
        return None
    return None


def resolve_referenced_issue(repository, identifier, sequence_id):
    from plane.db.models import Issue, Project

    workspace = repository.workspace_connection.workspace

    project = Project.objects.filter(identifier__iexact=identifier, workspace=workspace).first()
    if project is None:
        log_exception(
            Exception(
                f"gitlab_sync: identifier '{identifier}' does not match any project in "
                f"workspace {workspace.id} (repository {repository.id}) - reference ignored"
            ),
            warning=True,
        )
        return None

    connection = getattr(repository, "project_connection", None)
    if connection is None or connection.project_id != project.id:
        log_exception(
            Exception(
                f"gitlab_sync: repository {repository.id} is not connected to project "
                f"{project.id} ('{identifier}') - reference ignored (cross-tenant guard)"
            ),
            warning=True,
        )
        return None

    issue = Issue.objects.filter(project=project, sequence_id=sequence_id).first()
    if issue is None:
        log_exception(
            Exception(f"gitlab_sync: no issue {identifier}-{sequence_id} in project {project.id}"),
            warning=True,
        )
        return None

    return issue


def upsert_merge_request_sync(repository, issue, mr_data):
    """Get-or-create + refresh the `GitlabMergeRequestIssueSync` row for
    `(repository, mr_data['id'], issue)` - idempotent per exigence 5.
    Returns `(sync_row, created)`."""
    from plane.db.models import GitlabMergeRequestIssueSync

    now = timezone.now()
    defaults = {
        "project": issue.project,
        "workspace": issue.project.workspace,
        "merge_request_iid": mr_data.get("iid"),
        "title": mr_data.get("title", "") or "",
        "source_branch": mr_data.get("source_branch", "") or "",
        "target_branch": mr_data.get("target_branch", "") or "",
        "state": mr_data.get("state", "opened") or "opened",
        "draft": is_draft(mr_data),
        "web_url": mr_data.get("web_url", "") or "",
        "last_synced_at": now,
    }
    sync, created = GitlabMergeRequestIssueSync.objects.get_or_create(
        repository=repository,
        merge_request_id=mr_data.get("id"),
        issue=issue,
        defaults=defaults,
    )
    if not created:
        for field, value in defaults.items():
            if field in ("project", "workspace"):
                continue
            setattr(sync, field, value)
        sync.save()
    return sync, created


def sync_issue_metadata(issue, mr_data, project_settings, sync_row_last_synced_at, actor):
    """Applies title/description/assignee/label sync per exigences 5/7/10/11.
    `sync_row_last_synced_at` must be the sync row's `last_synced_at`
    value from BEFORE this call's own `upsert_merge_request_sync` touched
    it, so the "Plane wins" conflict check (exigence 7) compares against
    the *previous* sync baseline, not one just stamped by this same
    event. Returns a dict describing what changed (for the activity log),
    possibly empty.
    """
    from plane.db.models import IssueAssignee, IssueLabel, Label, WorkspaceMember

    changes = {}

    if project_settings.sync_title_description:
        if sync_row_last_synced_at is not None and issue.updated_at > sync_row_last_synced_at:
            log_exception(
                Exception(
                    f"gitlab_sync: skipping title/description sync for issue {issue.id} - "
                    "edited in Plane after last sync (Plane wins, exigence 7)"
                ),
                warning=True,
            )
        else:
            new_title = mr_data.get("title")
            if new_title and new_title != issue.name:
                changes["name"] = {"old": issue.name, "new": new_title}
                issue.name = new_title[:255]
            new_description = mr_data.get("description") or ""
            new_description_html = f"<p>{escape(new_description).replace(chr(10), '<br/>')}</p>"
            if new_description_html != issue.description_html:
                changes["description_html"] = {"old": issue.description_html, "new": new_description_html}
                issue.description_html = new_description_html
                issue.description_stripped = new_description
            if changes:
                update_fields = ["updated_at"]
                if "name" in changes:
                    update_fields.append("name")
                if "description_html" in changes:
                    update_fields.extend(["description_html", "description_stripped"])
                issue.save(update_fields=update_fields)

    if project_settings.sync_assignee:
        assignee_email = (mr_data.get("assignee") or {}).get("email")
        assignee_username = (mr_data.get("assignee") or {}).get("username")
        matched_user = None
        if assignee_email and assignee_email != "[REDACTED]":
            matched_user = WorkspaceMember.objects.filter(
                workspace=issue.project.workspace, member__email__iexact=assignee_email, is_active=True
            ).values_list("member", flat=True).first()
        if matched_user is None and assignee_username:
            matched_user = WorkspaceMember.objects.filter(
                workspace=issue.project.workspace, member__username__iexact=assignee_username, is_active=True
            ).values_list("member", flat=True).first()

        if matched_user:
            _, assignee_created = IssueAssignee.objects.get_or_create(
                issue=issue, assignee_id=matched_user, project=issue.project, workspace=issue.project.workspace
            )
            if assignee_created:
                changes["assignee_id"] = str(matched_user)
        elif mr_data.get("assignee"):
            log_exception(
                Exception(
                    f"gitlab_sync: MR assignee '{assignee_username or assignee_email}' does not match any "
                    f"active member of workspace {issue.project.workspace_id} - assignee sync skipped (exigence 10)"
                ),
                warning=True,
            )

    if project_settings.sync_labels:
        label_names = mr_data.get("labels") or []
        # GitLab's own webhook `labels` entries are objects (`{"title": ...}`)
        # while the REST API returns plain strings for some endpoints -
        # tolerate both.
        label_names = [entry["title"] if isinstance(entry, dict) else entry for entry in label_names]
        applied_labels = []
        for label_name in label_names:
            label = Label.objects.filter(project=issue.project, name__iexact=label_name).first()
            if label is None:
                if not project_settings.create_missing_labels:
                    log_exception(
                        Exception(
                            f"gitlab_sync: label '{label_name}' does not exist in project "
                            f"{issue.project_id} and create_missing_labels is disabled - skipped"
                        ),
                        warning=True,
                    )
                    continue
                label = Label.objects.create(
                    project=issue.project, workspace=issue.project.workspace, name=label_name
                )
            _, label_created = IssueLabel.objects.get_or_create(
                issue=issue, label=label, project=issue.project, workspace=issue.project.workspace
            )
            if label_created:
                applied_labels.append(label_name)
        if applied_labels:
            changes["labels_added"] = applied_labels

    return changes


def apply_transition(issue, project_settings, trigger, actor, mr_sync):
    """Applies the `State` mapped to `trigger` on `project_settings`
    (`state_on_open`/`state_on_ready`/`state_on_merge`/`state_on_close`),
    respecting the no-regression guard. No-op (not an error) if no state
    is mapped for `trigger`."""
    from plane.bgtasks.issue_activities_task import issue_activity
    from plane.db.models import IssueActivity

    target_state = {
        "open": project_settings.state_on_open,
        "ready": project_settings.state_on_ready,
        "merge": project_settings.state_on_merge,
        "close": project_settings.state_on_close,
    }.get(trigger)

    if target_state is None:
        return False

    current_state = issue.state
    if current_state is not None and current_state.id == target_state.id:
        return False

    if (
        current_state is not None
        and current_state.group in _REGRESSION_GUARDED_GROUPS
        and target_state.group not in _REGRESSION_GUARDED_GROUPS
        and not project_settings.allow_backward_transition
    ):
        log_exception(
            Exception(
                f"gitlab_sync: blocked regression of issue {issue.id} from "
                f"'{current_state.group}' to '{target_state.group}' via trigger '{trigger}'"
            ),
            warning=True,
        )
        return False

    old_state = current_state
    issue.state_id = target_state.id
    issue.save(update_fields=["state_id", "updated_at"])

    epoch = int(timezone.now().timestamp())
    issue_activity.delay(
        type="issue.activity.updated",
        requested_data=json.dumps({"state_id": str(target_state.id)}),
        current_instance=json.dumps({"state_id": str(old_state.id) if old_state else None}),
        actor_id=str(actor.id),
        issue_id=str(issue.id),
        project_id=str(issue.project_id),
        epoch=epoch,
        notification=True,
        is_automation=False,
    )

    mr_label = f"MR !{mr_sync.merge_request_iid}" if mr_sync else "a linked MR"
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="updated",
        field="gitlab_merge_request_state_change",
        old_value=old_state.name if old_state else None,
        new_value=target_state.name,
        actor_id=actor.id,
        comment=f"State changed automatically via {mr_label} ({trigger})",
        epoch=epoch,
    )

    event = "merge_request_merged" if trigger == "merge" else "merge_request_state_changed"
    _dispatch_webhook(
        event=event,
        issue=issue,
        mr_sync=mr_sync,
        actor=actor,
        extra={"trigger": trigger, "from_state_id": str(old_state.id) if old_state else None,
               "to_state_id": str(target_state.id)},
    )
    return True


def dispatch_metadata_sync_activity(issue, changes, mr_sync, actor):
    """Exigence 12: "chaque changement d'origine GitLab sur un ticket
    genere une entree IssueActivity attribuee a un acteur systeme,
    avec old_value/new_value et un lien vers la MR source". One combined
    entry per sync event (not one per changed field) - `changes` is
    `sync_issue_metadata`'s own return value; no-op if nothing changed."""
    from plane.db.models import IssueActivity

    if not changes:
        return

    primary_field = "name" if "name" in changes else next(iter(changes))
    primary = changes.get(primary_field)
    old_value = primary.get("old") if isinstance(primary, dict) else None
    new_value = primary.get("new") if isinstance(primary, dict) else None

    changed_labels = ", ".join(sorted(changes.keys()))
    mr_label = f"MR !{mr_sync.merge_request_iid}" if mr_sync else "a linked MR"

    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="updated",
        field="gitlab_merge_request_sync",
        old_value=str(old_value) if old_value is not None else None,
        new_value=str(new_value) if new_value is not None else None,
        actor_id=actor.id,
        comment=f"Synced from {mr_label}: {changed_labels}",
        epoch=int(timezone.now().timestamp()),
    )


def dispatch_link_event(issue, mr_sync, actor):
    from plane.db.models import IssueActivity

    epoch = int(timezone.now().timestamp())
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="created",
        field="gitlab_merge_request_linked",
        new_value=mr_sync.web_url,
        actor_id=actor.id,
        comment=f"Linked to MR !{mr_sync.merge_request_iid}",
        epoch=epoch,
    )
    _dispatch_webhook(event="merge_request_linked", issue=issue, mr_sync=mr_sync, actor=actor)


def dispatch_unlink_event(mr_sync, actor, issue=None):
    from plane.db.models import IssueActivity

    issue = issue or mr_sync.issue
    epoch = int(timezone.now().timestamp())
    IssueActivity.objects.create(
        issue=issue,
        project_id=issue.project_id,
        workspace_id=issue.workspace_id,
        verb="deleted",
        field="gitlab_merge_request_unlinked",
        old_value=mr_sync.web_url,
        actor_id=actor.id if actor else None,
        comment=f"Unlinked from MR !{mr_sync.merge_request_iid}",
        epoch=epoch,
    )


def _dispatch_webhook(event, issue, mr_sync, actor, extra=None):
    try:
        from plane.bgtasks.webhook_task import webhook_activity

        event_data = {
            "issue_id": str(issue.id),
            "merge_request_sync_id": str(mr_sync.id) if mr_sync else None,
            "merge_request_iid": mr_sync.merge_request_iid if mr_sync else None,
            "merge_request_state": mr_sync.state if mr_sync else None,
        }
        if extra:
            event_data.update(extra)

        webhook_activity.delay(
            event=event,
            verb="triggered",
            field=None,
            old_value=None,
            new_value=None,
            actor_id=str(actor.id) if actor else None,
            slug=issue.project.workspace.slug,
            current_site=None,
            event_id=str(mr_sync.id) if mr_sync else str(issue.id),
            old_identifier=None,
            new_identifier=None,
            event_data_override=event_data,
        )
    except Exception as e:  # pragma: no cover - defensive
        log_exception(e, warning=True)
