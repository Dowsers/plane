/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { ShieldCheck } from "lucide-react";

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), features 3+5 merged - shown to a workspace Admin who is
 * NOT the real Owner when they open Settings > Security. Per the spec's
 * own suggested copy ("Workspace Settings > Security (nouvel onglet,
 * visible uniquement pour l'Owner ; les autres Admins voient un etat vide
 * 'Reserve au proprietaire du workspace, contactez-le')"). The tab itself
 * stays visible to every Admin (nav-level gating is role-only, see
 * `WORKSPACE_SETTINGS.security` in @plane/constants) - only the CONTENT is
 * restricted here, so a non-Owner Admin at least discovers the feature
 * exists and knows whom to ask.
 */
export function RestrictedToOwnerView() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-subtle bg-layer-2 px-6 py-16 text-center">
      <div className="grid size-12 place-items-center rounded-full bg-layer-3">
        <ShieldCheck className="size-5 text-tertiary" />
      </div>
      <h4 className="text-body-sm-medium text-primary">Reserved for the workspace Owner</h4>
      <p className="max-w-md text-body-xs-regular text-tertiary">
        Security settings and the audit log are reserved for the workspace Owner. Contact the current Owner if you need
        access.
      </p>
    </div>
  );
}
