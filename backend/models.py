from datetime import datetime, timezone

from sqlmodel import Field, SQLModel, create_engine


def get_utc_now() -> datetime:
    return datetime.now(timezone.utc)


class ArticleBase(SQLModel):
    title: str = Field(index=True)
    slug: str = Field(index=True, unique=True)
    content: str
    published: bool = Field(default=False)
    # The instruction (custom prompt or resolved style guidance) that produced
    # `content`, kept for reference alongside the saved summary.
    prompt: str | None = Field(default=None)


class Article(ArticleBase, table=True):
    id: int | None = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=get_utc_now)
    updated_at: datetime = Field(default_factory=get_utc_now)


class ArticleCreate(ArticleBase):
    pass


class ArticleUpdate(SQLModel):
    title: str | None = None
    slug: str | None = None
    content: str | None = None
    published: bool | None = None
    prompt: str | None = None


class StylePresetBase(SQLModel):
    label: str
    guidance: str


class StylePreset(StylePresetBase, table=True):
    value: str = Field(primary_key=True)


class StylePresetCreate(StylePresetBase):
    value: str


class StylePresetUpdate(SQLModel):
    label: str | None = None
    guidance: str | None = None


class AppSettings(SQLModel, table=True):
    id: int = Field(default=1, primary_key=True)
    default_style: str
    default_length: int


class AppSettingsUpdate(SQLModel):
    default_style: str | None = None
    default_length: int | None = None


sqlite_url = "sqlite:///database.db"
engine = create_engine(sqlite_url, echo=True)


def create_db_and_tables() -> None:
    SQLModel.metadata.create_all(engine)
    # `create_all` only creates missing tables, not missing columns on
    # existing ones — patch older sqlite files that predate `Article.prompt`.
    with engine.connect() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(article)")}
        if "prompt" not in columns:
            conn.exec_driver_sql("ALTER TABLE article ADD COLUMN prompt TEXT")
            conn.commit()
