# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""
Shared LLM-call plumbing + per-workspace config lookup - category 9 (AI
features, docs/feature-specs/09-ai-features.md in plane-selfhost)
infrastructure prerequisite. See `plane.db.models.ai_config` for the full
design rationale of `WorkspaceAIConfig`.

`call_llm()` factors out the REUSABLE part of what used to live only inside
`plane.app.views.external.base.get_llm_response` - provider dispatch
(including the Gemini model-name-prefix quirk), the `openai.OpenAI` client
call shape (used even for Anthropic/Gemini via an OpenAI-compatible client
shape - real, existing behavior, not changed here), and the
`AuthenticationError`/`RateLimitError` exception classification.
`get_llm_response` in `external/base.py` now calls through to `call_llm`
internally instead of duplicating this logic - so there is exactly one real
implementation of "how do we call an LLM provider," used by both the old
instance-wide code path and this new per-workspace one. This refactor is a
zero-behavior-change refactor for the existing `GPTIntegrationEndpoint`/
`WorkspaceGPTIntegrationEndpoint` code path - same success/error shapes.

DELIBERATE DESIGN DECISION, already made - no instance-wide fallback:
`get_workspace_llm_response` never falls back to the instance-wide
`LLM_API_KEY` "God Mode" config (`external.base.get_llm_config`) if a
workspace hasn't configured (or hasn't enabled) its own `WorkspaceAIConfig`.
Each workspace's AI features require that workspace's own explicit
opt-in - this keeps isolation clean and matches every category 9 spec's own
"explicit opt-in, disabled by default" requirement. If `WorkspaceAIConfig`
doesn't exist, or `is_enabled=False`, the workspace-scoped helper below
returns a clear "not configured" error, never silently uses the
instance-wide key.
"""

from typing import Dict, List, Optional, Tuple

from openai import OpenAI

from plane.utils.exception_logger import log_exception


def call_llm(
    prompt: Optional[str] = None,
    api_key: Optional[str] = None,
    model: Optional[str] = None,
    provider: Optional[str] = None,
    system_prompt: Optional[str] = None,
    api_base_url: Optional[str] = None,
    timeout: Optional[float] = None,
    messages: Optional[List[Dict[str, str]]] = None,
) -> Tuple[Optional[str], Optional[str]]:
    """Make a single, synchronous, non-streaming chat-completion call
    against `provider` and return `(text, error)` - exactly the call shape
    `get_llm_response` used before this refactor (Anthropic/Gemini are
    still called via an OpenAI-compatible client shape).

    `system_prompt`/`api_base_url`/`timeout` are additive, optional
    parameters new callers can use - passing none of them reproduces the
    exact prior `get_llm_response` behavior. `timeout` (seconds) is added
    for category 9 feature 6 (AI-assisted status update drafting, exigence
    10's 20s timeout requirement) - when omitted, the `openai` client's own
    default timeout applies, unchanged from before this parameter existed.

    `messages` (added for category 9 feature 3, "Assistant de chat IA
    in-app" - multi-turn conversation support) is an additive, optional
    full `[{"role": ..., "content": ...}, ...]` list. When provided, it is
    sent to the provider AS-IS, and `prompt`/`system_prompt` are ignored
    entirely - the caller is responsible for including any system message
    in this list. When omitted (every pre-existing caller), behavior is
    byte-for-byte unchanged: a `[{"role": "user", ...}]` list, optionally
    prefixed with a `system` message built from `system_prompt`.
    """
    try:
        # For Gemini, prepend provider name to model - same quirk as before.
        if provider.lower() == "gemini":
            model = f"gemini/{model}"

        client_kwargs = {"api_key": api_key}
        if api_base_url:
            client_kwargs["base_url"] = api_base_url
        if timeout is not None:
            client_kwargs["timeout"] = timeout
        client = OpenAI(**client_kwargs)

        if messages is None:
            messages = []
            if system_prompt:
                messages.append({"role": "system", "content": system_prompt})
            messages.append({"role": "user", "content": prompt})

        chat_completion = client.chat.completions.create(model=model, messages=messages)
        text = chat_completion.choices[0].message.content
        return text, None
    except Exception as e:
        log_exception(e)
        error_type = e.__class__.__name__
        if error_type == "AuthenticationError":
            return None, f"Invalid API key for {provider}"
        elif error_type == "RateLimitError":
            return None, f"Rate limit exceeded for {provider}"
        elif error_type in ("APITimeoutError", "Timeout", "ReadTimeout"):
            return None, f"Request to {provider} timed out"
        else:
            return None, f"Error occurred while generating response from {provider}"


def get_workspace_ai_config(workspace):
    """Returns the workspace's `WorkspaceAIConfig` row, or `None` if it has
    never configured one. Does NOT check `is_enabled` - callers that care
    about the opt-in flag (i.e. everyone calling this for a real LLM
    request, as opposed to a settings-page GET) should use
    `get_workspace_llm_response` instead, or check `.is_enabled` themselves.
    """
    from plane.db.models import WorkspaceAIConfig

    return WorkspaceAIConfig.objects.filter(workspace=workspace).first()


def get_workspace_llm_response(
    workspace, task: str, prompt: str, timeout: Optional[float] = None
) -> Tuple[Optional[str], Optional[str]]:
    """The function future category 9 features (thread summary,
    status-update drafting, auto-triage, digest, chat assistant) should
    actually call. Fetches the workspace's own `WorkspaceAIConfig` and
    calls `call_llm` - returns a clear "not configured" error if the
    workspace has no config row or has not enabled it. Never falls back to
    the instance-wide `LLM_API_KEY` (see module docstring).

    `timeout` (seconds) is optional and additive - passed straight through
    to `call_llm`. Existing callers that don't pass it see no behavior
    change.
    """
    from plane.db.models.ai_config import WorkspaceAIProvider

    config = get_workspace_ai_config(workspace)
    if config is None or not config.is_enabled:
        return None, "AI features are not configured or not enabled for this workspace."

    if not config.api_key and config.provider != WorkspaceAIProvider.CUSTOM_OPENAI_COMPATIBLE:
        return None, f"No API key configured for provider {config.provider}."

    final_text = f"{task}\n{prompt}" if prompt else task
    return call_llm(
        prompt=final_text,
        api_key=config.api_key,
        model=config.model_name,
        provider=config.provider,
        api_base_url=config.api_base_url or None,
        timeout=timeout,
    )


def get_workspace_llm_chat_response(
    workspace, messages: List[Dict[str, str]], timeout: Optional[float] = None
) -> Tuple[Optional[str], Optional[str]]:
    """Multi-turn equivalent of `get_workspace_llm_response`, added for
    category 9 feature 3 ("Assistant de chat IA in-app" - the in-app chat
    assistant, the only category 9 feature that needs a full conversation
    history rather than a single task+prompt string). Same "not configured
    or not enabled" / "no API key" gating, same underlying `call_llm` -
    this is a thin wrapper, not a third parallel LLM-calling
    implementation.

    `messages` is the full `[{"role": "system"|"user"|"assistant",
    "content": ...}, ...]` list the caller wants sent - typically a system
    prompt (context + instructions) followed by the conversation's prior
    `AIMessage` rows in order.
    """
    from plane.db.models.ai_config import WorkspaceAIProvider

    config = get_workspace_ai_config(workspace)
    if config is None or not config.is_enabled:
        return None, "AI features are not configured or not enabled for this workspace."

    if not config.api_key and config.provider != WorkspaceAIProvider.CUSTOM_OPENAI_COMPATIBLE:
        return None, f"No API key configured for provider {config.provider}."

    return call_llm(
        messages=messages,
        api_key=config.api_key,
        model=config.model_name,
        provider=config.provider,
        api_base_url=config.api_base_url or None,
        timeout=timeout,
    )
