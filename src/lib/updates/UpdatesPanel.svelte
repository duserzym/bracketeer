<script lang="ts">
  import {
    updater,
    check,
    download,
    install,
    setPrefs,
    isTauri,
    openReleaseNotes,
  } from './updater.svelte';
  import { checkButtonView, releaseNotesUrl } from './updates';
  import ReleaseNotes from './ReleaseNotes.svelte';
  let dialog: HTMLDialogElement;
  export function open() {
    dialog.showModal();
  }
  const status = $derived(updater.status);
  const info = $derived('info' in status ? status.info : null);
  const view = $derived(
    checkButtonView(status, updater.version, updater.prefs.autoDownload),
  );
</script>

<dialog
  bind:this={dialog}
  data-testid="updates-panel"
  aria-labelledby="updates-title"
>
  <h2 id="updates-title">Updates</h2>
  <strong>bracketeer v{updater.version}</strong>
  <p aria-live="polite">{view.text}</p>
  {#if view.secondaryText}<p>{view.secondaryText}</p>{/if}
  {#if status.kind === 'available' || status.kind === 'ready'}
    <ReleaseNotes info={status.info} />
  {/if}
  {#if view.details !== null}<p class="details">Details: {view.details}</p>{/if}
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
    {#if status.kind === 'ready'}<button onclick={install}
        >Restart to update</button
      >{/if}
    {#if status.kind === 'unsupported' && info}<a
        href={releaseNotesUrl(info.version)}
        onclick={(event) => openReleaseNotes(event, info.version)}
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
  <p class="last-check">
    Last check: {updater.prefs.lastCheck === null
      ? 'Not checked yet'
      : new Date(updater.prefs.lastCheck).toLocaleString()}<br />Last result: {updater
      .prefs.lastResult ?? 'No result yet'}
  </p>
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
  .last-check,
  .details {
    color: var(--muted);
    font-size: 12px;
  }
  .details {
    user-select: text;
  }
  a {
    color: var(--accent);
  }
</style>
