/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/** The question keys of the issued impartiality form, as shipped by
 * `DEFAULT_IMPARTIALITY_QUESTIONNAIRE` in `plane/db/models/inspection.py`.
 *
 * Duplicated here on purpose rather than derived: if the business revises the
 * form, the frontend should be revisited deliberately (category labels, answer
 * styles, ordering) rather than silently absorbing the change. */
export const DEFAULT_IMPARTIALITY_QUESTIONNAIRE_KEYS = [
  "financial_interest",
  "team_relationships",
  "worked_or_applied_12_months",
  "received_remuneration",
  "competing_project",
  "solicited_favourable_opinion",
  "free_from_pressure",
  "verifiable_technical_facts_only",
  "will_report_competence_limits",
  "accepts_peer_review",
  "aware_of_financial_legal_impact",
  "accepted_ethics_charter",
  "known_personal_bias",
  "answered_honestly",
  "attests_impartiality",
] as const;
