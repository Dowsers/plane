# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


class FlexibleQueryError(Exception):
    """Raised for any client-input problem that must reject the whole
    request with HTTP 400 *before* any query is executed (exigence 5/6 of
    docs/feature-specs/08-api-webhooks-cli.md, section 1, in plane-selfhost):
    unknown entity/relation/field, malformed shape, depth exceeded, cost
    exceeded. Never raised for a problem discovered mid-resolution - those
    become entries in the response's `errors[]` array instead (partial
    resolution, exigence 9), not a wholesale 400/500.
    """

    def __init__(self, message, code="invalid_query"):
        self.message = message
        self.code = code
        super().__init__(message)


class FlexibleQueryBranchTimeout(Exception):
    """Internal signal: one branch's query exceeded its remaining time
    budget. Caught by the resolver and turned into an `errors[]` entry for
    that branch (partial resolution) - or, if it happens on the root query
    itself, turned into a whole-request HTTP 504 (exigence 15), since there
    is no partial root to serve.
    """
