# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Category 12 (docs/feature-specs/12-keyboard-mobile-desktop.md in
plane-selfhost), feature 3 - small VAPID (RFC 8292) keypair helper, shared
by the god-mode admin view (`plane.license.api.views.push_notification.
GenerateVapidKeysEndpoint`, key generation) and the push-sending Celery
task (`plane.bgtasks.push_notification_task`, reconstructing a usable
signing object from the stored private key on every send).

Built on `py_vapid` (a `pywebpush` dependency already required for Web
Push sending itself - see `apps/api/requirements/base.txt`) rather than
hand-rolling EC key generation directly against `cryptography` - `py_vapid`
already implements the exact raw-point base64url encoding browsers expect
for `PushManager.subscribe({applicationServerKey})` and that `pywebpush`
itself expects back out the other end.
"""

from py_vapid import Vapid02, b64urlencode
from cryptography.hazmat.primitives import serialization


def generate_vapid_keypair():
    """Returns `(public_key_b64, private_key_b64)` - both raw EC point
    bytes, base64url-encoded without padding:
    - public: 65-byte uncompressed P-256 point (~87 chars) - the exact
      shape a browser's `applicationServerKey` expects, and the value
      stored verbatim (never encrypted - it is not a secret) on
      `InstanceConfiguration.VAPID_PUBLIC_KEY`.
    - private: 32-byte raw scalar (~43 chars) - stored only inside
      `PushNotificationConfig.vapid_private_key`, an `EncryptedTextField`,
      never returned by any API response (see that model's own module
      docstring for the write-only rationale).
    """
    vapid = Vapid02()
    vapid.generate_keys()
    private_raw = vapid.private_key.private_numbers().private_value.to_bytes(32, "big")
    public_raw = vapid.public_key.public_bytes(
        serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
    )
    return b64urlencode(public_raw), b64urlencode(private_raw)


def build_vapid_from_private_key(private_key_b64):
    """Reconstructs a `py_vapid.Vapid02` instance (directly usable as
    `pywebpush.webpush`'s `vapid_private_key=` argument) from the raw
    base64url private key this fork stores.

    Returns `None` (never raises) on missing/malformed input - every
    caller treats a `None` return as "Web Push unavailable right now",
    not a hard failure, since a not-yet-configured or corrupted key
    should degrade only the push channel rather than raise past a
    Celery task boundary or an admin-facing view.
    """
    if not private_key_b64:
        return None
    try:
        return Vapid02.from_raw(private_key_b64.encode())
    except Exception:
        return None
