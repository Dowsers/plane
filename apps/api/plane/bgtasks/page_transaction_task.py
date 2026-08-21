# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import logging

# Django imports
from django.utils import timezone

# Third-party imports
from bs4 import BeautifulSoup

# App imports
from celery import shared_task
from plane.db.models import Page, PageLog
from plane.utils.exception_logger import log_exception
from plane.utils.page_comment import reconcile_page_comment_anchors

logger = logging.getLogger("plane.worker")

COMPONENT_MAP = {
    "mention-component": {
        "attributes": ["id", "entity_identifier", "entity_name", "entity_type"],
        "extract": lambda m: {
            "entity_name": m.get("entity_name"),
            "entity_type": None,
            "entity_identifier": m.get("entity_identifier"),
        },
    },
    "image-component": {
        "attributes": ["id", "src"],
        "extract": lambda m: {
            "entity_name": "image",
            "entity_type": None,
            "entity_identifier": m.get("src"),
        },
    },
}

component_map = {
    **COMPONENT_MAP,
}


def extract_all_components(description_html):
    """
    Extracts all component types from the HTML value in a single pass.
    Returns a dict mapping component_type -> list of extracted entities.
    """
    try:
        if not description_html:
            return {component: [] for component in component_map.keys()}

        soup = BeautifulSoup(description_html, "html.parser")
        results = {}

        for component, config in component_map.items():
            attributes = config.get("attributes", ["id"])
            component_tags = soup.find_all(component)

            entities = []
            for tag in component_tags:
                entity = {attr: tag.get(attr) for attr in attributes}
                entities.append(entity)

            results[component] = entities

        return results

    except Exception:
        return {component: [] for component in component_map.keys()}


def get_entity_details(component: str, mention: dict):
    """
    Normalizes mention attributes into entity_name, entity_type, entity_identifier.
    """
    config = component_map.get(component)
    if not config:
        return {"entity_name": None, "entity_type": None, "entity_identifier": None}
    return config["extract"](mention)


@shared_task
def page_transaction(new_description_html, old_description_html, page_id):
    """
    Tracks changes in page content (mentions, embeds, etc.)
    and logs them in PageLog for audit and reference.

    Category 10 (Docs/Wiki & Collaboration), features 1+3 (merged,
    "Commentaires ancres sur les Pages" + "Resolution de fils de
    commentaires") also piggybacks its orphan-anchor reconciliation on
    this exact task, deliberately - this is the one task already invoked,
    with the freshly-saved `description_html`/`page_id`, from every
    current description-mutating view: `PageViewSet`/`WorkspacePageViewSet`
    .create()/.partial_update(), `Pages(Description)ViewSet`/
    `WorkspacePagesDescriptionViewSet`.partial_update() (both scopes'
    autosave endpoint), and `PageDuplicateEndpoint` - see
    `plane.app.views.page.base`/`.workspace`. Hooking reconciliation in
    here, rather than adding a call at each of those sites, means any
    future call site that reuses this same task (the established
    convention for every description write in this codebase) gets
    reconciliation for free. Note: as of this feature, no `PageVersion`
    "restore" endpoint actually exists server-side in this fork (the
    frontend's `restoreVersion()` calls a URL that isn't registered in
    urls.py and 404s today - pre-existing, unrelated to this feature) - if
    one is added later and it writes `description_html` through this same
    task, reconciliation covers it automatically; if it writes the field
    directly instead, it will need its own explicit call to
    `reconcile_page_comment_anchors`.
    """
    try:
        page = Page.objects.get(pk=page_id)

        # Orphan-anchor reconciliation (see docstring above) - kept in its
        # own try/except so a failure here never blocks the mention/embed
        # extraction below, and vice versa.
        try:
            reconcile_page_comment_anchors(page_id, new_description_html)
        except Exception as e:
            log_exception(e)

        has_existing_logs = PageLog.objects.filter(page_id=page_id).exists()

        # Extract all components in a single pass (optimized)
        old_components = extract_all_components(old_description_html)
        new_components = extract_all_components(new_description_html)

        new_transactions = []
        deleted_transaction_ids = set()

        for component in component_map.keys():
            old_entities = old_components[component]
            new_entities = new_components[component]

            old_ids = {m.get("id") for m in old_entities if m.get("id")}
            new_ids = {m.get("id") for m in new_entities if m.get("id")}
            deleted_transaction_ids.update(old_ids - new_ids)

            for mention in new_entities:
                mention_id = mention.get("id")
                if not mention_id or (mention_id in old_ids and has_existing_logs):
                    continue

                details = get_entity_details(component, mention)
                current_time = timezone.now()

                new_transactions.append(
                    PageLog(
                        transaction=mention_id,
                        page_id=page_id,
                        entity_identifier=details["entity_identifier"],
                        entity_name=details["entity_name"],
                        entity_type=details["entity_type"],
                        workspace_id=page.workspace_id,
                        created_at=current_time,
                        updated_at=current_time,
                    )
                )

        # Bulk insert and cleanup
        if new_transactions:
            PageLog.objects.bulk_create(new_transactions, batch_size=50, ignore_conflicts=True)

        if deleted_transaction_ids:
            PageLog.objects.filter(transaction__in=deleted_transaction_ids).delete()

    except Page.DoesNotExist:
        return
    except Exception as e:
        log_exception(e)
        return
