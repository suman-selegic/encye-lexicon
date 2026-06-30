import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Pencil, Plus, Save, Trash2 } from 'lucide-react'
import {
  createStyle,
  deleteStyle,
  fetchAgentOptions,
  fetchStyles,
  updateSettings,
  updateStyle,
  type StylePreset,
} from '@/api'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

function useInvalidateAgent() {
  const queryClient = useQueryClient()
  return () => {
    queryClient.invalidateQueries({ queryKey: ['agentOptions'] })
    queryClient.invalidateQueries({ queryKey: ['styles'] })
  }
}

export function SettingsPage() {
  const stylesQuery = useQuery({ queryKey: ['styles'], queryFn: fetchStyles })
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editing, setEditing] = useState<StylePreset | null>(null)

  function openCreate() {
    setEditing(null)
    setDialogOpen(true)
  }

  function openEdit(preset: StylePreset) {
    setEditing(preset)
    setDialogOpen(true)
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <DefaultsCard />

      <Card>
        <CardHeader>
          <CardTitle>Style presets</CardTitle>
          <CardDescription>
            Edit the guidance the agent follows for each style, or create your
            own.
          </CardDescription>
          <CardAction>
            <Button size="sm" onClick={openCreate}>
              <Plus />
              New style
            </Button>
          </CardAction>
        </CardHeader>
        <CardContent>
          {stylesQuery.isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {(stylesQuery.data ?? []).map((preset) => (
                <StyleRow
                  key={preset.value}
                  preset={preset}
                  onEdit={() => openEdit(preset)}
                />
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <StyleDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        preset={editing}
      />
    </div>
  )
}

function StyleRow({
  preset,
  onEdit,
}: {
  preset: StylePreset
  onEdit: () => void
}) {
  const invalidate = useInvalidateAgent()
  const remove = useMutation({
    mutationFn: () => deleteStyle(preset.value),
    onSuccess: () => {
      invalidate()
      toast.success('Style deleted')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  return (
    <li className="group flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{preset.label}</span>
          <Badge variant="secondary" className="font-mono text-xs">
            {preset.value}
          </Badge>
        </div>
        <p className="truncate text-sm text-muted-foreground">
          {preset.guidance}
        </p>
      </div>
      <div className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          onClick={onEdit}
          aria-label={`Edit ${preset.label}`}
        >
          <Pencil />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => remove.mutate()}
          disabled={remove.isPending}
          aria-label={`Delete ${preset.label}`}
        >
          <Trash2 />
        </Button>
      </div>
    </li>
  )
}

function StyleDialog({
  open,
  onOpenChange,
  preset,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  preset: StylePreset | null
}) {
  const invalidate = useInvalidateAgent()
  const isEdit = preset !== null
  const [value, setValue] = useState('')
  const [label, setLabel] = useState('')
  const [guidance, setGuidance] = useState('')

  // Sync the form whenever the dialog opens (for create or a given preset).
  useEffect(() => {
    if (open) {
      setValue(preset?.value ?? '')
      setLabel(preset?.label ?? '')
      setGuidance(preset?.guidance ?? '')
    }
  }, [open, preset])

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateStyle(preset!.value, { label, guidance })
        : createStyle({ value, label, guidance }),
    onSuccess: () => {
      invalidate()
      toast.success(isEdit ? 'Style updated' : 'Style created')
      onOpenChange(false)
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const valid =
    label.trim() && guidance.trim() && (isEdit || value.trim())

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit style' : 'New style'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update the label and guidance for this style.'
              : 'Define a new summary style the agent can use.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {!isEdit && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="style-id">ID</Label>
              <Input
                id="style-id"
                placeholder="e.g. tweet"
                value={value}
                onChange={(e) =>
                  setValue(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
              />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="style-label">Label</Label>
            <Input
              id="style-label"
              placeholder="e.g. Tweet"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="style-guidance">Guidance</Label>
            <Textarea
              id="style-guidance"
              className="min-h-28"
              placeholder="How the agent should write this style…"
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="ghost">Cancel</Button>
          </DialogClose>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!valid || mutation.isPending}
          >
            <Save />
            {mutation.isPending ? 'Saving…' : isEdit ? 'Save changes' : 'Create'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function DefaultsCard() {
  const optionsQuery = useQuery({
    queryKey: ['agentOptions'],
    queryFn: fetchAgentOptions,
  })
  const invalidate = useInvalidateAgent()
  const [style, setStyle] = useState('')
  const [length, setLength] = useState(100)

  useEffect(() => {
    if (optionsQuery.data) {
      setStyle(optionsQuery.data.default_style)
      setLength(optionsQuery.data.default_length)
    }
  }, [optionsQuery.data])

  const save = useMutation({
    mutationFn: () =>
      updateSettings({ default_style: style, default_length: length }),
    onSuccess: () => {
      invalidate()
      toast.success('Defaults saved')
    },
    onError: (e) => toast.error(errMsg(e)),
  })

  const data = optionsQuery.data
  const dirty =
    !!data && (style !== data.default_style || length !== data.default_length)

  return (
    <Card>
      <CardHeader>
        <CardTitle>Defaults</CardTitle>
        <CardDescription>
          Used when a summary is generated without overriding style or length.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-style">Default style</Label>
            <Select value={style} onValueChange={setStyle}>
              <SelectTrigger id="default-style" className="w-full">
                <SelectValue placeholder="Select a style" />
              </SelectTrigger>
              <SelectContent>
                {(data?.styles ?? []).map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="default-length">Default length (words)</Label>
            <Input
              id="default-length"
              type="number"
              min={20}
              max={500}
              step={10}
              value={length}
              onChange={(e) => setLength(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <Save />
            {save.isPending ? 'Saving…' : 'Save defaults'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}
