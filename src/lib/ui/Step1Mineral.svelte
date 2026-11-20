<script lang="ts">
  import CatalogueList from './CatalogueList.svelte';
  import { minerals, type Entry } from './catalogue';
  import type { Recent } from './recent';
  let {
    mineral,
    entries,
    dark,
    recent,
    continuation,
    choose,
    change,
    restore,
    open,
    openExample,
    resume,
    extras,
    changeExtra,
    addMineral,
    removeMineral,
  }: {
    mineral: string;
    entries: Entry[];
    dark: boolean;
    recent: Recent[];
    continuation: Recent | null;
    choose: (id: string) => void;
    change: (entries: Entry[]) => void;
    restore: () => void;
    open: () => void;
    openExample: () => void;
    resume: (entry: Recent) => void;
    extras: Record<string, Entry[]>;
    changeExtra: (id: string, entries: Entry[]) => void;
    addMineral: (id: string) => void;
    removeMineral: (id: string) => void;
  } = $props();
  const desktop =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  let another = $state('apatite');
  $effect(() => {
    if (another === mineral || extras[another])
      another =
        minerals.find((m) => m.id !== mineral && !extras[m.id])?.id ?? '';
  });
  function tileKey(event: KeyboardEvent, index: number) {
    const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[
      event.key
    ];
    if (delta === undefined && event.key !== 'Home' && event.key !== 'End')
      return;
    event.preventDefault();
    const next =
      event.key === 'Home'
        ? 0
        : event.key === 'End'
          ? minerals.length - 1
          : (index + (delta ?? 0) + minerals.length) % minerals.length;
    choose(minerals[next]!.id);
    (event.currentTarget as HTMLElement).parentElement
      ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')
      [next]?.focus();
  }
</script>

<section class="welcome-panel" aria-label="Welcome" data-testid="welcome-panel">
  <div class="welcome-main">
    <h2>bracketeer</h2>
    <p class="welcome-intro">
      Plan a standard-bracketed LA-ICP-MS run for the Qtegra LabBook.
    </p>
    <div class="mineral-tiles" role="radiogroup" aria-label="Mineral">
      {#each minerals as tile, i (tile.id)}
        <button
          role="radio"
          aria-checked={mineral === tile.id}
          tabindex={mineral === tile.id || (!mineral && i === 0) ? 0 : -1}
          class:chosen={mineral === tile.id}
          onclick={() => choose(tile.id)}
          onkeydown={(e) => tileKey(e, i)}
        >
          <img
            src={dark ? tile.dark : tile.light}
            alt=""
            width="70"
            height="70"
          />
          <span>{tile.name}</span>
        </button>
      {/each}
    </div>
    {#if mineral}
      <div class="catalogue-heading">
        <h3>Standards</h3>
        <button onclick={restore}>Restore list</button>
      </div>
      <CatalogueList {entries} {change} id={mineral} />
      {#each Object.entries(extras) as [id, list] (id)}
        <div class="catalogue-heading">
          <h3>{minerals.find((m) => m.id === id)?.name ?? id}</h3>
          <button onclick={() => removeMineral(id)}
            >Remove {minerals.find((m) => m.id === id)?.name ?? id}</button
          >
        </div>
        <CatalogueList
          entries={list}
          change={(next) => changeExtra(id, next)}
          {id}
          extra
        />
      {/each}
      <div class="another-mineral toolbar-line">
        <label
          >Another mineral in this run<select
            aria-label="Another mineral in this run"
            bind:value={another}
          >
            {#each minerals.filter((m) => m.id !== mineral && !extras[m.id]) as option (option.id)}<option
                value={option.id}>{option.name}</option
              >{/each}
          </select></label
        >
        <button
          disabled={another === mineral || !!extras[another] || !another}
          onclick={() => {
            addMineral(another);
            another =
              minerals.find(
                (m) => m.id !== mineral && m.id !== another && !extras[m.id],
              )?.id ?? '';
          }}>Add</button
        >
      </div>
    {/if}
  </div>
  <aside class="welcome-recent" aria-label="Recent projects">
    <h3>Continue</h3>
    {#if continuation}<button
        class="recent-entry"
        onclick={() => resume(continuation!)}
        >Continue: {continuation.name || 'Untitled experiment'}, step {continuation.step}</button
      >
    {:else}<p class="hint">Your last run will appear here.</p>{/if}
    <h3>Recent projects</h3>
    {#each recent as entry (entry.name)}
      <button class="recent-entry" onclick={() => resume(entry)}>
        <strong>{entry.name || 'Untitled experiment'}</strong>
        <span
          >{minerals.find((m) => m.id === entry.mineral)?.name ?? entry.mineral} ·
          step {entry.step}</span
        >
        <small
          >{desktop ? 'as saved on ' : ''}{new Date(
            entry.savedAt,
          ).toLocaleDateString()}</small
        >
      </button>
    {:else}<p class="hint">Projects appear here when opened or saved.</p>{/each}
    <button onclick={open}>Open project…</button>
    <button onclick={openExample}>Open example</button>
    <p class="hint">
      Synthetic three-session zircon experiment, ready to generate.
    </p>
  </aside>
</section>
