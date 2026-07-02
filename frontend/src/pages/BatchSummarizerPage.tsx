import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Play, Plus, Save, Trash2, X } from 'lucide-react'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import {
  batchSummarize,
  fetchAgentOptions,
  fetchRandomWiki,
  fetchStyles,
  parseTopicList,
  saveArticle,
  slugify,
  type BatchSummary,
  type TokenUsage,
} from '@/api'
import { useAppStore } from '@/store'
import { TokenUsageBadge } from '@/components/TokenUsageBadge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

/** Hard cap on queue size to keep the single batched call's cost bounded. */
const MAX_TOPICS = 10000

export function BatchSummarizerPage() {
  const [topics, setTopics] = useState<string[]>([])
  const [results, setResults] = useState<BatchSummary[]>([])
  const [usage, setUsage] = useState<TokenUsage | undefined>()
  const [promptUsed, setPromptUsed] = useState<string | undefined>()
  const [fetchCount, setFetchCount] = useState(5)
  const [csvText, setCsvText] = useState('')
  const style = useAppStore((s) => s.batchStyle)
  const length = useAppStore((s) => s.batchLength)
  const useCustomPrompt = useAppStore((s) => s.batchUseCustomPrompt)
  const customPrompt = useAppStore((s) => s.batchCustomPrompt)
  const setStyle = useAppStore((s) => s.setBatchStyle)
  const setLength = useAppStore((s) => s.setBatchLength)
  const setUseCustomPrompt = useAppStore((s) => s.setBatchUseCustomPrompt)
  const setCustomPrompt = useAppStore((s) => s.setBatchCustomPrompt)

  const optionsQuery = useQuery({
    queryKey: ['agentOptions'],
    queryFn: fetchAgentOptions,
  })
  const stylesQuery = useQuery({
    queryKey: ['styles'],
    queryFn: fetchStyles,
  })

  useEffect(() => {
    if (optionsQuery.data && !style) {
      setStyle(optionsQuery.data.default_style)
      setLength(optionsQuery.data.default_length)
    }
  }, [optionsQuery.data, style])

  function addTopics(incoming: string[]) {
    setTopics((prev) => {
      // De-dupe (case-insensitive) and respect the cap.
      const seen = new Set(prev.map((t) => t.toLowerCase()))
      const merged = [...prev]
      for (const t of incoming) {
        if (merged.length >= MAX_TOPICS) break
        if (!seen.has(t.toLowerCase())) {
          seen.add(t.toLowerCase())
          merged.push(t)
        }
      }
      return merged
    })
  }

  const randomMutation = useMutation({
    mutationFn: () => fetchRandomWiki(fetchCount),
    onSuccess: (entries) => addTopics(entries.map((e) => e.title)),
    onError: (e) => toast.error(errMsg(e)),
  })

  function handleAddCsv() {
    const parsed = parseTopicList(csvText)
    if (parsed.length === 0) {
      toast.error('No topics found in the CSV input.')
      return
    }
    addTopics(parsed)
    setCsvText('')
  }


  const runMutation = useMutation({
    mutationFn: () =>
      batchSummarize(topics, {
        style,
        length,
        prompt: useCustomPrompt && customPrompt.trim() ? customPrompt : undefined,
      }),
    onSuccess: (res) => {
      setResults(res.summaries)
      setUsage(res.usage)
      // Record the instruction that actually produced these summaries: the
      // custom prompt when it was used, otherwise the selected style's
      // guidance text (falls back to the style value if it hasn't loaded).
      setPromptUsed(
        useCustomPrompt && customPrompt.trim()
          ? customPrompt.trim()
          : (stylesQuery.data?.find((s) => s.value === style)?.guidance ?? style),
      )
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[24rem_minmax(0,1fr)] lg:items-start">
      {/* Left pane: build the queue + options */}
      <div className="flex flex-col gap-6">
        {/* Summary options */}
        <Card>
          <CardHeader>
            <CardTitle>Summary options</CardTitle>
            <CardDescription>
              Applied to every topic in the single batched request.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="flex flex-col gap-2">
                <Label htmlFor="style">Style</Label>
                <Select
                  value={style}
                  onValueChange={setStyle}
                  disabled={useCustomPrompt}
                >
                  <SelectTrigger id="style" className="w-full">
                    <SelectValue placeholder="Select a style" />
                  </SelectTrigger>
                  <SelectContent>
                    {(optionsQuery.data?.styles ?? []).map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="length">Length (words)</Label>
                <Input
                  id="length"
                  type="number"
                  min={20}
                  max={500}
                  step={10}
                  value={length}
                  onChange={(e) => setLength(Number(e.target.value))}
                />
              </div>
            </div>

            {/* Custom prompt — replaces the style when enabled. */}
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="batch-use-custom-prompt"
                  checked={useCustomPrompt}
                  onCheckedChange={(checked) =>
                    setUseCustomPrompt(checked === true)
                  }
                />
                <Label htmlFor="batch-use-custom-prompt" className="font-normal">
                  Use a custom prompt instead of the style
                </Label>
              </div>
              <Textarea
                id="batch-custom-prompt"
                placeholder="e.g. Summarize as a numbered list of key takeaways, focusing on dates and people."
                value={customPrompt}
                onChange={(e) => setCustomPrompt(e.target.value)}
                disabled={!useCustomPrompt}
                rows={6}
              />
            </div>
          </CardContent>
        </Card>

        {/* Add via CSV */}
        <Card>
          <CardHeader>
            <CardTitle>Add topics</CardTitle>
            <CardDescription>
              Paste topics, one per line, or add random ones.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Textarea
              placeholder={'Black hole\nPhotosynthesis\nMars, planet'}
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              rows={5}
            />
            <div className="flex items-center gap-2">
              <Button onClick={handleAddCsv} disabled={!csvText.trim()}>
                <Plus />
                Add topics
              </Button>
              <Input
                type="number"
                min={1}
                max={MAX_TOPICS}
                value={fetchCount}
                onChange={(e) =>
                  setFetchCount(
                    Math.max(1, Math.min(MAX_TOPICS, Number(e.target.value))),
                  )
                }
                className="w-20"
              />
              <Button
                variant="secondary"
                onClick={() => randomMutation.mutate()}
                disabled={randomMutation.isPending}
              >
                <Plus />
                {randomMutation.isPending
                  ? `Fetching ${fetchCount}…`
                  : `Add ${fetchCount} random`}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right pane: queue + run + results */}
      <div className="flex flex-col gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Queue</CardTitle>
                <CardDescription>
                  {topics.length === 0
                    ? 'No topics yet — add some on the left.'
                    : `${topics.length} / ${MAX_TOPICS} topic${topics.length === 1 ? '' : 's'} · summarized in one request`}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  onClick={() => runMutation.mutate()}
                  disabled={topics.length === 0 || runMutation.isPending}
                >
                  {runMutation.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Play className="size-3.5" />
                  )}
                  {runMutation.isPending ? 'Summarizing…' : 'Summarize batch'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setTopics([])}
                  disabled={runMutation.isPending || topics.length === 0}
                >
                  <Trash2 className="size-3.5" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          {topics.length > 0 && (
            <CardContent className="flex flex-wrap gap-2">
              {topics.map((topic, i) => (
                <span
                  key={`${topic}-${i}`}
                  className="inline-flex items-center gap-1.5 rounded-full border bg-muted px-3 py-1 text-sm"
                >
                  {topic}
                  <button
                    type="button"
                    onClick={() =>
                      setTopics((prev) => prev.filter((_, idx) => idx !== i))
                    }
                    disabled={runMutation.isPending}
                    className="text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                  >
                    <X className="size-3.5" />
                  </button>
                </span>
              ))}
            </CardContent>
          )}
        </Card>

        {results.length > 0 && (
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-2">
                <div>
                  <CardTitle>Results</CardTitle>
                  <CardDescription>
                    {results.length} summar{results.length === 1 ? 'y' : 'ies'}{' '}
                    split from one response.
                  </CardDescription>
                </div>
                {usage && <TokenUsageBadge usage={usage} label="tokens total" />}
              </div>
            </CardHeader>
            <CardContent className="flex flex-col gap-3">
              {results.map((r, i) => (
                <ResultRow key={`${r.topic}-${i}`} result={r} prompt={promptUsed} />
              ))}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

function ResultRow({
  result,
  prompt,
}: {
  result: BatchSummary
  prompt?: string
}) {
  const queryClient = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: () =>
      saveArticle({
        title: result.topic,
        slug: slugify(result.topic),
        content: result.summary,
        prompt,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      toast.success(`Saved "${result.topic}"`)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {result.topic}
        </span>
        {result.summary && (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
          >
            <Save className="size-3.5" />
            {saveMutation.isPending ? 'Saving…' : 'Save'}
          </Button>
        )}
      </div>
      {result.summary ? (
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
          <Markdown>{result.summary}</Markdown>
        </div>
      ) : (
        <p className="text-xs text-destructive">
          No summary was returned for this topic.
        </p>
      )}
    </div>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
