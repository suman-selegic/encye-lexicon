import { useEffect, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ExternalLink, Eye, EyeOff, Trash2 } from 'lucide-react'
import {
  deleteArticle,
  updateArticle,
  wikiUrlFromTitle,
  type Article,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

type Props = {
  article: Article | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function SummaryDetailSheet({ article, open, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')

  // Reset the edit form whenever a different article is opened.
  useEffect(() => {
    setTitle(article?.title ?? '')
    setContent(article?.content ?? '')
  }, [article?.id, article?.title, article?.content])

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['articles'] })

  const saveMutation = useMutation({
    mutationFn: () => updateArticle(article!.id, { title, content }),
    onSuccess: () => {
      invalidate()
      toast.success('Changes saved')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const publishMutation = useMutation({
    mutationFn: () =>
      updateArticle(article!.id, { published: !article!.published }),
    onSuccess: (updated) => {
      invalidate()
      toast.success(updated.published ? 'Published' : 'Moved to drafts')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteArticle(article!.id),
    onSuccess: () => {
      invalidate()
      toast.success('Deleted')
      onOpenChange(false)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const dirty =
    !!article && (title !== article.title || content !== article.content)

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-lg">
        {article && (
          <>
            <SheetHeader>
              <SheetTitle className="pr-6">{article.title}</SheetTitle>
              <SheetDescription className="flex items-center gap-2">
                <a
                  href={wikiUrlFromTitle(article.title)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 hover:underline"
                >
                  Wikipedia <ExternalLink className="size-3" />
                </a>
                <Badge variant={article.published ? 'default' : 'secondary'}>
                  {article.published ? 'Published' : 'Draft'}
                </Badge>
              </SheetDescription>
            </SheetHeader>

            <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-4">
              <div className="flex flex-col gap-2">
                <Label htmlFor="detail-title">Title</Label>
                <Input
                  id="detail-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-1 flex-col gap-2">
                <Label htmlFor="detail-content">Summary</Label>
                <Textarea
                  id="detail-content"
                  className="min-h-48 flex-1"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Saved {new Date(article.created_at).toLocaleString()}
              </p>
            </div>

            <SheetFooter className="flex-row flex-wrap items-center justify-between gap-2">
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => publishMutation.mutate()}
                  disabled={publishMutation.isPending}
                >
                  {article.published ? <EyeOff /> : <Eye />}
                  {article.published ? 'Unpublish' : 'Publish'}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => deleteMutation.mutate()}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 />
                  Delete
                </Button>
              </div>
              <div className="flex gap-2">
                <SheetClose asChild>
                  <Button variant="ghost">Close</Button>
                </SheetClose>
                <Button
                  onClick={() => saveMutation.mutate()}
                  disabled={!dirty || saveMutation.isPending}
                >
                  {saveMutation.isPending ? 'Saving…' : 'Save changes'}
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
