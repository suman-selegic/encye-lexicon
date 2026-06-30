import os

import requests
from bs4 import BeautifulSoup
from google.adk.agents import Agent
from google.adk.models.lite_llm import LiteLlm

_LM_STUDIO_URL = os.getenv("LM_STUDIO_URL", "http://localhost:1234/v1")
_LM_STUDIO_MODEL = os.getenv("LM_STUDIO_MODEL", "google/gemma-4-12b-qat")

# A descriptive User-Agent is required by sites like Wikipedia, which return 403
# to the default python-requests UA used by google.adk's built-in load_web_page.
_USER_AGENT = (
    "encye-lexicon/0.1 (Wikipedia summarizer; contact: sumandroid12@gmail.com)"
)


def load_web_page(url: str) -> str:
    """Fetches the content at the given URL and returns its text.

    Args:
        url: The URL of the web page to fetch.

    Returns:
        The extracted text content of the page, or an error message if the
        page could not be fetched.
    """
    try:
        response = requests.get(
            url, timeout=30, headers={"User-Agent": _USER_AGENT}
        )
    except requests.RequestException as exc:
        return f"Failed to fetch url: {url} ({exc})"

    if response.status_code != 200:
        return f"Failed to fetch url: {url} (status {response.status_code})"

    soup = BeautifulSoup(response.content, "lxml")
    text = soup.get_text(separator="\n", strip=True)
    # Drop very short lines (nav links, single words) to reduce noise.
    return "\n".join(line for line in text.splitlines() if len(line.split()) > 3)


# The tool-calling rules are fixed in the backend so users can't break the
# fetch-then-summarize behavior. Only style and length are user-customizable.
_FIXED_RULES = (
    "You are given a Wikipedia URL. Use the `load_web_page` tool to fetch "
    "the page content, then write a summary of the article.\n"
    "Rules:\n"
    "- Always call `load_web_page` with the provided URL before summarizing.\n"
    "- Summarize only what the article says; do not add outside information.\n"
    "- If the page cannot be fetched or is not a valid article, say so."
)

# Customizable style presets: value -> (label, guidance for the model).
STYLES: dict[str, tuple[str, str]] = {
    "neutral": (
        "Neutral / factual",
        "Write in neutral, factual, encyclopedic prose as a single paragraph.",
    ),
    "casual": (
        "Casual",
        "Write in a casual, conversational tone, as if explaining to a friend.",
    ),
    "academic": (
        "Academic",
        "Write in a formal, academic tone using precise terminology.",
    ),
    "eli5": (
        "Explain simply (ELI5)",
        "Explain in very simple terms, as if to a curious child.",
    ),
    "bullets": (
        "Bullet points",
        "Present the summary as concise bullet points of the key facts.",
    ),
}

DEFAULT_STYLE = "neutral"
DEFAULT_LENGTH = 200


def build_agent(
    style_guidance: str | None = None, length: int | None = None
) -> Agent:
    """Builds the summarizer agent for a given style guidance and length.

    The tool-calling rules are fixed; only the closing style/length guidance
    varies. Guidance text is resolved by the caller (e.g. from the DB-backed
    style presets, or a user's free-form custom prompt); a blank guidance falls
    back to the default style and a non-positive length to DEFAULT_LENGTH.

    Args:
        style_guidance: The style instruction to append.
        length: Target summary length in words.

    Returns:
        A configured Agent instance.
    """
    words = length if length and length > 0 else DEFAULT_LENGTH
    guidance = style_guidance or STYLES[DEFAULT_STYLE][1]

    instruction = (
        f"{_FIXED_RULES}\n"
        f"- Aim for approximately {words} words.\n"
        f"- {guidance}"
    )

    return Agent(
        name="wikipedia_summarizer",
        # model=LiteLlm(
        #     model=f"openai/{_LM_STUDIO_MODEL}",
        #     api_base=_LM_STUDIO_URL,
        #     api_key="lm-studio",  # LM Studio ignores the key value; non-empty required by LiteLLM
        # ),
        model="gemma-4-31b-it",
        description="Summarizes the content of a Wikipedia article.",
        instruction=instruction,
        tools=[load_web_page],
    )


root_agent = build_agent()
