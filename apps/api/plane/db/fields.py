# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared encrypted-field type for workspace-scoped third-party integration
credentials (category 7, `docs/feature-specs/07-integrations-git.md` in
plane-selfhost - GitHub/GitLab/Slack/Figma/Sentry/Zendesk connectors all
need this). Research before this category confirmed no encryption-at-rest
mechanism applicable to a per-model field existed anywhere in this fork:
`Webhook.secret_key`, `APIToken.token`, and the Category 2 intake
skeleton's `SlackWorkspaceConnection.bot_access_token`/`signing_secret`
are all plain `CharField`/`TextField` - that skeleton's own docstring
explicitly flags this as a known gap. The only real, working encryption
primitive in this codebase is `plane.license.utils.encryption.encrypt_data`/
`decrypt_data` (Fernet, key derived via PBKDF2 from `settings.SECRET_KEY`),
used exclusively for the singleton `InstanceConfiguration` key-value table -
never exposed as a reusable Django field type before this.

`EncryptedTextField` wraps those exact same functions (not a new crypto
scheme - this fork's existing `SECRET_KEY`-derived key stays the single
source of truth, so this field and `InstanceConfiguration.value` share the
same key-derivation path and could theoretically decrypt each other's
ciphertext, though nothing does that in practice) so every category 7
connector model encrypts/decrypts identically, rather than each feature
inventing its own scheme.

KNOWN, INHERITED LIMITATION (not introduced here, not fixed here): both
`encrypt_data`/`decrypt_data` swallow any exception and return `""` rather
than raising (see their own source) - a corrupted ciphertext or a
`SECRET_KEY` rotation without a re-encryption migration silently reads back
as an empty string, not an error. This field inherits that exact behavior
for consistency with the one other place in this codebase already doing
encryption, rather than introducing a second, differently-behaved failure
mode. If `SECRET_KEY` is ever rotated on a real deployment, every
`EncryptedTextField` value (and every `InstanceConfiguration` encrypted
value) must be re-encrypted under the new key first, or it silently reads
back empty - flagged prominently in every patch README that uses this
field, not just here.
"""

from django.db import models

from plane.license.utils.encryption import decrypt_data, encrypt_data


class EncryptedTextField(models.TextField):
    """A `TextField` that is transparently encrypted at rest via Fernet
    (`plane.license.utils.encryption`) and transparently decrypted on
    read. Application code reads/writes plain strings exactly like any
    other `TextField` - the ciphertext only ever exists in the database
    column itself, never in Python-level model state.

    Deliberately NOT used for values that need to be queried/filtered on
    (`.filter(some_encrypted_field=...)` would compare against ciphertext,
    which is almost never what's wanted, and Fernet ciphertext is
    non-deterministic - the same plaintext encrypts to a different
    ciphertext every time, so even exact-match filtering silently never
    matches). Use a separate, non-encrypted lookup field (e.g. a hash, or
    a non-secret identifier) if a credential ever needs to be searchable.
    """

    def from_db_value(self, value, expression, connection):
        if value is None:
            return value
        return decrypt_data(value)

    def to_python(self, value):
        # Called for values already in Python (e.g. right after assignment,
        # or during deserialization/form-cleaning) - these are plaintext,
        # not ciphertext, so no decryption here. Only `from_db_value` above
        # (values freshly read from the database column) sees ciphertext.
        return value

    def get_prep_value(self, value):
        if value is None:
            return value
        return encrypt_data(str(value))
