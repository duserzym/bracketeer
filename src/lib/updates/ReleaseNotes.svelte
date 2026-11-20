<script lang="ts">
  import { openReleaseNotes } from './updater.svelte';
  import { releaseNotesUrl, type UpdateInfo } from './updates';
  let { info }: { info: UpdateInfo } = $props();
</script>

{#if info.notes?.trim()}<p class="notes">{info.notes}</p>{/if}
<a
  href={releaseNotesUrl(info.version)}
  target="_blank"
  rel="noreferrer"
  onclick={(event) => openReleaseNotes(event, info.version)}>Release notes</a
>

<style>
  .notes {
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    display: -webkit-box;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 4;
    line-clamp: 4;
    overflow: hidden;
    line-height: 1.5;
    margin: 8px 0;
  }
  a {
    display: block;
    color: var(--accent);
    margin-bottom: 10px;
  }
</style>
