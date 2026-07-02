import { X } from 'lucide-react'
import Markdown from 'react-markdown'
import type { Article } from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  articles: Article[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onRemove: (id: number) => void
}

export function CompareDialog({ articles, open, onOpenChange, onRemove }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[95vw]">
        <DialogHeader>
          <DialogTitle>Compare entries</DialogTitle>
          <DialogDescription>
            {articles.length} entr{articles.length === 1 ? 'y' : 'ies'} side by side.
          </DialogDescription>
        </DialogHeader>
        <div className="flex gap-4 overflow-x-auto pb-2">
          {articles.map((a) => (
            <div
              key={a.id}
              className="flex min-w-[280px] flex-1 flex-col gap-3 rounded-lg border p-3 sm:min-w-[320px]"
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate font-medium" title={a.title}>
                  {a.title}
                </span>
                <Badge
                  variant={a.published ? 'default' : 'secondary'}
                  className="shrink-0"
                >
                  {a.published ? 'Published' : 'Draft'}
                </Badge>
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-6 shrink-0"
                  onClick={() => onRemove(a.id)}
                >
                  <X className="size-3.5" />
                  <span className="sr-only">Remove from comparison</span>
                </Button>
              </div>
              <time className="text-xs text-muted-foreground/70">
                {new Date(a.created_at).toLocaleDateString()}
              </time>
              {a.prompt && (
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-muted-foreground">
                    Prompt used
                  </span>
                  <p className="rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground">
                    {a.prompt}
                  </p>
                </div>
              )}
              <div className="prose prose-sm prose-neutral dark:prose-invert max-h-[60vh] max-w-none overflow-y-auto rounded-md bg-muted px-3 py-2 text-xs leading-relaxed text-muted-foreground prose-headings:text-foreground prose-strong:text-foreground prose-a:text-primary">
                <Markdown>{a.content}</Markdown>
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
