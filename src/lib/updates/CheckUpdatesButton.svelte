<script lang="ts">
  import {
    check,
    download,
    install,
    updater,
    showWhatsNew,
    openReleaseNotes,
  } from './updater.svelte';
  import ReleaseNotes from './ReleaseNotes.svelte';
  import { checkButtonView, releaseNotesUrl } from './updates';

  let { onopen }: { onopen: () => void } = $props();
  let button: HTMLButtonElement;
  let popover: HTMLDivElement;
  let card: HTMLDivElement;
  let dismiss: HTMLButtonElement;
  let expanded = $state(false);
  const view = $derived(
    checkButtonView(
      updater.status,
      updater.version,
      updater.prefs.autoDownload,
    ),
  );

  function positionBox(boxElement: HTMLDivElement) {
    if (!boxElement?.matches(':popover-open')) return;
    const anchor = button.getBoundingClientRect();
    const box = boxElement.getBoundingClientRect();
    const gap = 8;
    boxElement.style.left = `${Math.max(gap, Math.min(anchor.right - box.width, innerWidth - box.width - gap))}px`;
    const below = anchor.bottom + gap;
    boxElement.style.top = `${Math.max(gap, Math.min(below + box.height <= innerHeight - gap ? below : anchor.top - box.height - gap, innerHeight - box.height - gap))}px`;
  }
  function position() {
    positionBox(popover);
    positionBox(card);
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
  function whatsNew() {
    popover.hidePopover();
    showWhatsNew();
  }
  $effect(() => {
    if (updater.whatsNewOpen) {
      card.showPopover();
      positionBox(card);
      dismiss.focus();
    } else if (card?.matches(':popover-open')) card.hidePopover();
  });
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
    class:rotating={view.busy}
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
  {#if view.secondaryText}<small>{view.secondaryText}</small>{/if}
  {#if view.details !== null}<small class="details"
      >Details: {view.details}</small
    >{/if}
  {#if updater.status.kind === 'available' || updater.status.kind === 'ready'}
    <ReleaseNotes info={updater.status.info} />
  {/if}
  {#if view.action === 'download'}
    <button onclick={download}>Download</button>
  {:else if view.action === 'install'}
    <button onclick={install}>Restart to update</button>
  {:else if view.action === 'link'}
    <a
      href={releaseNotesUrl(
        'info' in updater.status && updater.status.info
          ? updater.status.info.version
          : updater.version,
      )}
      onclick={(event) =>
        openReleaseNotes(
          event,
          'info' in updater.status && updater.status.info
            ? updater.status.info.version
            : updater.version,
        )}
      target="_blank"
      rel="noreferrer">Open download page</a
    >
  {/if}
  <button class="settings" onclick={whatsNew}>What's new</button>
  <button class="settings" onclick={settings}>Update settings…</button>
</div>

<div
  bind:this={card}
  popover="auto"
  data-testid="whats-new"
  role="dialog"
  aria-labelledby="whats-new-title"
  ontoggle={() => {
    if (!card.matches(':popover-open')) {
      updater.whatsNewOpen = false;
      button.focus();
    }
  }}
>
  <div class="card-heading">
    <strong id="whats-new-title">What's new in v{updater.version}</strong>
    <button
      bind:this={dismiss}
      aria-label="Dismiss what's new"
      onclick={() => {
        updater.whatsNewOpen = false;
      }}>✕</button
    >
  </div>
  <p class="current-notes">{updater.currentNotes}</p>
</div>

<style>
  .card-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 10px;
  }
  .current-notes {
    white-space: pre-wrap;
    margin: 0;
  }
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
  .details {
    user-select: text;
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
