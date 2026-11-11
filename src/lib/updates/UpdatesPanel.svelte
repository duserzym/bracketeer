<script lang="ts">
  import {
    updater,
    check,
    download,
    install,
    setPrefs,
    isTauri,
  } from './updater.svelte';
  import { friendlyUpdateError, type Channel } from './updates';
  let dialog: HTMLDialogElement;
  export function open() {
    dialog.showModal();
  }
  const status = $derived(updater.status);
  const info = $derived('info' in status ? status.info : null);
  const time = (value: number) =>
    new Date(value).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    });
  const line = $derived(
    status.kind === 'checking'
      ? 'Checking for updates'
      : status.kind === 'none'
        ? `You're up to date, checked ${time(status.checkedAt)}`
        : status.kind === 'available'
          ? `Version ${status.info.version} is available`
          : status.kind === 'downloading'
            ? `Downloading ${status.info.version}${status.pct === null ? '' : `, ${status.pct}%`}`
            : status.kind === 'ready'
              ? `Version ${status.info.version} is ready to install`
              : status.kind === 'installing'
                ? 'Installing and restarting'
                : status.kind === 'error'
                  ? friendlyUpdateError(status.message)
                  : status.kind === 'unsupported'
                    ? status.reason
                    : 'Checks run automatically in the background.',
  );
</script>

<dialog
  bind:this={dialog}
  data-testid="updates-panel"
  aria-labelledby="updates-title"
>
  <h2 id="updates-title">Updates</h2>
  <strong>bracketeer v{updater.version}</strong>
  <p aria-live="polite">{line}</p>
  {#if status.kind === 'unsupported' && info}<p>
      Version {info.version} is available
    </p>{/if}
  <div class="update-actions">
    <button
      onclick={() => check(true)}
      disabled={status.kind === 'checking' ||
        status.kind === 'downloading' ||
        status.kind === 'installing' ||
        !isTauri}>Check now</button
    >
    {#if status.kind === 'available' && !updater.prefs.autoDownload}<button
        onclick={download}>Download</button
      >{/if}
    {#if status.kind === 'ready'}<button class="primary" onclick={install}
        >Restart to update</button
      >{/if}
    {#if status.kind === 'unsupported' && info}<a
        href="https://github.com/duserzym/bracketeer/releases/latest"
        target="_blank"
        rel="noreferrer">Open download page</a
      >{/if}
  </div>
  <label class="auto-download"
    ><input
      type="checkbox"
      checked={updater.prefs.autoDownload}
      onchange={(event) =>
        setPrefs({ autoDownload: event.currentTarget.checked })}
    /> Download updates automatically</label
  >
  <label class="channel"
    >Channel<select
      value={updater.prefs.channel}
      onchange={(event) =>
        setPrefs({ channel: event.currentTarget.value as Channel })}
      ><option value="stable">Stable</option><option value="beta"
        >Beta (pre-releases)</option
      ></select
    ></label
  >
  <p class="last-check">
    Last check: {updater.prefs.lastCheck === null
      ? 'Not checked yet'
      : new Date(updater.prefs.lastCheck).toLocaleString()}<br />Last result: {updater
      .prefs.lastResult ?? 'No result yet'}
  </p>
  {#if info?.notes}<section aria-label="Release notes">
      <strong>What's new in {info.version}</strong>
      <pre>{info.notes}</pre>
    </section>{/if}
  <a
    href="https://github.com/duserzym/bracketeer/releases"
    target="_blank"
    rel="noreferrer">Release notes on GitHub</a
  >
  <div class="dialog-actions">
    <button onclick={() => dialog.close()}>Close</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(540px, calc(100vw - 40px));
    overflow-wrap: anywhere;
  }
  .update-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }
  .auto-download {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 16px;
  }
  .channel {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 20px;
  }
  .last-check {
    color: var(--muted);
    font-size: 12px;
  }
  pre {
    font: inherit;
    white-space: pre-wrap;
    max-height: 18em;
    line-height: 1.5;
    overflow: auto;
    margin: 8px 0 16px;
  }
  a {
    color: var(--accent);
  }
</style>
