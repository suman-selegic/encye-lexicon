# UX Design — Wikipedia Summarizer

Status: design reference for further development. Describes how the UI should
work as the app grows past the current single-page POC. Not a code-structure doc.

## Where we are

The POC is a single scrolling page with three stacked cards (options → fetch /
summarize → saved list). It's a linear scratchpad: one article in flight at a
time, the generated summary is ephemeral, and saved entries are a read-only
list. The backend already supports far more than the UI exposes.

## Core reframe: two surfaces + an explicit lifecycle

The app does two different jobs that are currently mashed together:

- **Creating** summaries — an active, transient, throwaway-heavy workflow.
- **Managing** a library of summaries — browse, find, edit, curate, revisit.

Organize around those two surfaces (plus Settings), and make the **entry
lifecycle** a first-class, visible thing.

```
       fetch random
 ( ∅ )──────────────▶ [RAW] ──summarize(style,len)──▶ [DRAFTING]
                        ▲                                  │ ok
              regenerate│                                  ▼
                        └──────────── [DRAFT] ◀──edit──▶ [DRAFT•dirty]
                                        │ save
                                        ▼
                                     [SAVED] ──publish──▶ [PUBLISHED]
                                        │                     │
                                        └────── delete ───────┘ → gone
```

Today only `RAW → DRAFTING → DRAFT → SAVED` exists and `SAVED` is a dead end.
The new affordances are **edit**, **regenerate**, **publish/unpublish**,
**delete** — all backed by endpoints that already exist.

Two guiding principles:

1. **Nothing is lost** — candidates persist; summaries are drafts until saved.
2. **Saved ≠ done** — draft vs. published is a first-class toggle.

## App shell & navigation

A persistent shell with three destinations instead of one long page.

```
┌─────────────────────────────────────────────────────────────┐
│ ▦ WikiSummarizer                      [search ⌘K]   [☼/☾]    │  top bar
├──────────────┬──────────────────────────────────────────────┤
│ ✦ Summarize  │                                               │
│ ▤ Library  6 │            « active surface »                 │
│ ⚙ Settings   │                                               │
└──────────────┴──────────────────────────────────────────────┘
```

- **Summarize** = workspace (scratch). **Library** = saved work (truth), with a
  live count badge. **Settings** = defaults & presets.
- Global search + dark-mode toggle live in the top bar.
- Responsive: sidebar → hamburger/top-tabs on small screens.

## Surface 1 — Summarize (workspace)

Two columns: the **source** on the left, the **draft you're shaping** on the
right. A candidate tray on top so fetching never destroys your work.

```
Summarize ──────────────────────────────────────────────────────
┌ Candidates ───────────────────────────────────────────────────┐
│ [⇄ Fetch random]     recent:  ‹AEG›  ‹Nephotettix›  ‹Clanculus›│
└───────────────────────────────────────────────────────────────┘

┌ Source ─────────────────┐   ┌ Summary draft ───────────────────┐
│ 🖼 AEG turbine factory   │   │ Style[Neutral ▾]  Length[100 ▾]   │
│   ↗ en.wikipedia.org     │   │ ───────────────────────────────── │
│                          │   │ ┌───────────────────────────────┐ │
│ The AEG turbine factory  │   │ │ editable summary text…        │ │
│ was built in 1909 at …   │   │ │                               │ │
│ (lead extract)           │   │ └───────────────────────────────┘ │
│                          │   │ 92 words · edited                 │
│                          │   │ [✦ Regenerate]        [💾 Save]   │
└──────────────────────────┘   └───────────────────────────────────┘
```

Right panel changes by state:

| State        | Right panel shows                                  |
|--------------|----------------------------------------------------|
| empty        | "Fetch an article to begin" placeholder            |
| raw          | one big centered **✦ Summarize** button            |
| drafting     | skeleton lines + spinner                           |
| draft        | editable textarea + word count + Regenerate / Save |
| draft•dirty  | "edited" badge; Save emphasized                    |

Key moves:

- **Generation controls (style/length) live in this panel's header** — attached
  to the action, pre-filled from Settings defaults. No "applied on next
  summarize" guesswork.
- **Summary is editable** before saving. **Regenerate** re-runs with the current
  controls without re-fetching.
- **Fetch random** pushes the current candidate into the *recent* strip instead
  of replacing it — click a chip to return to it.
- **Save** → toast "Saved to Library", clears the draft; the candidate stays so
  it can be summarized again differently.

## Surface 2 — Library

A searchable, paginated list. Rows are scannable; a click opens a detail drawer.

```
Library ─────────────────────────────────────────────────────────
[ search title…            ]   [ All | Drafts | Published ]  sort[Newest ▾]

┌────────────────────────────────────────────────────────────────┐
│ Albert Einstein                       ● Published   2d ago   ⋮  │
│ German-born theoretical physicist who developed relativity…     │
├────────────────────────────────────────────────────────────────┤
│ Nephotettix                           ○ Draft       3d ago   ⋮  │
│ A genus of leafhoppers found mostly in Asia, known as green…    │
├────────────────────────────────────────────────────────────────┤
│ …                                          ‹ 1  2  3 ›  20/page │
└────────────────────────────────────────────────────────────────┘
```

Row **⋮** menu: Open · Publish/Unpublish · Delete (with Undo toast).
Row click → **detail drawer** from the right:

```
                        ┌ Detail ─────────────────────────────┐
                        │ Albert Einstein                ✕     │
                        │ ↗ Wikipedia        ● Published       │
                        │ ─────────────────────────────────── │
                        │ [ editable title…                ]   │
                        │ ┌─────────────────────────────────┐ │
                        │ │ editable summary content…       │ │
                        │ └─────────────────────────────────┘ │
                        │ neutral · 100w · summarized 2d ago   │
                        │ ─────────────────────────────────── │
                        │ [✦ Regenerate] [Unpublish] [🗑]      │
                        │                       [Save changes] │
                        └──────────────────────────────────────┘
```

The drawer is where `SAVED ⇄ PUBLISHED`, edit, regenerate, and delete happen —
so the Library is not read-only.

## Surface 3 — Settings

Separates *app config* from *per-generation* controls.

```
Settings ────────────────────────────────────────────────────────
┌ Defaults ──────────────────────────────────────────────────────┐
│ Default style   [ Neutral / factual ▾ ]                         │
│ Default length  [ 100 ] words                                   │
└────────────────────────────────────────────────────────────────┘
┌ Style presets ─────────────────────────────────────  [＋ New ]──┐
│  • Neutral / factual                          edit   delete     │
│  • ELI5                                        edit   delete     │
│  • Bullet points                               edit   delete     │
└────────────────────────────────────────────────────────────────┘
```

Natural home for the user-editable agent guidance: managed presets instead of a
raw prompt box in the main flow.

## Cross-cutting patterns

- **Feedback = toasts (sonner)**, bottom-right: "Saved", "Deleted · Undo",
  "Regenerated". Retire the single error banner; errors become dismissible
  toasts with Retry.
- **Optimistic updates** via React Query: save adds the row instantly; delete
  removes it instantly with Undo.
- **Responsive**: sidebar → top tabs; two-column workspace stacks (source above
  draft); detail drawer becomes a full-screen sheet on mobile.

## Feasibility map (screen → endpoint)

| UI action                                   | Endpoint                                  | Status            |
|---------------------------------------------|-------------------------------------------|-------------------|
| Fetch random                                | Wikipedia REST                            | ✅ exists          |
| Summarize / Regenerate                      | `POST /summarize` (style, length)         | ✅ exists          |
| Save draft                                  | `POST /articles`                          | ✅ exists          |
| Library list / search / filter / paginate   | `GET /articles?offset&limit&published`    | ✅ exists (unused) |
| Open detail                                 | `GET /articles/{id}`                      | ✅ exists (unused) |
| Edit title/content, publish toggle          | `PATCH /articles/{id}`                    | ✅ exists (unused) |
| Delete                                      | `DELETE /articles/{id}`                   | ✅ exists (unused) |
| Show source URL / style / "summarized at"   | —                                         | ⚠️ needs model fields |

~90% is reachable today. The one real gap: to show the source URL, the
style/length used, and a real "summarized at" in the Library/detail views, the
`Article` model needs a few extra columns (`source_url`, `style`, `length`,
`summarized_at`). Everything else is surfacing capabilities that already exist.

## Suggested build order (smallest value-first)

1. **Library management** — detail drawer + edit + delete + published toggle +
   search/filter/pagination. All endpoints exist.
2. **Workspace upgrades** — editable summary before save, regenerate, candidate
   tray so re-fetch doesn't lose work.
3. **Navigation split** — sidebar shell with Summarize / Library / Settings; move
   defaults + presets into Settings.
4. **Backend model additions** — `source_url`, `style`, `length`,
   `summarized_at` to make the Library informative; surface them in detail.
