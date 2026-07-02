import { useEffect, useState } from 'react'
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  EyeOff,
  Inbox,
  MoreVertical,
  Search,
  Trash2,
} from 'lucide-react'
import {
  deleteArticle,
  listArticles,
  updateArticle,
  type Article,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { CompareDialog } from '@/components/CompareDialog'
import { SummaryDetailSheet } from '@/components/SummaryDetailSheet'

const PAGE_SIZE = 10

type Filter = 'all' | 'published' | 'drafts'

export function Library() {
  const queryClient = useQueryClient()
  const [searchInput, setSearchInput] = useState('')
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Article | null>(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [compareSet, setCompareSet] = useState<Map<number, Article>>(new Map())
  const [compareOpen, setCompareOpen] = useState(false)

  // Debounce the search box; reset to the first page on any query change.
  useEffect(() => {
    const id = setTimeout(() => {
      setQ(searchInput.trim())
      setPage(0)
    }, 300)
    return () => clearTimeout(id)
  }, [searchInput])

  useEffect(() => setPage(0), [filter])

  const published =
    filter === 'all' ? undefined : filter === 'published'

  const articlesQuery = useQuery({
    queryKey: ['articles', { q, published, page }],
    queryFn: () =>
      listArticles({
        q,
        published,
        offset: page * PAGE_SIZE,
        limit: PAGE_SIZE,
      }),
    placeholderData: keepPreviousData,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['articles'] })

  const publishMutation = useMutation({
    mutationFn: (a: Article) =>
      updateArticle(a.id, { published: !a.published }),
    onSuccess: (updated) => {
      invalidate()
      toast.success(updated.published ? 'Published' : 'Moved to drafts')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: (a: Article) => deleteArticle(a.id),
    onSuccess: () => {
      invalidate()
      toast.success('Deleted')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const rows = articlesQuery.data ?? []
  const hasMore = rows.length === PAGE_SIZE

  function openDetail(a: Article) {
    setSelected(a)
    setSheetOpen(true)
  }

  function toggleCompare(a: Article) {
    setCompareSet((prev) => {
      const next = new Map(prev)
      if (next.has(a.id)) {
        next.delete(a.id)
      } else {
        next.set(a.id, a)
      }
      return next
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Library</CardTitle>
        <CardDescription>Browse, edit, and manage saved summaries.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-8"
              placeholder="Search titles…"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="published">Published</TabsTrigger>
              <TabsTrigger value="drafts">Drafts</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {compareSet.size > 0 && (
          <div className="flex items-center justify-between rounded-lg border bg-muted/50 px-3 py-2">
            <span className="text-sm text-muted-foreground">
              {compareSet.size} selected
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={compareSet.size < 2}
                onClick={() => setCompareOpen(true)}
              >
                Compare
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setCompareSet(new Map())}
              >
                Clear
              </Button>
            </div>
          </div>
        )}

        {articlesQuery.isLoading ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Loading…</p>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center text-muted-foreground">
            <Inbox className="size-8" />
            <p className="text-sm">
              {q || filter !== 'all'
                ? 'No entries match your filters.'
                : 'No saved entries yet.'}
            </p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y rounded-lg border">
            {rows.map((a) => (
              <li
                key={a.id}
                className="flex cursor-pointer items-start gap-3 p-4 transition-colors hover:bg-muted/50"
                onClick={() => openDetail(a)}
              >
                <div
                  className="flex shrink-0 items-center pt-0.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={compareSet.has(a.id)}
                    onCheckedChange={() => toggleCompare(a)}
                    aria-label={`Select "${a.title}" to compare`}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{a.title}</span>
                    <Badge
                      variant={a.published ? 'default' : 'secondary'}
                      className="shrink-0"
                    >
                      {a.published ? 'Published' : 'Draft'}
                    </Badge>
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {a.content}
                  </p>
                  <time className="mt-1 block text-xs text-muted-foreground/70">
                    {new Date(a.created_at).toLocaleDateString()}
                  </time>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="end"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <DropdownMenuItem onClick={() => openDetail(a)}>
                      Open
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => publishMutation.mutate(a)}>
                      {a.published ? <EyeOff /> : <Eye />}
                      {a.published ? 'Unpublish' : 'Publish'}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      variant="destructive"
                      onClick={() => deleteMutation.mutate(a)}
                    >
                      <Trash2 />
                      Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}

        {(page > 0 || hasMore) && (
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Page {page + 1}</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                <ChevronLeft /> Prev
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasMore}
                onClick={() => setPage((p) => p + 1)}
              >
                Next <ChevronRight />
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <SummaryDetailSheet
        article={selected}
        open={sheetOpen}
        onOpenChange={setSheetOpen}
      />
      <CompareDialog
        articles={[...compareSet.values()]}
        open={compareOpen}
        onOpenChange={setCompareOpen}
      />
    </Card>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
