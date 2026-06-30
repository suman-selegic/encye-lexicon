// API + Wikipedia client. No external deps — native fetch only.

export type Article = {
  id: number
  title: string
  slug: string
  content: string
  published: boolean
  created_at: string
  updated_at: string
}

export type WikiEntry = {
  title: string
  extract: string
  url: string
  thumbnail?: string
}

type WikiApiPage = {
  title: string
  extract?: string
  fullurl?: string
  thumbnail?: { source?: string }
}

/**
 * Fetch `count` random Wikipedia articles in a single request via the
 * MediaWiki Action API's `generator=random` (CORS-enabled). Replaces N calls
 * to the per-article REST endpoint with one bulk call.
 */
export async function fetchRandomWiki(count = 1): Promise<WikiEntry[]> {
  const params = new URLSearchParams({
    action: 'query',
    format: 'json',
    formatversion: '2',
    generator: 'random',
    grnnamespace: '0', // main namespace — actual articles only
    grnlimit: String(count),
    prop: 'extracts|pageimages|info',
    inprop: 'url',
    exintro: '1',
    explaintext: '1',
    exlimit: 'max',
    piprop: 'thumbnail',
    pithumbsize: '320',
    origin: '*', // anonymous CORS
  })
  const res = await fetch(`https://en.wikipedia.org/w/api.php?${params}`, {
    headers: { accept: 'application/json' },
  })
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`)
  const data = await res.json()
  const pages: WikiApiPage[] = data?.query?.pages ?? []
  return pages.map((page) => ({
    title: page.title,
    extract: page.extract ?? '',
    url: page.fullurl ?? wikiUrlFromTitle(page.title),
    thumbnail: page.thumbnail?.source,
  }))
}

export type SummarizeOptions = {
  style?: string
  length?: number
  /** A custom instruction used in place of the style preset when set. */
  prompt?: string
}

/**
 * Which backend summarizer to use:
 * - 'adk': Google ADK agent that fetches the page (POST /api/summarize)
 * - 'openai': OpenAI Responses API with native web search (POST /api/summarize/openai)
 */
export type SummarizeEngine = 'adk' | 'openai'

const SUMMARIZE_PATHS: Record<SummarizeEngine, string> = {
  adk: '/api/summarize',
  openai: '/api/summarize/openai',
}

/** Summarize a Wikipedia URL via the backend agent, with optional style/length. */
export async function summarize(
  url: string,
  options: SummarizeOptions = {},
  engine: SummarizeEngine = 'adk',
  signal?: AbortSignal,
): Promise<string> {
  const res = await fetch(SUMMARIZE_PATHS[engine], {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      url,
      style: options.style ?? null,
      length: options.length ?? null,
      prompt: options.prompt ?? null,
    }),
    signal,
  })
  if (!res.ok) throw new Error(`Summarize failed (${res.status})`)
  const data = await res.json()
  return data.summary as string
}

export type AgentOptions = {
  styles: { value: string; label: string }[]
  default_style: string
  default_length: number
}

/** Fetch the customizable agent options (styles + defaults). */
export async function fetchAgentOptions(): Promise<AgentOptions> {
  const res = await fetch('/api/agent/options')
  if (!res.ok) throw new Error(`Could not load agent options (${res.status})`)
  return res.json()
}

export type StylePreset = { value: string; label: string; guidance: string }

/** Fetch full style presets (including guidance) for the Settings page. */
export async function fetchStyles(): Promise<StylePreset[]> {
  const res = await fetch('/api/agent/styles')
  if (!res.ok) throw new Error(`Could not load styles (${res.status})`)
  return res.json()
}

/** Create a new style preset. */
export async function createStyle(preset: StylePreset): Promise<StylePreset> {
  const res = await fetch('/api/agent/styles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(preset),
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'Create style failed'))
  return res.json()
}

/** Update a style preset's label and/or guidance. */
export async function updateStyle(
  value: string,
  patch: Partial<Pick<StylePreset, 'label' | 'guidance'>>,
): Promise<StylePreset> {
  const res = await fetch(`/api/agent/styles/${encodeURIComponent(value)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'Update style failed'))
  return res.json()
}

/** Delete a style preset. */
export async function deleteStyle(value: string): Promise<void> {
  const res = await fetch(`/api/agent/styles/${encodeURIComponent(value)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'Delete style failed'))
}

/** Update the default style and/or length. */
export async function updateSettings(patch: {
  default_style?: string
  default_length?: number
}): Promise<AgentOptions> {
  const res = await fetch('/api/agent/settings', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(await errorDetail(res, 'Update settings failed'))
  return res.json()
}

/** Pull a FastAPI `detail` error message when present. */
async function errorDetail(res: Response, fallback: string): Promise<string> {
  try {
    const data = await res.json()
    return data?.detail ? String(data.detail) : `${fallback} (${res.status})`
  } catch {
    return `${fallback} (${res.status})`
  }
}

/** Persist a summary as an Article on the server. */
export async function saveArticle(input: {
  title: string
  slug: string
  content: string
}): Promise<Article> {
  const res = await fetch('/api/articles', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...input, published: true }),
  })
  if (!res.ok) throw new Error(`Save failed (${res.status})`)
  return res.json()
}

export type ListParams = {
  q?: string
  published?: boolean
  offset?: number
  limit?: number
}

/** List saved articles (server returns newest-first). */
export async function listArticles(params: ListParams = {}): Promise<Article[]> {
  const sp = new URLSearchParams()
  if (params.q) sp.set('q', params.q)
  if (params.published !== undefined) sp.set('published', String(params.published))
  sp.set('offset', String(params.offset ?? 0))
  sp.set('limit', String(params.limit ?? 20))
  const res = await fetch(`/api/articles?${sp.toString()}`)
  if (!res.ok) throw new Error(`Could not load saved entries (${res.status})`)
  return res.json()
}

export type ArticleUpdate = Partial<
  Pick<Article, 'title' | 'content' | 'published'>
>

/** Patch an article's editable fields. */
export async function updateArticle(
  id: number,
  patch: ArticleUpdate,
): Promise<Article> {
  const res = await fetch(`/api/articles/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(patch),
  })
  if (!res.ok) throw new Error(`Update failed (${res.status})`)
  return res.json()
}

/** Delete an article by id. */
export async function deleteArticle(id: number): Promise<void> {
  const res = await fetch(`/api/articles/${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error(`Delete failed (${res.status})`)
}

/** Build a slug from a title, with a short random suffix to avoid collisions. */
export function slugify(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
  const suffix = Math.random().toString(36).slice(2, 6)
  return `${base || 'entry'}-${suffix}`
}

/** Reconstruct the Wikipedia page URL from an article title. */
export function wikiUrlFromTitle(title: string): string {
  return `https://en.wikipedia.org/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`
}
