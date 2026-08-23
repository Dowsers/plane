/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/**
 * Category 11 (docs/feature-specs/11-admin-security-sso.md in
 * plane-selfhost), feature 6 ("Politiques de securite configurables"),
 * exigence 8 - reusable guard for any API call that MAY be rejected with
 * `REAUTH_REQUIRED` (`plane.utils.reauth.guard_sensitive_action`, 401)
 * when `WorkspaceSecurityPolicy.force_reauth_for_sensitive_actions=True`
 * and the caller's last real authentication is stale (>15 min).
 *
 * Usage - wrap any sensitive action's API call with `runGuarded`, and
 * render `<ReauthModal>` (see `@/components/workspace/settings/security/
 * reauth-modal`) bound to this hook's own state anywhere in the same
 * component tree:
 *
 *   const { runGuarded, ...reauthModalProps } = useSensitiveActionGuard(workspaceSlug);
 *   const onDelete = () => runGuarded(() => service.deleteThing(...));
 *   return <>...<ReauthModal {...reauthModalProps} /></>;
 *
 * On a `REAUTH_REQUIRED` rejection, `runGuarded` opens the modal and
 * returns a promise that stays pending until the challenge either
 * succeeds (the ORIGINAL action is transparently retried and its result/
 * error becomes this promise's own outcome) or is cancelled (the promise
 * rejects with the original `REAUTH_REQUIRED` error, so a caller's own
 * `catch` still runs exactly once either way).
 */
import { useCallback, useRef, useState } from "react";
// helpers
import { isReauthRequiredError } from "@/helpers/reauth.helper";

type TPendingRetry = {
  run: () => void;
  /** Cancel (modal closed without completing the challenge) - rejects the
   * caller's promise with the ORIGINAL `REAUTH_REQUIRED` error so a
   * `catch` still runs exactly once, matching this hook's own docstring. */
  cancel: () => void;
};

export function useSensitiveActionGuard(workspaceSlug: string) {
  const [isReauthModalOpen, setIsReauthModalOpen] = useState(false);
  const pendingRetryRef = useRef<TPendingRetry | null>(null);

  const runGuarded = useCallback(<T>(action: () => Promise<T>): Promise<T> => {
    return action().catch((error: unknown) => {
      if (!isReauthRequiredError(error)) throw error;

      return new Promise<T>((resolve, reject) => {
        pendingRetryRef.current = {
          run: () => {
            action().then(resolve, reject);
          },
          cancel: () => reject(error),
        };
        setIsReauthModalOpen(true);
      });
    });
  }, []);

  const handleReauthSuccess = useCallback(() => {
    setIsReauthModalOpen(false);
    const pending = pendingRetryRef.current;
    pendingRetryRef.current = null;
    pending?.run();
  }, []);

  const handleReauthClose = useCallback(() => {
    setIsReauthModalOpen(false);
    const pending = pendingRetryRef.current;
    pendingRetryRef.current = null;
    pending?.cancel();
  }, []);

  return {
    runGuarded,
    workspaceSlug,
    isReauthModalOpen,
    onReauthSuccess: handleReauthSuccess,
    onReauthClose: handleReauthClose,
  };
}
