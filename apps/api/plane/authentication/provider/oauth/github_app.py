# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Disabled-by-default OAuth App scaffolding for GitHub native PR<->issue
linking - see docs/feature-specs/07-integrations-git.md ("1. GitHub
natif", "Questions ouvertes" #1) in plane-selfhost, and this feature's own
README for the PAT-first v1 scope decision this is the documented,
not-yet-wired-up secondary path for.

NOT the login provider (`plane.authentication.provider.oauth.github.GitHubOAuthProvider`,
`read:user user:email` scope, writes to the per-user `Account` model,
used by the "Sign in with GitHub" flow) - per this task's own explicit
constraint, that provider and the `Account` model are untouched. This
subclass only reuses `OauthAdapter`'s HTTP mechanics (`get_user_token`/
`get_user_response`, the authorization-code exchange itself), never its
`authenticate()`/`create_update_account()` login-and-signup path - a
workspace-scoped `GithubWorkspaceConnection` is a fundamentally different
target than a per-user login `Account`, so this class deliberately stops
short of the base class's full login flow.

No view constructs this today (see `GithubOAuthCallbackEndpoint` below,
which always returns 501) - completing this path requires an operator to
register a real GitHub App (repo-scoped permissions, a callback URL on
their own public domain) and set `GITHUB_APP_CLIENT_ID`/
`GITHUB_APP_CLIENT_SECRET`, neither of which exists in this sandbox.
"""

import os
from urllib.parse import urlencode

from plane.authentication.adapter.error import AUTHENTICATION_ERROR_CODES, AuthenticationException
from plane.authentication.adapter.oauth import OauthAdapter

# `repo` grants read/write on both public and private repositories -
# needed to list a user's repos and register a webhook on the one(s)
# chosen for sync (exigence 2's data-model section explicitly scopes this
# connector beyond the login provider's read-only `read:user user:email`).
GITHUB_APP_SCOPE = "repo"


class GitHubAppOAuthProvider(OauthAdapter):
    token_url = "https://github.com/login/oauth/access_token"
    userinfo_url = "https://api.github.com/user"
    provider = "github_app"
    scope = GITHUB_APP_SCOPE

    def __init__(self, request, code=None, state=None, callback=None):
        client_id = os.environ.get("GITHUB_APP_CLIENT_ID")
        client_secret = os.environ.get("GITHUB_APP_CLIENT_SECRET")

        if not (client_id and client_secret):
            raise AuthenticationException(
                error_code=AUTHENTICATION_ERROR_CODES.get("GITHUB_NOT_CONFIGURED", 5000),
                error_message="GITHUB_APP_NOT_CONFIGURED",
            )

        redirect_uri = (
            f"{'https' if request.is_secure() else 'http'}://{request.get_host()}"
            "/api/workspaces/integrations/github/oauth/callback/"
        )
        url_params = {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "scope": self.scope,
            "state": state,
        }
        auth_url = f"https://github.com/login/oauth/authorize?{urlencode(url_params)}"

        super().__init__(
            request,
            self.provider,
            client_id,
            self.scope,
            redirect_uri,
            auth_url,
            self.token_url,
            self.userinfo_url,
            client_secret,
            code,
            callback=callback,
        )

    def exchange_code_for_token(self):
        """Real authorization-code exchange (reuses `OauthAdapter.get_user_token`)
        - deliberately named differently from, and not overriding,
        `set_token_data(self, data)` (the base class's plain setter) so a
        future finisher of this scaffold can call this explicitly rather
        than accidentally invoking half of the login flow's
        `authenticate()` machinery."""
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "code": self.code,
            "redirect_uri": self.redirect_uri,
        }
        token_response = self.get_user_token(data=data, headers={"Accept": "application/json"})
        self.set_token_data(token_response)
        return token_response

    def fetch_authenticated_user(self):
        """Reuses `OauthAdapter.get_user_response` (`GET /user` with the
        just-exchanged token) - returns GitHub's raw user object, for a
        future finisher to build a `GithubWorkspaceConnection` from
        directly, never a Plane `User`/`Account`."""
        return self.get_user_response()
