<script lang="ts">
  import { check, download, install, updater } from './updater.svelte';
  import { checkButtonView } from './updates';

  let { onopen }: { onopen: () => void } = $props();
  let button: HTMLButtonElement;
  let popover: HTMLDivElement;
  let expanded = $state(false);
  const view = $derived(
    checkButtonView(
      updater.status,
      updater.version,
      updater.prefs.autoDownload,
    ),
  );

  function position() {
    if (!popover?.matches(':popover-open')) return;
    const anchor = button.getBoundingClientRect();
    const box = popover.getBoundingClientRect();
    const gap = 8;
    popover.style.left = `${Math.max(gap, Math.min(anchor.right - box.width, innerWidth - box.width - gap))}px`;
    const below = anchor.bottom + gap;
    popover.style.top = `${Math.max(gap, Math.min(below + box.height <= innerHeight - gap ? below : anchor.top - box.height - gap, innerHeight - box.height - gap))}px`;
  }
  function toggle() {
    // check() coalesces checks and downloads already in progress.
    // Native popover invocation handles toggling, light dismissal and Escape.
    if (!popover.matches(':popover-open')) void check(true);
  }
  function settings() {
    popover.hidePopover();
    onopen();
  }
  $effect(() => {
    // Reposition when a result changes the popover's height.
    void view;
    if (expanded) position();
  });
</script>

<svelte:window onresize={position} />
<button
  bind:this={button}
  class="check-updates"
  data-testid="check-updates"
  data-badge={view.badge ? 'true' : undefined}
  data-busy={view.busy ? 'true' : undefined}
  aria-label="Check for updates"
  title={`Check for updates · v${updater.version} · ${view.text}`}
  aria-haspopup="dialog"
  aria-expanded={expanded}
  aria-controls="check-updates-popover"
  popovertarget="check-updates-popover"
  onclick={toggle}
>
  <svg
    class:rotating={updater.status.kind === 'checking'}
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="1.8"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
  >
    <path d="M19 8a8 8 0 1 0 1 6M19 3v5h-5" />
  </svg>
  {#if view.badge}<span class="dot" aria-hidden="true"></span>{/if}
</button>
<div
  bind:this={popover}
  id="check-updates-popover"
  data-testid="check-updates-popover"
  popover="auto"
  role="dialog"
  aria-label="Update check"
  ontoggle={() => {
    expanded = popover.matches(':popover-open');
    position();
  }}
>
  <p aria-live="polite">{view.text}</p>
  {#if updater.status.kind === 'checking'}
    <small class="reduced-motion-checking">Checking…</small>
  {/if}
  {#if view.badge}<small>Current version: v{updater.version}</small>{/if}
  {#if view.action === 'download'}
    <button onclick={download}>Download</button>
  {:else if view.action === 'install'}
    <button class="primary" onclick={install}>Restart to update</button>
  {:else if view.action === 'link'}
    <a
      href="https://github.com/duserzym/bracketeer/releases/latest"
      target="_blank"
      rel="noreferrer">Open download page</a
    >
  {/if}
  <button class="settings" onclick={settings}>Update settings…</button>
</div>

<style>
  .check-updates {
    position: relative;
    flex: 0 0 28px;
    width: 28px;
    height: 28px;
    padding: 4px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .dot {
    position: absolute;
    top: 1px;
    right: 1px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 1px var(--surface);
  }
  .rotating {
    animation: spin 1s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  [popover] {
    position: fixed;
    inset: auto;
    margin: 0;
    width: min(320px, calc(100vw - 16px));
    max-height: calc(100vh - 16px);
    overflow: auto;
    overflow-wrap: anywhere;
    padding: 14px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: var(--surface);
    color: inherit;
    box-shadow: var(--shadow);
  }
  p {
    margin: 0 0 10px;
    line-height: 1.5;
  }
  small {
    display: block;
    margin-bottom: 10px;
    color: var(--muted);
  }
  a {
    display: block;
    color: var(--accent);
    margin-bottom: 10px;
  }
  .settings {
    display: block;
    margin-top: 10px;
    padding: 0;
    border: 0;
    background: transparent;
    color: var(--accent);
    text-decoration: underline;
    font-size: 12px;
  }
  .reduced-motion-checking {
    display: none;
  }
  @media (prefers-reduced-motion: reduce) {
    .rotating {
      animation: none;
    }
    .reduced-motion-checking {
      display: block;
    }
  }
</style>
