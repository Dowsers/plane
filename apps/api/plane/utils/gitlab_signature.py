# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
GitLab webhook token verification - see
docs/feature-specs/07-integrations-git.md ("2. GitLab natif", exigence 13)
in plane-selfhost: "La reception d'un webhook est validee via l'en-tete
statique X-Gitlab-Token compare au secret stocke pour ce repository
(mecanisme distinct de la signature HMAC X-Hub-Signature-256 de GitHub)".

Unlike GitHub, GitLab does not sign the payload at all - it just echoes
back a static, opaque token an admin (or, here, this connector itself at
webhook-registration time) chose when the webhook was created, and the
receiver does a constant-time string comparison against the value it
stored. There is deliberately no HMAC/hashing here - matching that
constant-time-comparison-of-a-shared-secret shape exactly, not the
GitHub module's HMAC shape, is why this stays a separate module instead
of a shared "verify_git_webhook" abstraction.
"""

import hmac


def verify_gitlab_token(secret, provided_token):
    """
    `secret` - the per-`GitlabRepository` `webhook_secret_token`
    (plaintext - not encrypted at rest, since it isn't a credential that
    grants API access, only a shared value this endpoint compares
    against; see `GitlabRepository.webhook_secret_token`).
    `provided_token` - the raw `X-Gitlab-Token` header value.

    `hmac.compare_digest` is used purely for its constant-time comparison
    property (no actual HMAC/hashing involved) - the same reason
    `webhook_task.py`'s own signature check and every other secret
    comparison in this codebase avoids a plain `==`.
    """
    if not secret or not provided_token:
        return False
    return hmac.compare_digest(str(secret), str(provided_token))
