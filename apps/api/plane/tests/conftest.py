# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest
from rest_framework.test import APIClient
from pytest_django.fixtures import django_db_setup, django_db_modify_db_settings

from plane.db.models import User, Workspace, WorkspaceMember
from plane.db.models.api import APIToken

CREATE_IMMUTABLE_UNACCENT_SQL = """
CREATE OR REPLACE FUNCTION immutable_unaccent(text)
RETURNS text AS
$$
SELECT unaccent('unaccent', $1)
$$ LANGUAGE sql IMMUTABLE PARALLEL SAFE;
"""


def _ensure_search_extensions_template_db():
    """Idempotently provision the Postgres template database configured
    via `DATABASES["default"]["TEST"]["TEMPLATE"]`
    (`plane.settings.test`) with `pg_trgm`/`unaccent` and the
    `immutable_unaccent` wrapper function.

    Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
    plane-selfhost), feature 6 - see the comment above that setting for
    why this can't just be a normal migration for test purposes: this
    project's `--nomigrations` pytest config means the real migration
    (`0174_category12_search_trigram_extensions`) never runs when
    `test_plane` is created, so the extensions/function it would have
    created must already exist in whatever database `test_plane` is
    templated from - Postgres clones a template database's installed
    extensions/functions (along with everything else) when a new
    database is created `TEMPLATE <name>`.

    Uses a plain `psycopg` connection (not the Django ORM) because this
    runs BEFORE `setup_databases()` - there is no Django DB connection to
    a real database to piggy-back on yet, and `CREATE DATABASE` itself
    cannot run inside a transaction, hence `autocommit=True`. Safe to run
    every session: every statement here is idempotent
    (`IF NOT EXISTS`/`CREATE OR REPLACE`).
    """
    import psycopg
    from django.conf import settings as django_settings

    db_settings = django_settings.DATABASES["default"]
    template_name = db_settings.get("TEST", {}).get("TEMPLATE")
    if not template_name:
        return

    admin_conn_kwargs = {
        "dbname": db_settings["NAME"],
        "user": db_settings["USER"],
        "password": db_settings["PASSWORD"],
        "host": db_settings["HOST"],
        "port": db_settings["PORT"],
        "autocommit": True,
    }

    with psycopg.connect(**admin_conn_kwargs) as conn:
        exists = conn.execute(
            "SELECT 1 FROM pg_database WHERE datname = %s", (template_name,)
        ).fetchone()
        if not exists:
            # Identifier, not a literal - can't be parameterized; `template_name`
            # is a fixed, hardcoded value from our own settings, never
            # user input.
            conn.execute(f'CREATE DATABASE "{template_name}"')

    template_conn_kwargs = {**admin_conn_kwargs, "dbname": template_name}
    with psycopg.connect(**template_conn_kwargs) as conn:
        conn.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm;")
        conn.execute("CREATE EXTENSION IF NOT EXISTS unaccent;")
        conn.execute(CREATE_IMMUTABLE_UNACCENT_SQL)


@pytest.fixture(scope="session")
def django_db_modify_db_settings(django_db_modify_db_settings):  # noqa: F811
    """Runs (as one of `django_db_setup`'s own dependencies) before
    `setup_databases()` creates `test_plane` - the right point to make
    sure the template database it will be cloned `TEMPLATE`-from is ready.
    See `_ensure_search_extensions_template_db` above."""
    _ensure_search_extensions_template_db()


@pytest.fixture(scope="session")
def django_db_setup(django_db_setup):  # noqa: F811
    """Set up the Django database for the test session"""
    pass


@pytest.fixture
def api_client():
    """Return an unauthenticated API client"""
    return APIClient()


@pytest.fixture
def user_data():
    """Return standard user data for tests"""
    return {
        "email": "test@plane.so",
        "password": "test-password",
        "first_name": "Test",
        "last_name": "User",
    }


@pytest.fixture
def create_user(db, user_data):
    """Create and return a user instance"""
    user = User.objects.create(
        email=user_data["email"],
        first_name=user_data["first_name"],
        last_name=user_data["last_name"],
    )
    user.set_password(user_data["password"])
    user.save()
    return user


@pytest.fixture
def api_token(db, create_user):
    """Create and return an API token for testing the external API"""
    token = APIToken.objects.create(
        user=create_user,
        label="Test API Token",
        token="test-api-token-12345",
    )
    return token


@pytest.fixture
def api_key_client(api_client, api_token):
    """Return an API key authenticated client for external API testing"""
    api_client.credentials(HTTP_X_API_KEY=api_token.token)
    return api_client


@pytest.fixture
def session_client(api_client, create_user):
    """Return a session authenticated API client for app API testing, which is what plane.app uses"""
    api_client.force_authenticate(user=create_user)
    return api_client


@pytest.fixture
def create_bot_user(db):
    """Create and return a bot user instance"""
    from uuid import uuid4

    unique_id = uuid4().hex[:8]
    user = User.objects.create(
        email=f"bot-{unique_id}@plane.so",
        username=f"bot_user_{unique_id}",
        first_name="Bot",
        last_name="User",
        is_bot=True,
    )
    user.set_password("bot@123")
    user.save()
    return user


@pytest.fixture
def api_token_data():
    """Return sample API token data for testing"""
    from django.utils import timezone
    from datetime import timedelta

    return {
        "label": "Test API Token",
        "description": "Test description for API token",
        "expired_at": (timezone.now() + timedelta(days=30)).isoformat(),
    }


@pytest.fixture
def create_api_token_for_user(db, create_user):
    """Create and return an API token for a specific user"""
    return APIToken.objects.create(
        label="Test Token",
        description="Test token description",
        user=create_user,
        user_type=0,
    )


@pytest.fixture
def plane_server(live_server):
    """
    Renamed version of live_server fixture to avoid name clashes.
    Returns a live Django server for testing HTTP requests.
    """
    return live_server


@pytest.fixture
def workspace(create_user):
    """
    Create a new workspace and return the
    corresponding Workspace model instance.
    """
    # Create the workspace using the model
    created_workspace = Workspace.objects.create(
        name="Test Workspace",
        owner=create_user,
        slug="test-workspace",
    )

    WorkspaceMember.objects.create(workspace=created_workspace, member=create_user, role=20)

    return created_workspace
