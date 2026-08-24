# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Test Settings"""

from .common import *  # noqa

DEBUG = True

# Send it in a dummy outbox
EMAIL_BACKEND = "django.core.mail.backends.locmem.EmailBackend"

INSTALLED_APPS.append(  # noqa
    "plane.tests"
)

# Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
# plane-selfhost), feature 6 ("Recherche approfondie dans la Command
# Palette") needs `pg_trgm`/`unaccent` + a small `immutable_unaccent` SQL
# function to exist before three GIN indexes
# (Issue/IssueComment/User.Meta.indexes) can be created. This project's
# `pytest.ini` runs with `--nomigrations` (test speed), which makes
# pytest-django create the test database's schema directly from current
# model state, bypassing every migration file's `operations` entirely -
# so the real migration that creates those (`0174_category12_search_
# trigram_extensions`) never runs for tests. Pointing test-database
# creation at a dedicated, pre-provisioned template (rather than
# Postgres's implicit default, `template1`) lets `CREATE DATABASE
# test_plane TEMPLATE plane_test_search_template` inherit them for free.
# See `plane.tests.conftest._ensure_search_extensions_template_db`, which
# provisions this template database idempotently every test session.
DATABASES["default"].setdefault("TEST", {})["TEMPLATE"] = "plane_test_search_template"  # noqa: F405
