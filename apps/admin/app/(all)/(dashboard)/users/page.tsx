/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { CopyIcon } from "@plane/propel/icons";
import { Button } from "@plane/propel/button";
import { InstanceService } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Input } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
// components
import { PageWrapper } from "@/components/common/page-wrapper";
// types
import type { Route } from "./+types/page";

const instanceService = new InstanceService();

const UsersPage = observer(function UsersPage(_props: Route.ComponentProps) {
  // state
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [resetLink, setResetLink] = useState("");

  const resetResult = () => {
    setResetLink("");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    setIsLoading(true);
    resetResult();
    try {
      const response = await instanceService.generateUserPasswordResetLink(email);
      setResetLink(response.reset_link);
    } catch (caughtError: unknown) {
      const err = caughtError as { error?: string };
      setError(err?.error || "Failed to generate a reset link. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    copyTextToClipboard(resetLink).then(() =>
      setToast({ type: TOAST_TYPE.SUCCESS, title: "Copied", message: "Reset link copied to clipboard." })
    );
  };

  const handleGenerateAnother = () => {
    setEmail("");
    resetResult();
  };

  return (
    <PageWrapper
      header={{
        title: "Users",
        description:
          "Generate a password reset link for a user who forgot their password. Since this instance has no email server configured, the link is not sent automatically — copy it and share it with the user yourself.",
      }}
    >
      <div className="max-w-lg space-y-4">
        {!resetLink ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="user_email" className="text-13 font-medium text-primary">
                User&apos;s email
              </label>
              <Input
                id="user_email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                className="w-full text-16"
                required
              />
            </div>
            {error && <p className="text-13 text-danger-primary">{error}</p>}
            <Button variant="primary" size="lg" type="submit" loading={isLoading} disabled={!email || isLoading}>
              {isLoading ? "Generating link" : "Generate reset link"}
            </Button>
          </form>
        ) : (
          <div className="space-y-4">
            <p className="text-13 text-secondary">
              Share this link with <span className="font-medium text-primary">{email}</span> through a secure channel
              (chat, in person, phone). It lets them set a new password and expires in a few days. It will not be shown
              again after you leave this page.
            </p>
            <div className="flex items-center gap-2">
              <Input readOnly value={resetLink} className="w-full text-13" />
              <Button variant="secondary" size="lg" onClick={handleCopy} prependIcon={<CopyIcon className="size-4" />}>
                Copy
              </Button>
            </div>
            <Button variant="link" size="sm" onClick={handleGenerateAnother}>
              Generate another link
            </Button>
          </div>
        )}
      </div>
    </PageWrapper>
  );
});

export const meta: Route.MetaFunction = () => [{ title: "Users - God Mode" }];

export default UsersPage;
