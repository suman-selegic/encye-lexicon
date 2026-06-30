import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  Plus,
  RotateCcw,
  Save,
  Square,
  Trash2,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'
import Markdown from 'react-markdown'
import {
  fetchAgentOptions,
  fetchRandomWiki,
  saveArticle,
  slugify,
  summarize,
} from '@/api'
import { useAppStore } from '@/store'
import type { QueueItem } from '@/store'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

// How many queue items to summarize in parallel.
const CONCURRENCY = 3

export function SummarizerPage() {
  const [fetchCount, setFetchCount] = useState(3)

  const queue = useAppStore((s) => s.queue)
  const queueRunning = useAppStore((s) => s.queueRunning)
  const style = useAppStore((s) => s.style)
  const length = useAppStore((s) => s.length)
  const engine = useAppStore((s) => s.engine)
  const useCustomPrompt = useAppStore((s) => s.useCustomPrompt)
  const customPrompt = useAppStore((s) => s.customPrompt)
  const fetchHistory = useAppStore((s) => s.fetchHistory)
  const addToQueue = useAppStore((s) => s.addToQueue)
  const recordFetch = useAppStore((s) => s.recordFetch)
  const clearHistory = useAppStore((s) => s.clearHistory)
  const removeFromQueue = useAppStore((s) => s.removeFromQueue)
  const clearQueue = useAppStore((s) => s.clearQueue)
  const resetQueue = useAppStore((s) => s.resetQueue)
  const updateQueueItem = useAppStore((s) => s.updateQueueItem)
  const setQueueRunning = useAppStore((s) => s.setQueueRunning)
  const setStyle = useAppStore((s) => s.setStyle)
  const setLength = useAppStore((s) => s.setLength)
  const setEngine = useAppStore((s) => s.setEngine)
  const setUseCustomPrompt = useAppStore((s) => s.setUseCustomPrompt)
  const setCustomPrompt = useAppStore((s) => s.setCustomPrompt)

  const stoppedRef = useRef(false)
  const abortRef = useRef<AbortController | null>(null)

  const optionsQuery = useQuery({
    queryKey: ['agentOptions'],
    queryFn: fetchAgentOptions,
  })

  useEffect(() => {
    if (optionsQuery.data && !style) {
      setStyle(optionsQuery.data.default_style)
      setLength(optionsQuery.data.default_length)
    }
  }, [optionsQuery.data, style, setStyle, setLength])

  const addMutation = useMutation({
    mutationFn: () => fetchRandomWiki(fetchCount),
    onSuccess: (entries) => {
      recordFetch(entries)
      addToQueue(entries)
    },
  })

  function handleRerun() {
    if (queueRunning) return
    // Reset every item to pending (clearing prior summaries/errors) so the
    // whole queue re-summarizes — e.g. after changing the style.
    resetQueue()
    handleStart()
  }

  async function handleStart() {
    if (queueRunning) return
    stoppedRef.current = false
    setQueueRunning(true)

    // One controller shared by all workers so a single Stop aborts every
    // in-flight request at once.
    const controller = new AbortController()
    abortRef.current = controller

    // Each worker pulls the next pending item until the queue drains or Stop
    // is hit. Claiming (find → flip to 'running') is synchronous with no await
    // in between, so two workers can never grab the same item.
    async function worker() {
      while (!stoppedRef.current) {
        const {
          queue: current,
          style: s,
          length: l,
          engine: e,
          useCustomPrompt: useCustom,
          customPrompt: prompt,
        } = useAppStore.getState()
        const next = current.find((item) => item.status === 'pending')
        if (!next) break

        updateQueueItem(next.id, { status: 'running' })

        try {
          // A custom prompt (when enabled and non-empty) replaces the style.
          const options =
            useCustom && prompt.trim()
              ? { length: l, prompt }
              : { style: s, length: l }
          const result = await summarize(
            next.entry.url,
            options,
            e,
            controller.signal,
          )
          if (!controller.signal.aborted) {
            updateQueueItem(next.id, { status: 'done', summary: result })
          }
        } catch (e) {
          if (controller.signal.aborted) {
            // Reset so the item can be retried on next Start
            updateQueueItem(next.id, { status: 'pending' })
            return
          }
          updateQueueItem(next.id, { status: 'error', error: errMsg(e) })
        }
      }
    }

    await Promise.all(Array.from({ length: CONCURRENCY }, worker))

    abortRef.current = null
    setQueueRunning(false)
  }

  function handleStop() {
    stoppedRef.current = true
    abortRef.current?.abort()
  }

  const pendingCount = queue.filter((i) => i.status === 'pending').length
  const finishedCount = queue.filter(
    (i) => i.status === 'done' || i.status === 'error',
  ).length

  return (
    <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-6 lg:grid-cols-[22rem_minmax(0,1fr)_22rem] lg:items-start">
      {/* Left pane: options + add entries */}
      <div className="flex flex-col gap-6">
      {/* Summary options */}
      <Card>
        <CardHeader>
          <CardTitle>Summary options</CardTitle>
          <CardDescription>
            Applied to every item processed by the queue.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {/* Engine switch — toggle between the two summarize APIs. */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div className="flex flex-col gap-0.5">
              <Label htmlFor="engine" className="font-normal">
                OpenAI web search
              </Label>
              <span className="text-xs text-muted-foreground">
                {engine === 'openai'
                  ? 'Summaries come from OpenAI with native web search.'
                  : 'Summaries come from the Google ADK agent (fetches the page).'}
              </span>
            </div>
            <Switch
              id="engine"
              checked={engine === 'openai'}
              disabled
              onCheckedChange={(checked) =>
                setEngine(checked ? 'openai' : 'adk')
              }
            />
          </div>

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
                id="use-custom-prompt"
                checked={useCustomPrompt}
                onCheckedChange={(checked) =>
                  setUseCustomPrompt(checked === true)
                }
              />
              <Label htmlFor="use-custom-prompt" className="font-normal">
                Use a custom prompt instead of the style
              </Label>
            </div>
            <Textarea
              id="custom-prompt"
              placeholder="e.g. Summarize as a numbered list of key takeaways, focusing on dates and people."
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              disabled={!useCustomPrompt}
              rows={6}
            />
          </div>
        </CardContent>
      </Card>

      {/* Add entries */}
      <Card>
        <CardHeader>
          <CardTitle>Add entries</CardTitle>
          <CardDescription>
            Fetch random Wikipedia articles and add them to the queue.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={1}
              max={10}
              value={fetchCount}
              onChange={(e) =>
                setFetchCount(
                  Math.max(1, Math.min(10, Number(e.target.value))),
                )
              }
              className="w-20"
            />
            <Button
              onClick={() => addMutation.mutate()}
              disabled={addMutation.isPending}
            >
              <Plus />
              {addMutation.isPending
                ? `Fetching ${fetchCount}…`
                : `Add ${fetchCount} random`}
            </Button>
          </div>
        </CardContent>
      </Card>
      </div>

      {/* Center pane: queue */}
      <div className="flex flex-col gap-6">
      {/* Queue */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Queue</CardTitle>
              <CardDescription>
                {queue.length === 0
                  ? 'No entries yet — add some above.'
                  : `${queue.length} entr${queue.length === 1 ? 'y' : 'ies'} · ${pendingCount} pending`}
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {queueRunning ? (
                <Button variant="destructive" size="sm" onClick={handleStop}>
                  <Square className="size-3.5" />
                  Stop
                </Button>
              ) : (
                <>
                  <Button
                    size="sm"
                    onClick={handleStart}
                    disabled={pendingCount === 0}
                  >
                    <Play className="size-3.5" />
                    Start
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={handleRerun}
                    disabled={finishedCount === 0}
                    title="Reset all items and summarize the queue again"
                  >
                    <RotateCcw className="size-3.5" />
                    Rerun
                  </Button>
                </>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={clearQueue}
                disabled={queueRunning || queue.length === 0}
              >
                <Trash2 className="size-3.5" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        {queue.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {queue.map((item) => (
              <QueueItemRow
                key={item.id}
                item={item}
                onRemove={() => removeFromQueue(item.id)}
              />
            ))}
          </CardContent>
        )}
      </Card>
      </div>

      {/* Right pane: fetch history */}
      <div className="flex flex-col gap-6">
      {/* Fetch history */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Fetch history</CardTitle>
              <CardDescription>
                {fetchHistory.length === 0
                  ? 'Past fetches appear here — click one to re-queue it.'
                  : 'Click a batch to add those articles back to the queue.'}
              </CardDescription>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={clearHistory}
              disabled={fetchHistory.length === 0}
            >
              <Trash2 className="size-3.5" />
              Clear
            </Button>
          </div>
        </CardHeader>
        {fetchHistory.length > 0 && (
          <CardContent className="flex flex-col gap-2">
            {fetchHistory.map((batch) => (
              <button
                key={batch.id}
                type="button"
                onClick={() => addToQueue(batch.entries)}
                className="flex flex-col gap-1 rounded-lg border p-3 text-left transition-colors hover:bg-accent"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">
                    {batch.entries.length} article
                    {batch.entries.length === 1 ? '' : 's'}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(batch.fetchedAt).toLocaleString()}
                  </span>
                </div>
                <span className="truncate text-xs text-muted-foreground">
                  {batch.entries.map((e) => e.title).join(', ')}
                </span>
              </button>
            ))}
          </CardContent>
        )}
      </Card>
      </div>
    </div>
  )
}

function QueueItemRow({
  item,
  onRemove,
}: {
  item: QueueItem
  onRemove: () => void
}) {
  const queryClient = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: () =>
      saveArticle({
        title: item.entry.title,
        slug: slugify(item.entry.title),
        content: item.summary!,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['articles'] })
      toast.success(`Saved "${item.entry.title}"`)
      onRemove()
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <div className="flex flex-col gap-2 rounded-lg border p-3">
      <div className="flex items-center gap-2">
        <StatusIcon status={item.status} />
        <span className="min-w-0 flex-1 truncate text-sm font-medium">
          {item.entry.title}
        </span>
        <div className="flex shrink-0 items-center gap-2">
          {item.status === 'done' && (
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
          {item.status !== 'running' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRemove}
              className="size-7 p-0"
            >
              <X className="size-3.5" />
            </Button>
          )}
        </div>
      </div>
      {item.status === 'done' && item.summary && (
        <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
          <Markdown>{item.summary}</Markdown>
        </div>
      )}
      {item.status === 'error' && item.error && (
        <p className="text-xs text-destructive">{item.error}</p>
      )}
    </div>
  )
}

function StatusIcon({ status }: { status: QueueItem['status'] }) {
  if (status === 'pending')
    return <Clock className="size-4 shrink-0 text-muted-foreground" />
  if (status === 'running')
    return <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
  if (status === 'done')
    return <CheckCircle2 className="size-4 shrink-0 text-green-500" />
  return <XCircle className="size-4 shrink-0 text-destructive" />
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
