<script lang="ts">
  import { updater } from './updater.svelte';
  let { onopen }: { onopen: () => void } = $props();
  const status = $derived(updater.status);
  const dot = $derived(
    ['available', 'ready'].includes(status.kind) ||
      (status.kind === 'unsupported' && !!status.info),
  );
  const busy = $derived(
    status.kind === 'checking' || status.kind === 'downloading',
  );
</script>

<button
  class="version-chip"
  data-testid="version-chip"
  onclick={onopen}
  title={`bracketeer v${updater.version}. Open Updates`}
>
  {#if dot}<span class="dot" aria-hidden="true"></span>{/if}
  {#if busy}<span class="spinner" aria-hidden="true"></span>{/if}
  v{updater.version}
</button>

<style>
  .version-chip {
    flex: 0 0 auto;
    max-width: 220px;
    border-radius: 999px;
    background: var(--surface);
    border: 1px solid var(--border);
    color: var(--muted);
    font-size: 12px;
    white-space: nowrap;
    display: inline-flex;
    align-items: center;
    gap: 7px;
  }
  .dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
  }
  .spinner {
    width: 10px;
    height: 10px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .spinner {
      animation: none;
    }
  }
  :global(.wizard-footer > button:not(.blocking-message)) {
    flex-shrink: 0;
  }
  :global(.wizard-footer .blocking-message) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
