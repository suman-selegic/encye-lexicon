import os
from urllib.parse import unquote, urlparse

from openai import OpenAI

from agent import DEFAULT_LENGTH, DEFAULT_STYLE, STYLES

# Model used for the OpenAI-backed summarizer. Must support the native
# `web_search` tool (e.g. gpt-5.5, gpt-4.1, gpt-4.1-mini).
OPENAI_MODEL = os.getenv("OPENAI_SUMMARIZE_MODEL", "gpt-5.4-mini")

# The model researches each topic with its native web search tool; we don't
# fetch any pages ourselves. Only style and length guidance are customizable.
# The rules are phrased to handle one OR many topics so the same route can back
# both the single-topic and batch summarizers — the batch caller supplies the
# delimiter/formatting instructions via the style guidance.
_FIXED_RULES = (
    "Write a summary for each topic provided. Use the web search tool to "
    "research each one and gather accurate, up-to-date information.\n"
    "Rules:\n"
    "- Base each summary on what reliable sources say; do not invent facts.\n"
    "- If a topic cannot be found, say so.\n"
    "- When multiple topics are given, summarize each one separately and "
    "follow any formatting or delimiter instructions provided below."
)

_client: OpenAI | None = None


def _get_client() -> OpenAI:
    """Lazily construct a shared OpenAI client (reads OPENAI_API_KEY)."""
    global _client
    if _client is None:
        _client = OpenAI()
    return _client


def topic_from_wiki_url(url: str) -> str:
    """Extract a human-readable topic from a Wikipedia URL.

    e.g. https://en.wikipedia.org/wiki/Albert_Einstein -> "Albert Einstein".
    Falls back to the raw URL if no /wiki/<title> segment is present.
    """
    path = urlparse(url).path
    marker = "/wiki/"
    if marker in path:
        slug = path.split(marker, 1)[1]
        return unquote(slug).replace("_", " ").strip() or url
    return url


def _build_instruction(
    topic: str, style_guidance: str | None = None, length: int | None = None
) -> str:
    """Assemble the prompt from the fixed rules plus style/length guidance.

    Mirrors agent.build_agent's instruction layout: a blank guidance falls back
    to the default style and a non-positive length to DEFAULT_LENGTH.
    """
    words = length if length and length > 0 else DEFAULT_LENGTH
    guidance = style_guidance or STYLES[DEFAULT_STYLE][1]
    return (
        f"{_FIXED_RULES}\n"
        f"- Aim for approximately {words} words.\n"
        f"- {guidance}\n\n"
        f"Topic: {topic}"
    )


def summarize_with_search(
    url: str,
    style_guidance: str | None = None,
    length: int | None = None,
) -> tuple[str, dict[str, int] | None]:
    """Summarize a Wikipedia URL's topic using OpenAI's native web search.

    The topic is parsed from the URL; the model gathers information via its
    own web search tool (we make no tool calls of our own).

    Args:
        url: The Wikipedia URL whose topic should be summarized.
        style_guidance: The style instruction (resolved by the caller).
        length: Target summary length in words.

    Returns:
        A `(summary, usage)` tuple. `usage` reports the call's token counts as
        ``{"input_tokens", "output_tokens", "total_tokens"}``, or None if the
        API did not return usage data.
    """
    topic = topic_from_wiki_url(url)
    instruction = _build_instruction(topic, style_guidance, length)
    response = _get_client().responses.create(
        model=OPENAI_MODEL,
        tools=[{"type": "web_search"}],
        input=instruction,
    )
    usage = None
    if response.usage is not None:
        usage = {
            "input_tokens": response.usage.input_tokens,
            "output_tokens": response.usage.output_tokens,
            "total_tokens": response.usage.total_tokens,
        }
    return response.output_text, usage
