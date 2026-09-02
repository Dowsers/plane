/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import { Badge } from "@plane/propel/badge";
import { AlertModalCore } from "@plane/ui";

export type TPendingMutation = {
  method: string;
  url: string;
};

type Props = {
  pending: TPendingMutation | null;
  isSubmitting: boolean;
  onCancel: () => void;
  onConfirm: () => void;
};

/**
 * Spec exigence 5 (docs/feature-specs/08-api-webhooks-cli.md, "6.
 * Explorateur d'API interactif", in plane-selfhost): "ce comportement ne
 * peut pas etre desactive par un simple toggle utilisateur" - every
 * POST/PATCH/PUT/DELETE fired from the explorer must show this modal,
 * every single time. This is enforced structurally, not by convention:
 * `pending` is state that gets set right before a mutating call and
 * cleared right after confirm/cancel (see root.tsx's `handleExecute`) -
 * there is no persisted "don't ask me again" flag anywhere in this
 * feature's state, session storage, or settings for this component to
 * even check.
 */
export function ConfirmMutationModal({ pending, isSubmitting, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  return (
    <AlertModalCore
      variant="danger"
      isOpen={pending !== null}
      handleClose={onCancel}
      handleSubmit={onConfirm}
      isSubmitting={isSubmitting}
      title={t("api_explorer.confirm_mutation.title")}
      primaryButtonText={{
        default: t("api_explorer.confirm_mutation.send_request"),
        loading: t("api_explorer.confirm_mutation.sending"),
      }}
      secondaryButtonText={t("cancel")}
      content={
        pending && (
          <div className="flex flex-col gap-2">
            <p>
              {t("api_explorer.confirm_mutation.warning_prefix")} <strong>{pending.method.toUpperCase()}</strong>{" "}
              {t("api_explorer.confirm_mutation.warning_suffix")}
            </p>
            <div className="flex items-center gap-2 rounded-md border border-subtle bg-layer-1 p-2">
              <Badge variant="danger" size="base">
                {pending.method.toUpperCase()}
              </Badge>
              <code className="truncate text-12 text-secondary">{pending.url}</code>
            </div>
          </div>
        )
      }
    />
  );
}
