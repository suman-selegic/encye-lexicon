import { Coins } from 'lucide-react'
import type { TokenUsage } from '@/api'

const fmt = (n: number) => n.toLocaleString()

/**
 * Compact, muted display of an LLM call's token usage. Renders the total with
 * the input/output split in a tooltip-style title.
 */
export function TokenUsageBadge({
  usage,
  label = 'tokens',
}: {
  usage: TokenUsage
  label?: string
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-xs text-muted-foreground"
      title={`Input ${fmt(usage.input_tokens)} · Output ${fmt(usage.output_tokens)}`}
    >
      <Coins className="size-3" />
      {fmt(usage.total_tokens)} {label}
    </span>
  )
}
