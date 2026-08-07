# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Backs `GET /api/v1/workspaces/{slug}/query/schema/` - exigence 14 of
docs/feature-specs/08-api-webhooks-cli.md ("Couche de requetes flexible
facon GraphQL") in plane-selfhost. Reads directly from `registry.py`'s
`ENTITY_REGISTRY` so this can never drift from what the resolver actually
implements - see registry.py's own module docstring for why the whole
whitelist lives in code rather than a DB table in the first place.
"""

from plane.db.models import WorkspaceQuerySettings

from .cost import DEFAULT_ROOT_LIMIT, MAX_RELATION_LIMIT, MAX_ROOT_LIMIT
from .registry import ENTITY_REGISTRY, RELATION_ONLY_FIELDS

_TYPE_MAP = {
    "UUIDField": "uuid",
    "CharField": "string",
    "TextField": "string",
    "SlugField": "string",
    "BooleanField": "boolean",
    "IntegerField": "integer",
    "PositiveIntegerField": "integer",
    "PositiveSmallIntegerField": "integer",
    "FloatField": "float",
    "DateField": "date",
    "DateTimeField": "datetime",
    "ForeignKey": "uuid",
    "OneToOneField": "uuid",
    "JSONField": "json",
}


def _field_type(model, field_name):
    for candidate in (field_name, field_name[:-3] if field_name.endswith("_id") else None):
        if not candidate:
            continue
        try:
            django_field = model._meta.get_field(candidate)
        except Exception:
            continue
        return _TYPE_MAP.get(django_field.get_internal_type(), "string")
    return "string"


def _describe_fields(model, field_names):
    return {name: _field_type(model, name) for name in field_names}


def build_schema():
    entities = {}
    for entity_name, entity_def in ENTITY_REGISTRY.items():
        relations = {}
        for relation_name, relation_def in entity_def.relations.items():
            target_fields = RELATION_ONLY_FIELDS.get(relation_def.target)
            if target_fields is not None:
                target_model = None
            else:
                target_model = ENTITY_REGISTRY[relation_def.target].model
                target_fields = ENTITY_REGISTRY[relation_def.target].fields
            if target_model:
                field_types = _describe_fields(target_model, target_fields)
            else:
                field_types = dict.fromkeys(target_fields, "string")
            relations[relation_name] = {
                "target": relation_def.target,
                "cardinality": relation_def.cardinality,
                "default_limit": relation_def.default_limit,
                "max_limit": relation_def.max_limit,
                "filterable": relation_def.filterable,
                "fields": field_types,
            }
        entities[entity_name] = {
            "fields": _describe_fields(entity_def.model, entity_def.fields),
            "default_fields": list(entity_def.default_fields),
            "orderable_fields": list(entity_def.orderable_fields),
            "default_order_by": entity_def.default_order_by,
            "relations": relations,
        }

    return {
        "entities": entities,
        "limits": {
            "default_root_limit": DEFAULT_ROOT_LIMIT,
            "max_root_limit": MAX_ROOT_LIMIT,
            "max_relation_limit": MAX_RELATION_LIMIT,
            "default_max_depth": WorkspaceQuerySettings.DEFAULT_MAX_DEPTH,
            "default_max_cost": WorkspaceQuerySettings.DEFAULT_MAX_COST,
            "default_timeout_ms": WorkspaceQuerySettings.DEFAULT_TIMEOUT_MS,
        },
    }
