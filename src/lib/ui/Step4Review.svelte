<script lang="ts">
  import { tick, type Snippet } from 'svelte';
  import { deriveSession } from '../engine/derive';
  import { validate } from '../engine/sequence';
  import type { Project, QtegraCells, Session, Warning } from '../engine/types';
  import SequenceGrid from './SequenceGrid.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import IconButton from './IconButton.svelte';
  import MetaChip from './MetaChip.svelte';
  import StatusChip from './StatusChip.svelte';

  let {
    project,
    session,
    selected = $bindable(),
    reviewView = $bindable(),
    tabs,
    copied,
    message,
    saved,
    markAsRun,
    unlock,
    exportSequence,
    copy,
    saveProject,
    insert,
    removeRows,
    move,
    addSession,
    cell,
    warningRows,
    backToBracketing,
  }: {
    project: Project;
    session: Session;
    selected: number[];
    reviewView: 'grid' | 'paste';
    tabs: Snippet;
    copied: string;
    message: string;
    saved: string;
    markAsRun: () => void;
    unlock: () => void;
    exportSequence: (format: 'xls' | 'xlsx' | 'csv') => void;
    copy: () => void;
    saveProject: () => void;
    insert: (where: 'above' | 'below') => void;
    removeRows: () => void;
    move: (direction: -1 | 1) => void;
    addSession: () => void;
    cell: (
      index: number,
      column: keyof QtegraCells,
      value: string | boolean,
    ) => void;
    warningRows: (warning: Warning, number?: number) => void;
    backToBracketing: () => void;
  } = $props();
  let grid: SequenceGrid | undefined = $state();
  const counts = $derived(deriveSession(session.rows, project.standards));
  const warnings = $derived(
    validate(
      session.rows,
      project.standards,
      session.unknowns,
      project.sessions.filter((s) => s.number !== session.number),
      session.number,
    ),
  );
  export async function reveal(index: number) {
    await tick();
    await grid?.reveal(index);
  }
</script>

<section class="sequence-panel" aria-label="Sequence editor">
  {@render tabs()}
  <div class="grid-toolbar" data-testid="grid-toolbar">
    <div class="toolbar-line">
      <button
        disabled={session.fixed || !session.rows.length}
        onclick={markAsRun}>Mark as run</button
      >
      {#if session.fixed}<button onclick={unlock}>Unlock</button>{/if}
      <span class="toolbar-spacer"></span>
      <button
        class="primary"
        disabled={!session.rows.length}
        onclick={() => exportSequence('xls')}>Export .xls</button
      >
      <button
        disabled={!session.rows.length}
        onclick={() => exportSequence('xlsx')}>.xlsx</button
      ><button
        disabled={!session.rows.length}
        onclick={() => exportSequence('csv')}>.csv</button
      >
      <button disabled={!session.rows.length} onclick={copy}
        >Copy for Qtegra</button
      >
      <IconButton icon="edit" label="Save project" onclick={saveProject} />
    </div>
    <div class="toolbar-line row-tools">
      <SegmentedControl
        label="Sequence view"
        buttonMode
        size="small"
        bind:value={reviewView}
        options={[
          { value: 'grid', label: 'Grid' },
          { value: 'paste', label: 'Qtegra paste' },
        ]}
      />
      <button disabled={session.fixed} onclick={() => insert('above')}
        >Insert above</button
      ><button disabled={session.fixed} onclick={() => insert('below')}
        >Insert below</button
      >
      <IconButton
        icon="close"
        label="Delete rows"
        disabled={session.fixed || !selected.length}
        onclick={removeRows}
      />
      <IconButton
        icon="arrow-up"
        label="Move up"
        title="Move up · Alt+↑"
        disabled={session.fixed || !selected.length}
        onclick={() => move(-1)}
      /><IconButton
        icon="arrow-down"
        label="Move down"
        title="Move down · Alt+↓"
        disabled={session.fixed || !selected.length}
        onclick={() => move(1)}
      />
      <span class="toolbar-spacer"></span>
      <button disabled={!session.rows.length} onclick={addSession}
        >Start another session</button
      >
      <span class="selection-count"
        >{selected.length
          ? `${selected.length} selected`
          : session.fixed
            ? 'Read-only'
            : 'Select rows by number'}</span
      >
    </div>
    <div class="toast" role="status" aria-live="polite">
      {copied || message}
    </div>
  </div>
  {#if !session.rows.length}
    <div class="empty-state">
      <h2>Nothing generated yet</h2>
      <button onclick={backToBracketing}>Back to bracketing</button>
    </div>
  {:else if reviewView === 'paste'}
    {#await import('./QtegraPaste.svelte') then { default: QtegraPaste }}
      <QtegraPaste rows={session.rows} {copy} />
    {:catch e}
      <p class="error">{e instanceof Error ? e.message : String(e)}</p>
    {/await}
  {:else}
    <SequenceGrid
      bind:this={grid}
      {session}
      standards={project.standards}
      {selected}
      onselect={(rows) => {
        selected = rows;
      }}
      onedit={cell}
    />
  {/if}
  <footer class="status-strip">
    <div class="counts" data-testid="counts">
      <MetaChip text={`${session.rows.length} rows`} /><MetaChip
        text={`${counts.structure.chunks.reduce((sum, n) => sum + n, 0)} unknowns`}
      />
      {#each project.standards as s, i (i)}<MetaChip
          text={`${s.name} ${counts.used[s.name]?.length ?? 0}`}
        />{/each}
    </div>
    <div class="legend">
      <span class="kind-unknown">Unknown</span><span class="kind-primary"
        >Primary</span
      ><span class="kind-secondary">Secondary</span><span class="kind-reference"
        >Reference</span
      ><span class="hint">{saved}</span>
    </div>
    <div class="warnings" data-testid="warnings" aria-label="Sequence warnings">
      {#if !warnings.length}<StatusChip
          tone="success"
          text="No warnings"
        />{/if}
      {#each warnings as warning, i (i)}<div class="warning-item">
          <button class="warning-link" onclick={() => warningRows(warning)}
            ><StatusChip tone="warning" text={warning.message} /></button
          >{#if warning.locations}{#each [...new Set(warning.locations.map((l) => l.session))].filter((n) => n !== session.number) as number (number)}<button
                onclick={() => warningRows(warning, number)}
                >Show Session {number}</button
              >{/each}{/if}
        </div>{/each}
    </div>
  </footer>
</section>
