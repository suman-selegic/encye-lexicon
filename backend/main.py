import logging
from contextlib import asynccontextmanager
from typing import Annotated

from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query
from fastapi.concurrency import run_in_threadpool
from google.adk.runners import Runner
from openai import OpenAIError
from google.adk.sessions import InMemorySessionService
from google.genai import types
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlmodel import Session, col, select

from agent import (
    DEFAULT_LENGTH,
    DEFAULT_STYLE,
    STYLES,
    build_agent,
)
from openai_agent import summarize_with_search
from models import (
    AppSettings,
    AppSettingsUpdate,
    Article,
    ArticleCreate,
    ArticleUpdate,
    StylePreset,
    StylePresetCreate,
    StylePresetUpdate,
    create_db_and_tables,
    engine,
    get_utc_now,
)

# Load OPENAI_API_KEY (and any other secrets) from .env into the environment
# so the LiteLlm-backed agent can authenticate.
load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger(__name__)


def get_session():
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]

APP_NAME = "wikipedia_summarizer"
adk_session_service = InMemorySessionService()


class SummarizeRequest(BaseModel):
    url: str
    user_id: str = "anonymous"
    style: str | None = None
    length: int | None = None
    # When set, this free-form instruction is used in place of the style preset.
    prompt: str | None = None


class SummarizeResponse(BaseModel):
    url: str
    summary: str


def seed_agent_options(session: Session) -> None:
    """Seed style presets and default settings from the code constants once."""
    if not session.exec(select(StylePreset)).first():
        for value, (label, guidance) in STYLES.items():
            session.add(
                StylePreset(value=value, label=label, guidance=guidance)
            )
    if session.get(AppSettings, 1) is None:
        session.add(
            AppSettings(
                id=1,
                default_style=DEFAULT_STYLE,
                default_length=DEFAULT_LENGTH,
            )
        )
    session.commit()


def get_settings(session: Session) -> AppSettings:
    settings = session.get(AppSettings, 1)
    if settings is None:
        settings = AppSettings(
            id=1, default_style=DEFAULT_STYLE, default_length=DEFAULT_LENGTH
        )
        session.add(settings)
        session.commit()
        session.refresh(settings)
    return settings


@asynccontextmanager
async def lifespan(app: FastAPI):
    create_db_and_tables()
    with Session(engine) as session:
        seed_agent_options(session)
    yield


app = FastAPI(lifespan=lifespan)


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/agent/options")
def get_agent_options(session: SessionDep):
    styles = session.exec(select(StylePreset)).all()
    settings = get_settings(session)
    return {
        "styles": [{"value": s.value, "label": s.label} for s in styles],
        "default_style": settings.default_style,
        "default_length": settings.default_length,
    }


@app.get("/agent/styles", response_model=list[StylePreset])
def list_styles(session: SessionDep):
    return session.exec(select(StylePreset)).all()


@app.post("/agent/styles", response_model=StylePreset, status_code=201)
def create_style(preset: StylePresetCreate, session: SessionDep):
    value = preset.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Style value is required")
    if session.get(StylePreset, value):
        raise HTTPException(status_code=409, detail="Style value already exists")
    db_preset = StylePreset(value=value, label=preset.label, guidance=preset.guidance)
    session.add(db_preset)
    session.commit()
    session.refresh(db_preset)
    return db_preset


@app.patch("/agent/styles/{value}", response_model=StylePreset)
def update_style(value: str, patch: StylePresetUpdate, session: SessionDep):
    db_preset = session.get(StylePreset, value)
    if db_preset is None:
        raise HTTPException(status_code=404, detail="Style not found")
    for key, val in patch.model_dump(exclude_unset=True).items():
        setattr(db_preset, key, val)
    session.add(db_preset)
    session.commit()
    session.refresh(db_preset)
    return db_preset


@app.delete("/agent/styles/{value}", status_code=204)
def delete_style(value: str, session: SessionDep):
    db_preset = session.get(StylePreset, value)
    if db_preset is None:
        raise HTTPException(status_code=404, detail="Style not found")
    if get_settings(session).default_style == value:
        raise HTTPException(
            status_code=409, detail="Cannot delete the default style"
        )
    if len(session.exec(select(StylePreset)).all()) <= 1:
        raise HTTPException(status_code=409, detail="Cannot delete the last style")
    session.delete(db_preset)
    session.commit()


@app.patch("/agent/settings", response_model=AppSettings)
def update_settings(patch: AppSettingsUpdate, session: SessionDep):
    settings = get_settings(session)
    data = patch.model_dump(exclude_unset=True)
    if "default_style" in data:
        if session.get(StylePreset, data["default_style"]) is None:
            raise HTTPException(status_code=400, detail="default_style does not exist")
    if "default_length" in data and (
        data["default_length"] is None or data["default_length"] <= 0
    ):
        raise HTTPException(
            status_code=400, detail="default_length must be positive"
        )
    for key, val in data.items():
        setattr(settings, key, val)
    session.add(settings)
    session.commit()
    session.refresh(settings)
    return settings


def resolve_guidance_and_length(
    request: SummarizeRequest, session: Session
) -> tuple[str | None, int]:
    """Resolve the style guidance and length for a summarize request.

    Length falls back to the configured default. A custom prompt, when
    provided, is used directly as the guidance; otherwise the style preset is
    resolved from the DB-backed settings.
    """
    settings = get_settings(session)
    length = (
        request.length
        if request.length and request.length > 0
        else settings.default_length
    )
    if request.prompt and request.prompt.strip():
        return request.prompt.strip(), length
    style_value = request.style or settings.default_style
    preset = session.get(StylePreset, style_value) or session.get(
        StylePreset, settings.default_style
    )
    return (preset.guidance if preset else None), length


@app.post("/summarize", response_model=SummarizeResponse)
async def summarize(request: SummarizeRequest, session: SessionDep):
    # Resolve style guidance and length, then build a runner for this request.
    guidance, length = resolve_guidance_and_length(request, session)

    runner = Runner(
        agent=build_agent(style_guidance=guidance, length=length),
        app_name=APP_NAME,
        session_service=adk_session_service,
    )

    adk_session = await adk_session_service.create_session(
        app_name=APP_NAME, user_id=request.user_id
    )
    message = types.Content(role="user", parts=[types.Part(text=request.url)])

    summary = ""
    usage = None
    async for event in runner.run_async(
        user_id=request.user_id,
        session_id=adk_session.id,
        new_message=message,
    ):
        if event.usage_metadata:
            usage = event.usage_metadata
        if event.is_final_response() and event.content and event.content.parts:
            summary = "".join(
                part.text
                for part in event.content.parts
                if part.text and not getattr(part, "thought", False)
            )

    if usage:
        logger.info(
            "tokens url=%s prompt=%s completion=%s total=%s",
            request.url,
            usage.prompt_token_count,
            usage.candidates_token_count,
            usage.total_token_count,
        )

    if not summary:
        raise HTTPException(status_code=502, detail="Agent returned no summary")
    return SummarizeResponse(url=request.url, summary=summary)


@app.post("/summarize/openai", response_model=SummarizeResponse)
async def summarize_openai(request: SummarizeRequest, session: SessionDep):
    """Summarize using OpenAI's Responses API with the native web_search tool.

    Same request shape and style/length/prompt resolution as /summarize, but
    backed by OpenAI instead of the Google ADK agent.
    """
    guidance, length = resolve_guidance_and_length(request, session)

    try:
        summary = await run_in_threadpool(
            summarize_with_search,
            request.url,
            style_guidance=guidance,
            length=length,
        )
    except OpenAIError as exc:
        logger.exception("OpenAI summarize failed url=%s", request.url)
        raise HTTPException(status_code=502, detail=str(exc)) from exc

    if not summary:
        raise HTTPException(status_code=502, detail="Agent returned no summary")
    return SummarizeResponse(url=request.url, summary=summary)


@app.get("/articles", response_model=list[Article])
def list_articles(
    session: SessionDep,
    offset: int = 0,
    limit: Annotated[int, Query(le=100)] = 20,
    published: bool | None = None,
    q: str | None = None,
):
    statement = select(Article)
    if published is not None:
        statement = statement.where(Article.published == published)
    if q:
        statement = statement.where(col(Article.title).ilike(f"%{q}%"))
    statement = statement.order_by(col(Article.created_at).desc())
    statement = statement.offset(offset).limit(limit)
    return session.exec(statement).all()


@app.post("/articles", response_model=Article, status_code=201)
def create_article(article: ArticleCreate, session: SessionDep):
    db_article = Article.model_validate(article)
    session.add(db_article)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Slug already exists")
    session.refresh(db_article)
    return db_article


@app.patch("/articles/{article_id}", response_model=Article)
def update_article(article_id: int, article: ArticleUpdate, session: SessionDep):
    db_article = session.get(Article, article_id)
    if db_article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    data = article.model_dump(exclude_unset=True)
    for key, value in data.items():
        setattr(db_article, key, value)
    db_article.updated_at = get_utc_now()
    session.add(db_article)
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        raise HTTPException(status_code=409, detail="Slug already exists")
    session.refresh(db_article)
    return db_article


@app.delete("/articles/{article_id}", status_code=204)
def delete_article(article_id: int, session: SessionDep):
    db_article = session.get(Article, article_id)
    if db_article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    session.delete(db_article)
    session.commit()


@app.get("/articles/slug/{slug}", response_model=Article)
def get_article_by_slug(slug: str, session: SessionDep):
    article = session.exec(select(Article).where(Article.slug == slug)).first()
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article


@app.get("/articles/{article_id}", response_model=Article)
def get_article(article_id: int, session: SessionDep):
    article = session.get(Article, article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Article not found")
    return article
