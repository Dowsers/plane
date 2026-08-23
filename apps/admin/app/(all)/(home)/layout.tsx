/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useRouter } from "next/navigation";
import { Outlet } from "react-router";
// helpers
import { consumePendingSamlTestConnection } from "@/helpers/saml-test-connection";
// hooks
import { useUser } from "@/hooks/store/use-user";

function RootLayout() {
  // router
  const { replace } = useRouter();
  // store hooks
  const { isUserLoggedIn } = useUser();

  useEffect(() => {
    if (isUserLoggedIn !== true) return;

    // Category 11 (docs/feature-specs/11-admin-security-sso.md in
    // plane-selfhost), feature 1, exigence 13 - the SAML test-connection
    // ACS flow always lands here (bare admin root), never on the specific
    // SAML config page the test was launched from - see
    // `@/helpers/saml-test-connection`'s own module docstring. Forward to
    // that config page instead of the generic "/general" redirect below,
    // which would otherwise discard the result before anything can read it.
    if (typeof window !== "undefined" && window.location.search.includes("saml_test_result")) {
      const pendingConfigId = consumePendingSamlTestConnection(window.location.search);
      replace(pendingConfigId ? `/authentication/saml/${pendingConfigId}` : "/authentication/saml");
      return;
    }

    replace("/general");
  }, [replace, isUserLoggedIn]);

  return (
    <div className="relative z-10 flex h-screen w-screen flex-col items-center overflow-hidden overflow-y-auto bg-surface-1 px-8 pt-6 pb-10">
      <Outlet />
    </div>
  );
}

export default observer(RootLayout);
