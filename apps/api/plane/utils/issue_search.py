# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
import re

# Django imports
from django.db.models import Q

# Module imports


def search_issues(query, queryset):
    # `project__identifier` is kept as a loose fallback, but an issue's
    # actual displayed code comes from its current pool - a Teamspace's
    # shared prefix, or this workspace's own default prefix when it has no
    # team (see plane.utils.issue_identifier_resolver) - so both are
    # matched too, for typing e.g. "DEV" to find team-pool issues.
    fields = [
        "name",
        "sequence_id",
        "project__identifier",
        "sequence_teamspace__default_project_identifier",
        "workspace__default_project_identifier",
    ]
    q = Q()
    for field in fields:
        if field == "sequence_id" and len(query) <= 20:
            sequences = re.findall(r"\b\d+\b", query)
            for sequence_id in sequences:
                q |= Q(**{"sequence_id": sequence_id})
        else:
            q |= Q(**{f"{field}__icontains": query})
    return queryset.filter(q).distinct()
