<!-- Ported from upblab ui/src/components/ui/StatusChip.svelte @ 419eadc -->
<!-- Usage: <StatusChip tone="warning" text="Needs attention" />; short status facts. -->
<script lang="ts">
  let {
    tone = 'neutral',
    text,
  }: { tone?: 'neutral' | 'warning' | 'success'; text: string } = $props();
</script>

<span
  class="status"
  class:warning={tone === 'warning'}
  class:success={tone === 'success'}>{text}</span
>

<style>
  .status {
    display: inline-block;
    max-width: 100%;
    padding: 2px 6px;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    font-size: 12px;
    color: var(--muted);
    background: var(--subtle);
    overflow-wrap: anywhere;
  }
  .warning {
    color: var(--error);
    background: color-mix(in srgb, var(--error) 12%, transparent);
    border-color: color-mix(in srgb, var(--error) 30%, transparent);
  }
  .success {
    color: var(--primary);
    background: color-mix(in srgb, var(--primary) 12%, transparent);
    border-color: color-mix(in srgb, var(--primary) 30%, transparent);
  }
</style>
