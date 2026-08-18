# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared embedding-generation-and-search pipeline - a category 9 (AI
features, docs/feature-specs/09-ai-features.md in plane-selfhost)
INFRASTRUCTURE PREREQUISITE, shared by feature 1 (AI-assisted auto-triage:
module/assignee/label suggestions for new issues) and feature 2
(duplicate/similarity detection). See `plane.db.models.issue_embedding` for
the storage model and the pgvector-unavailability rationale.

PROVIDER SUPPORT (deliberate, already decided - do not silently guess):
    - OpenAI: real call via `client.embeddings.create(...)` on the same
      `openai.OpenAI` client shape `plane.utils.workspace_ai.call_llm`
      already constructs for chat completions.
    - Gemini: real call via Gemini's OpenAI-compatible embeddings endpoint
      (same "call it through the openai client, pointed at a different
      base_url" shape `call_llm` already uses for Gemini chat completions).
    - Anthropic: no native embeddings API exists - always returns a clear
      "not supported" error immediately, never attempts a call.
    - Custom OpenAI-compatible: we don't know whether the pointed-at
      endpoint implements `/embeddings` at all - rather than guessing by
      attempting a call, this returns a clear "not supported / not known"
      error.
Every failure mode here (not configured, not enabled, unsupported
provider, API error) is surfaced as a plain `(None, None, error)` tuple -
never an exception - so callers (in particular
`compute_or_refresh_issue_embedding` below) can treat "no embedding
available" as a normal, expected outcome.

REUSES THE SHARED PER-WORKSPACE LLM CONFIG (`WorkspaceAIConfig` /
`plane.utils.workspace_ai`) rather than inventing a second config model -
the embedding call uses the exact same `api_key`/`api_base_url` connection
a workspace already configured for chat completions. There is deliberately
no separate "embedding model" field on `WorkspaceAIConfig` - embeddings use
a fixed, sensible default model per provider (`DEFAULT_EMBEDDING_MODEL`
below), since `WorkspaceAIConfig.model_name` is a *chat* model and the two
are not interchangeable.
"""

import hashlib
import logging
from typing import List, Optional, Tuple

from plane.db.models.ai_config import WorkspaceAIProvider
from plane.utils.exception_logger import log_exception
from plane.utils.workspace_ai import get_workspace_ai_config

logger = logging.getLogger(__name__)

# Sensible current default embedding model per provider. Not meant to be
# exhaustive or configurable (yet) - just a reasonable default so a
# workspace that has already configured a WorkspaceAIConfig for chat
# completions gets embeddings "for free" without a second setup step.
DEFAULT_EMBEDDING_MODEL = {
    WorkspaceAIProvider.OPENAI: "text-embedding-3-small",
    WorkspaceAIProvider.GEMINI: "text-embedding-004",
}

# Gemini's OpenAI-compatibility layer base URL - used only when the
# workspace's WorkspaceAIConfig doesn't already point at a custom
# `api_base_url` of its own.
GEMINI_OPENAI_COMPATIBLE_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai/"


def _hash_text(text: str) -> str:
    return hashlib.sha256((text or "").encode("utf-8")).hexdigest()


def compute_content_hash(name: Optional[str], description_stripped: Optional[str]) -> str:
    """Cheap staleness fingerprint for an issue's embeddable text - hash of
    `name` + stripped (plain-text, non-HTML) `description`. Used both when
    storing an `IssueEmbedding.content_hash` and when checking whether a
    recompute is needed."""
    combined = f"{(name or '').strip()}\n{(description_stripped or '').strip()}"
    return _hash_text(combined)


def _embeddable_text(name: Optional[str], description_stripped: Optional[str]) -> str:
    return f"{(name or '').strip()}\n\n{(description_stripped or '').strip()}".strip()


def _classify_embedding_error(e: Exception, provider: str) -> str:
    error_type = e.__class__.__name__
    if error_type == "AuthenticationError":
        return f"Invalid API key for {provider}"
    elif error_type == "RateLimitError":
        return f"Rate limit exceeded for {provider}"
    elif error_type in ("APITimeoutError", "Timeout", "ReadTimeout"):
        return f"Request to {provider} timed out"
    else:
        return f"Error occurred while generating embedding from {provider}"


def _generate_openai_embedding(
    text: str, api_key: Optional[str], model: str, api_base_url: Optional[str]
) -> List[float]:
    from openai import OpenAI

    client_kwargs = {"api_key": api_key}
    if api_base_url:
        client_kwargs["base_url"] = api_base_url
    client = OpenAI(**client_kwargs)
    response = client.embeddings.create(model=model, input=text)
    return list(response.data[0].embedding)


def _generate_gemini_embedding(
    text: str, api_key: Optional[str], model: str, api_base_url: Optional[str]
) -> List[float]:
    # Gemini exposes an OpenAI-compatible embeddings endpoint, so this
    # reuses the same `openai.OpenAI` client shape as OpenAI itself, just
    # pointed at Gemini's base_url - same trick `call_llm` already uses for
    # Gemini chat completions (plane.utils.workspace_ai).
    from openai import OpenAI

    client = OpenAI(api_key=api_key, base_url=api_base_url or GEMINI_OPENAI_COMPATIBLE_BASE_URL)
    response = client.embeddings.create(model=model, input=text)
    return list(response.data[0].embedding)


_PROVIDER_GENERATORS = {
    WorkspaceAIProvider.OPENAI: _generate_openai_embedding,
    WorkspaceAIProvider.GEMINI: _generate_gemini_embedding,
}


def generate_embedding_for_text(workspace, text: str) -> Tuple[Optional[List[float]], Optional[str], Optional[str]]:
    """Generates an embedding vector for `text` using `workspace`'s own
    `WorkspaceAIConfig`. Returns `(embedding, model_name, error)`:
        - success: `(vector, "<provider>/<model>", None)`.
        - any expected failure (not configured, not enabled, unsupported
          provider, missing API key, provider API error): `(None, None,
          "<clear error message>")`.
    Never raises.
    """
    config = get_workspace_ai_config(workspace)
    if config is None or not config.is_enabled:
        return None, None, "AI features are not configured or not enabled for this workspace."

    provider = config.provider

    if provider == WorkspaceAIProvider.ANTHROPIC:
        # No native embeddings API exists for Anthropic - never attempt a
        # call, surface a clear, immediate "not supported" error instead.
        return None, None, "Embeddings are not supported for provider 'anthropic' (no embeddings API)."

    generator = _PROVIDER_GENERATORS.get(provider)
    model = DEFAULT_EMBEDDING_MODEL.get(provider)
    if generator is None or model is None:
        # CUSTOM_OPENAI_COMPATIBLE (or any future provider not yet wired up
        # here) - we don't know whether the pointed-at endpoint implements
        # an embeddings API, so we don't guess by attempting a call.
        return None, None, f"Embeddings are not supported (or not yet verified) for provider '{provider}'."

    if not config.api_key:
        return None, None, f"No API key configured for provider {provider}."

    if not text:
        return None, None, "No text to embed."

    try:
        vector = generator(text, config.api_key, model, config.api_base_url or None)
    except Exception as e:
        log_exception(e)
        return None, None, _classify_embedding_error(e, provider)

    if not vector:
        return None, None, f"Provider {provider} returned an empty embedding."

    return vector, f"{provider}/{model}", None


def compute_or_refresh_issue_embedding(issue):
    """Computes (or refreshes) the `IssueEmbedding` for `issue`, skipping
    the (costly, external) embedding call entirely when the issue's
    embeddable text hasn't changed since the last computation.

    Returns the `IssueEmbedding` row on success, or `None` on ANY failure
    (embeddings not configured/enabled for the workspace, provider doesn't
    support embeddings, API call failed, nothing to embed) - callers must
    treat `None` as a normal, expected outcome, never a crash. Never
    raises.
    """
    from plane.db.models import IssueEmbedding

    try:
        content_hash = compute_content_hash(issue.name, issue.description_stripped)

        existing = IssueEmbedding.objects.filter(issue_id=issue.id).first()
        if existing is not None and existing.content_hash == content_hash:
            return existing

        text = _embeddable_text(issue.name, issue.description_stripped)
        if not text:
            return None

        vector, model_name, error = generate_embedding_for_text(issue.workspace, text)
        if error or not vector:
            if error:
                logger.info("Skipping embedding for issue %s: %s", issue.id, error)
            return None

        obj, _ = IssueEmbedding.objects.update_or_create(
            issue=issue,
            defaults={
                "project_id": issue.project_id,
                "workspace_id": issue.workspace_id,
                "embedding": vector,
                "content_hash": content_hash,
                "model_name": model_name,
                "embedding_dimension": len(vector),
            },
        )
        return obj
    except Exception as e:
        log_exception(e)
        return None


def cosine_similarity(a: List[float], b: List[float]) -> float:
    """Plain cosine similarity between two vectors. Guards against
    mismatched dimensions (returns `0.0` rather than letting numpy raise or
    silently broadcast into a nonsensical result), and against zero-length
    vectors (also `0.0` - a zero vector has no defined direction)."""
    if not a or not b or len(a) != len(b):
        return 0.0

    import numpy as np

    vec_a = np.asarray(a, dtype=float)
    vec_b = np.asarray(b, dtype=float)

    norm_a = np.linalg.norm(vec_a)
    norm_b = np.linalg.norm(vec_b)
    if norm_a == 0.0 or norm_b == 0.0:
        return 0.0

    return float(np.dot(vec_a, vec_b) / (norm_a * norm_b))


def find_similar_issues(issue, scope_queryset, top_n: int = 5, min_score: float = 0.0):
    """Core similarity search both feature 1 (find similar historical
    issues to base suggestions on) and feature 2 (find likely duplicates)
    call, with different scope querysets and thresholds. Deliberately
    generic - no feature-specific business logic (thresholds, "similar
    enough" cutoffs, module/label frequency stats) lives here.

    `scope_queryset` is a caller-provided `Issue` queryset already filtered
    for project/workspace scope, permissions, and exclusion of
    soft-deleted/draft issues - this function additionally excludes `issue`
    itself and any candidate with no computed embedding.

    Returns a list of `(Issue, score)` tuples, sorted descending by score,
    limited to the top `top_n` entries scoring at least `min_score`.
    """
    from plane.db.models import IssueEmbedding

    source_embedding = IssueEmbedding.objects.filter(issue_id=issue.id).first()
    if source_embedding is None or not source_embedding.embedding:
        return []

    candidate_ids = list(scope_queryset.exclude(id=issue.id).values_list("id", flat=True))
    if not candidate_ids:
        return []

    candidate_embeddings = IssueEmbedding.objects.filter(issue_id__in=candidate_ids).select_related("issue")

    scored = []
    for candidate_embedding in candidate_embeddings:
        if candidate_embedding.embedding_dimension != source_embedding.embedding_dimension:
            # Different embedding model/provider - not a comparable vector
            # space (see plane.db.models.issue_embedding module docstring).
            continue
        score = cosine_similarity(source_embedding.embedding, candidate_embedding.embedding)
        if score >= min_score:
            scored.append((candidate_embedding.issue, score))

    scored.sort(key=lambda pair: pair[1], reverse=True)
    return scored[:top_n]
