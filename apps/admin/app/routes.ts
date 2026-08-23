/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { index, layout, route } from "@react-router/dev/routes";
import type { RouteConfig } from "@react-router/dev/routes";

export default [
  layout("./(all)/(home)/layout.tsx", [index("./(all)/(home)/page.tsx")]),
  layout("./(all)/(dashboard)/layout.tsx", [
    route("general", "./(all)/(dashboard)/general/page.tsx"),
    route("workspace", "./(all)/(dashboard)/workspace/page.tsx"),
    route("workspace/create", "./(all)/(dashboard)/workspace/create/page.tsx"),
    route("email", "./(all)/(dashboard)/email/page.tsx"),
    route("authentication", "./(all)/(dashboard)/authentication/page.tsx"),
    route("authentication/github", "./(all)/(dashboard)/authentication/github/page.tsx"),
    route("authentication/gitlab", "./(all)/(dashboard)/authentication/gitlab/page.tsx"),
    route("authentication/google", "./(all)/(dashboard)/authentication/google/page.tsx"),
    route("authentication/gitea", "./(all)/(dashboard)/authentication/gitea/page.tsx"),
    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), feature 1 "SSO SAML 2.0 natif" - god-mode SAML SSO
    // configuration list/create/edit, nested under Authentication like
    // every other provider above.
    route("authentication/saml", "./(all)/(dashboard)/authentication/saml/page.tsx"),
    route("authentication/saml/create", "./(all)/(dashboard)/authentication/saml/create/page.tsx"),
    route("authentication/saml/:configId", "./(all)/(dashboard)/authentication/saml/[configId]/page.tsx"),
    route("ai", "./(all)/(dashboard)/ai/page.tsx"),
    route("image", "./(all)/(dashboard)/image/page.tsx"),
    route("security", "./(all)/(dashboard)/security/page.tsx"),
  ]),
  // Catch-all route for 404 handling - must be last
  route("*", "./components/404.tsx"),
] satisfies RouteConfig;
