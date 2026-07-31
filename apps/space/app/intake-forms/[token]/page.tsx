/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { useParams } from "next/navigation";
import useSWR from "swr";
// plane imports
import { API_BASE_URL } from "@plane/constants";
import type { TIntakeFormPublicConfig, TIntakeFormSubmitResponse } from "@plane/types";
import { Button, Checkbox, Input, Loader } from "@plane/ui";

const fetchFormConfig = async (token: string): Promise<TIntakeFormPublicConfig> => {
  const response = await fetch(`${API_BASE_URL}/api/public/intake-forms/${token}/`);
  if (!response.ok) throw new Error("not_found");
  return response.json();
};

function IntakeFormPage() {
  const params = useParams<{ token: string }>();
  const { token } = params;

  const [renderedAt] = useState(() => new Date().toISOString());
  const [title, setTitle] = useState("");
  const [descriptionHtml, setDescriptionHtml] = useState("");
  const [submitterName, setSubmitterName] = useState("");
  const [submitterEmail, setSubmitterEmail] = useState("");
  const [priority, setPriority] = useState("none");
  const [selectedLabelIds, setSelectedLabelIds] = useState<string[]>([]);
  const [honeypot, setHoneypot] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitResult, setSubmitResult] = useState<TIntakeFormSubmitResponse | null>(null);

  const { data: form, error } = useSWR(
    token ? `PUBLIC_INTAKE_FORM_${token}` : null,
    token ? () => fetchFormConfig(token) : null,
    { revalidateOnFocus: false }
  );

  const toggleLabel = (labelId: string) => {
    setSelectedLabelIds((current) =>
      current.includes(labelId) ? current.filter((id) => id !== labelId) : [...current, labelId]
    );
  };

  const priorityLabels = useMemo(
    () => ({ urgent: "Urgent", high: "High", medium: "Medium", low: "Low", none: "None" }) as Record<string, string>,
    []
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setSubmitError(null);

    if (!title.trim()) {
      setSubmitError("Title is required.");
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/public/intake-forms/${token}/submit/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description_html: descriptionHtml,
          submitter_name: submitterName || undefined,
          submitter_email: submitterEmail || undefined,
          priority: form?.show_priority_field ? priority : undefined,
          label_ids: form?.show_labels_field ? selectedLabelIds : undefined,
          honeypot,
          form_rendered_at: renderedAt,
        }),
      });

      if (response.status === 429) {
        setSubmitError("Too many submissions. Please try again later.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        setSubmitError(body?.error ?? "Unable to submit. Please try again.");
        return;
      }

      const result: TIntakeFormSubmitResponse = await response.json();
      if (result.redirect_url) {
        window.location.href = result.redirect_url;
        return;
      }
      setSubmitResult(result);
    } catch {
      setSubmitError("Unable to submit. Please check your connection and try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-2">
        <p className="text-14 text-secondary">This form is not available.</p>
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-2">
        <Loader className="w-full max-w-md">
          <Loader.Item height="200px" />
        </Loader>
      </div>
    );
  }

  if (submitResult) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-surface-2 px-4">
        <div className="w-full max-w-md rounded-md border border-subtle bg-surface-1 p-6 text-center">
          <p className="text-14 text-primary">{submitResult.success_message}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen w-full justify-center bg-surface-2 px-4 py-10">
      <form
        onSubmit={handleSubmit}
        className="relative w-full max-w-lg rounded-md border border-subtle bg-surface-1 p-6"
      >
        <h1 className="text-20 font-semibold text-primary">{form.name}</h1>
        {form.description_html && (
          <div className="mt-2 text-13 text-secondary" dangerouslySetInnerHTML={{ __html: form.description_html }} />
        )}

        <div className="mt-6 flex flex-col gap-4">
          <div>
            <label htmlFor="intake-form-title" className="mb-1 block text-13 font-medium text-secondary">
              Title
            </label>
            <Input
              id="intake-form-title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={255}
              className="w-full"
              required
            />
          </div>

          <div>
            <label htmlFor="intake-form-description" className="mb-1 block text-13 font-medium text-secondary">
              Description
            </label>
            <textarea
              id="intake-form-description"
              value={descriptionHtml}
              onChange={(e) => setDescriptionHtml(e.target.value)}
              rows={4}
              className="w-full rounded-md border-[0.5px] border-subtle-1 bg-layer-2 p-2 text-13 focus:outline-none"
            />
          </div>

          <div>
            <label htmlFor="intake-form-submitter-name" className="mb-1 block text-13 font-medium text-secondary">
              Your name {form.require_submitter_name ? "" : "(optional)"}
            </label>
            <Input
              id="intake-form-submitter-name"
              type="text"
              value={submitterName}
              onChange={(e) => setSubmitterName(e.target.value)}
              className="w-full"
              required={form.require_submitter_name}
            />
          </div>

          <div>
            <label htmlFor="intake-form-submitter-email" className="mb-1 block text-13 font-medium text-secondary">
              Your email {form.require_submitter_email ? "" : "(optional)"}
            </label>
            <Input
              id="intake-form-submitter-email"
              type="email"
              value={submitterEmail}
              onChange={(e) => setSubmitterEmail(e.target.value)}
              className="w-full"
              required={form.require_submitter_email}
            />
          </div>

          {form.show_priority_field && (
            <div>
              <label htmlFor="intake-form-priority" className="mb-1 block text-13 font-medium text-secondary">
                Priority
              </label>
              <select
                id="intake-form-priority"
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-md border-[0.5px] border-subtle-1 bg-layer-2 p-2 text-13 focus:outline-none"
              >
                {form.priorities.map((p) => (
                  <option key={p} value={p}>
                    {priorityLabels[p] ?? p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {form.show_labels_field && form.labels.length > 0 && (
            <div>
              <p className="mb-1 text-13 font-medium text-secondary">Labels</p>
              <div className="flex flex-wrap gap-3">
                {form.labels.map((label) => (
                  <label
                    key={label.id}
                    htmlFor={`intake-form-label-${label.id}`}
                    className="flex items-center gap-1.5 text-13 text-secondary"
                  >
                    <Checkbox
                      id={`intake-form-label-${label.id}`}
                      checked={selectedLabelIds.includes(label.id)}
                      onChange={() => toggleLabel(label.id)}
                    />
                    {label.name}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Honeypot field - hidden from real users via CSS, only bots
              filling every input will populate this. */}
          <div className="absolute -left-[9999px]" aria-hidden="true">
            <label htmlFor="intake-form-website">Website</label>
            <input
              id="intake-form-website"
              type="text"
              tabIndex={-1}
              autoComplete="off"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
            />
          </div>

          {submitError && <p className="text-danger-strong text-13">{submitError}</p>}

          <Button type="submit" variant="primary" size="md" loading={isSubmitting} className="w-full">
            Submit
          </Button>
        </div>
      </form>
    </div>
  );
}

export default IntakeFormPage;
