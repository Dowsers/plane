# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
PageTemplate blueprint <-> real Page translation - see
docs/feature-specs/14-pricing-gap-remediation.md ("14c. Page Templates") in
plane-selfhost. Direct equivalent of
`plane.utils.project_template.build_template_from_project`/
`instantiate_project_from_template` for Pages.

Two directions:
- build_page_template_from_page(): snapshot an existing Page's
  name/description/logo into a new PageTemplate blueprint ("Save as
  template", section 2 of the spec). Only the root Page's own content is
  captured - `child_page` descendants are never recursed into (exigence 4).
- instantiate_page_from_template(): resolve a PageTemplate blueprint into a
  brand new real Page ("Create page from template", section 3). Always
  synchronous inside one transaction.atomic() block, same as
  instantiate_project_from_template - no precedent anywhere in this
  codebase for a partial-failure-safe async entity builder.
"""

from django.db import transaction
from django.db.models import F


def build_page_template_from_page(page, name, actor=None):
    """Copy `name`/`description_html`/`description_json`/`logo_props` off an
    existing Page into a brand new PageTemplate. Pure copy of values - no FK
    back to `page` is kept on the created PageTemplate (exigence 3, section
    2: "copie de valeurs, aucune reference ni FK vers la Page d'origine").
    """
    from plane.db.models import PageTemplate

    with transaction.atomic():
        template = PageTemplate.objects.create(
            workspace_id=page.workspace_id,
            name=name,
            description_html=page.description_html,
            description_json=page.description_json,
            logo_props=page.logo_props,
            created_by=actor,
            updated_by=actor,
        )
        return template


def instantiate_page_from_template(template, name, create_page, actor=None):
    """Resolve a PageTemplate into a real Page, then atomically bump
    `usage_count` (exigence 5, section 3 - `F("usage_count") + 1`, same
    primitive already used by `instantiate_project_from_template`).

    `create_page` is a callable `(name, description_html, description_json,
    logo_props) -> Page` supplied by the caller (the view), since the actual
    Page creation path differs by destination scope (project-scoped vs.
    teamspace-scoped vs. workspace-global Page all go through different
    serializers - see `plane.app.serializers.page.PageSerializer` vs.
    `WorkspacePageSerializer`). Keeping that dispatch in the view avoids this
    utility having to re-implement project/teamspace/global branching that
    already exists at the view layer.
    """
    from plane.db.models import PageTemplate

    with transaction.atomic():
        page = create_page(
            name=name,
            description_html=template.description_html,
            description_json=template.description_json,
            logo_props=template.logo_props,
        )

        PageTemplate.objects.filter(pk=template.pk).update(usage_count=F("usage_count") + 1)

        return page
