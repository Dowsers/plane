/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// layouts
import { DevErrorComponent } from "./dev";
import { ProdErrorComponent } from "./prod";

// This is the root ErrorBoundary (see root.tsx), which React Router can invoke before
// the Router's own context is established (e.g. errors during the root document render).
// Router hooks like useNavigate() require that context and will crash with a confusing
// "Cannot destructure ... as it is null" error if called here, masking the real error.
// Use plain browser navigation instead.
const handleGoHome = () => {
  window.location.href = "/";
};
const handleReload = () => window.location.reload();

export function CustomErrorComponent({ error }: { error: unknown }) {
  if (import.meta.env.DEV) {
    return <DevErrorComponent error={error} onGoHome={handleGoHome} onReload={handleReload} />;
  }

  return <ProdErrorComponent onGoHome={handleGoHome} />;
}
