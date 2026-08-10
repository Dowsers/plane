/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
// plane imports
import { Badge } from "@plane/propel/badge";
import type { IWebhook, TWebhookTestSendResponse } from "@plane/types";
import { Button } from "@plane/ui";
// local imports
import { JsonTree } from "@/components/api-explorer/json-tree";
import { apiExplorerService } from "@/components/api-explorer/service";

type TEventOption = { key: keyof IWebhook; label: string };

const EVENT_OPTIONS: TEventOption[] = [
  { key: "project", label: "Project" },
  { key: "issue", label: "Issue" },
  { key: "module", label: "Module" },
  { key: "cycle", label: "Cycle" },
  { key: "issue_comment", label: "Issue comment" },
  { key: "workflow_rule", label: "Automation rule" },
  { key: "workflow_transition", label: "Governed workflow" },
];

type Props = {
  workspaceSlug: string;
  webhook: IWebhook;
};

/**
 * Test-send panel (spec exigence 6/item 9, docs/feature-specs/08-api-webhooks-cli.md
 * "6. Explorateur d'API interactif" in plane-selfhost) - deliberately
 * placed INSIDE the existing webhook detail page
 * (webhooks/[webhookId]/page.tsx) rather than as a separate
 * webhook-picker screen inside the API Explorer settings tab: this page
 * already has the one piece of context a test-send actually needs (which
 * events this specific webhook is subscribed to, via its own boolean
 * columns), so a separate picker would just be a second, redundant way to
 * get to the same webhook. See this feature's final report for the full
 * reasoning.
 *
 * Admin-only: this page already gates the entire webhook detail screen to
 * Admins before this panel ever renders, and the backend
 * (`WebhookTestSendEndpoint`) independently enforces the same Admin-only
 * rule regardless - this component does not duplicate that gate itself.
 */
export function WebhookTestSendPanel({ workspaceSlug, webhook }: Props) {
  const subscribedEvents = useMemo(() => EVENT_OPTIONS.filter((option) => Boolean(webhook[option.key])), [webhook]);

  const [eventType, setEventType] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [result, setResult] = useState<TWebhookTestSendResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!subscribedEvents.some((option) => option.key === eventType)) {
      setEventType(subscribedEvents[0]?.key ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subscribedEvents]);

  const handleSend = async () => {
    if (!eventType) return;
    setIsSending(true);
    setError(null);
    setResult(null);
    try {
      const response = await apiExplorerService.testWebhook(workspaceSlug, webhook.id, {
        event_type: eventType,
        source: "settings_ui",
      });
      setResult(response);
    } catch (err: unknown) {
      const message = (err as { error?: string })?.error ?? "Something went wrong while sending the test event.";
      setError(message);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-md border border-subtle p-4">
      <div>
        <h5 className="text-14 font-medium text-primary">Send a test event</h5>
        <p className="text-13 text-tertiary">
          Sends a real HTTP request with an example payload to this webhook's URL, signed the same way a real event
          would be - it never triggers a real workspace change.
        </p>
      </div>

      {subscribedEvents.length === 0 ? (
        <p className="text-13 text-tertiary">
          This webhook isn't subscribed to any event yet - enable at least one above and save before you can send a
          test.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="focus:border-accent-primary rounded-md border border-subtle bg-layer-1 px-2 py-1.5 text-13 text-primary outline-none"
          >
            {subscribedEvents.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <Button
            variant="neutral-primary"
            size="sm"
            onClick={handleSend}
            loading={isSending}
            prependIcon={<Send className="size-3.5" />}
          >
            Send test event
          </Button>
        </div>
      )}

      {error && <p className="text-13 text-danger-primary">{error}</p>}

      {result && (
        <div className="flex flex-col gap-2 rounded-md border border-subtle bg-layer-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={result.delivered ? "success" : "danger"} size="base">
              {result.delivered ? "Delivered" : "Not delivered"}
            </Badge>
            {result.response_status_code !== undefined && (
              <span className="text-12 text-tertiary">HTTP {result.response_status_code}</span>
            )}
            {result.latency_ms !== undefined && <span className="text-12 text-tertiary">{result.latency_ms}ms</span>}
          </div>
          {result.error && <p className="text-12 text-danger-primary">{result.error}</p>}
          <div>
            <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">Payload sent</span>
            <div className="mt-1 max-h-[240px] overflow-auto rounded-md border border-subtle bg-layer-2 p-2">
              <JsonTree value={result.payload} />
            </div>
          </div>
          {result.response_body && (
            <div>
              <span className="text-11 font-semibold tracking-wide text-tertiary uppercase">
                Receiver response body
              </span>
              <pre className="mt-1 max-h-[160px] overflow-auto rounded-md border border-subtle bg-layer-2 p-2 text-12 text-primary">
                {result.response_body}
              </pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
