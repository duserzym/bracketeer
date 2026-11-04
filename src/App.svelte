<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { exportWorkbook, toCSV, toTSV } from './lib/engine/export';
  import {
    deriveSession,
    importText,
    importWorkbook,
    type ImportResult,
  } from './lib/engine/import';
  import {
    parseProject,
    serializeProject,
    newSessionFrom,
  } from './lib/engine/project';
  import {
    planProject,
    validate,
    type ProjectPlan,
  } from './lib/engine/sequence';
  import {
    DEFAULT_RECIPE,
    type Project,
    type QtegraCells,
    type Row,
    type Warning,
  } from './lib/engine/types';
  import { platform } from './lib/platform';
  import {
    editCell,
    emptyProject,
    exampleProject,
    fileStem,
    rowsDiffer,
    moveRows,
  } from './lib/ui/model';
  import Inputs from './lib/ui/Inputs.svelte';
  import SequenceGrid from './lib/ui/SequenceGrid.svelte';

  type Theme = 'light' | 'dark' | 'system';
  type Layout = { folded: boolean; collapsed: string[] };
  type Snapshot = {
    project: Project;
    dirty: number[];
    active: number;
    selected: number[];
  };
  let project = $state.raw<Project>(emptyProject());
  let active = $state(1);
  let dirty = $state.raw<number[]>([]);
  let selected = $state.raw<number[]>([]);
  let selectionBySession: Record<number, number[]> = {};
  let undo = $state.raw<Snapshot[]>([]);
  let redo = $state.raw<Snapshot[]>([]);
  let plan = $state.raw<ProjectPlan | null>(null);
  let planError = $state('');
  let theme = $state<Theme>('light');
  let systemDark = $state(false);
  let layout = $state.raw<Layout>({ folded: false, collapsed: [] });
  let ready = $state(false);
  let message = $state('');
  let error = $state('');
  let saved = $state('');
  let menuOpen = $state(false);
  let importDialog: HTMLDialogElement;
  let regenerateDialog: HTMLDialogElement;
  let cancelRegenerate: HTMLButtonElement;
  let grid: SequenceGrid | undefined = $state();
  let importMode = $state('session');
  let importPaste = $state('');
  let importError = $state('');
  let noticeTimer: ReturnType<typeof setTimeout>;
  const session = $derived(
    project.sessions.find((s) => s.number === active) ?? project.sessions[0]!,
  );
  const warnings = $derived(
    validate(
      session.rows,
      project.standards,
      session.unknowns,
      project.sessions.filter((s) => s.number !== session.number),
      session.number,
    ),
  );
  const counts = $derived(deriveSession(session.rows, project.standards));
  const replaceCount = $derived(
    project.sessions
      .filter((s) => !s.fixed)
      .reduce((sum, s) => sum + s.rows.length, 0),
  );
  const hasManualEdits = $derived(
    project.sessions.some((s) => !s.fixed && dirty.includes(s.number)),
  );

  function notify(text: string) {
    message = text;
    clearTimeout(noticeTimer);
    noticeTimer = setTimeout(() => {
      message = '';
    }, 4000);
  }
  function fail(e: unknown) {
    error = e instanceof Error ? e.message : String(e);
  }
  function refreshPlan() {
    const started = performance.now();
    try {
      plan = planProject(project);
      planError = '';
    } catch (e) {
      plan = null;
      planError = e instanceof Error ? e.message : String(e);
    } finally {
      performance.clearMeasures('bracketeer.plan');
      performance.measure('bracketeer.plan', { start: started });
    }
  }
  function snapshot(): Snapshot {
    return { project, dirty, active, selected };
  }
  function remember() {
    undo = [...undo.slice(-49), snapshot()];
    redo = [];
  }
  function edit(change: (p: Project) => void, replan = true) {
    try {
      const next = structuredClone(project);
      change(next);
      remember();
      project = next;
      error = '';
      if (replan) refreshPlan();
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }
  function restore(s: Snapshot) {
    project = s.project;
    dirty = s.dirty;
    active = s.active;
    selected = s.selected;
    selectionBySession = {};
    refreshPlan();
    error = '';
  }
  function history(direction: 'undo' | 'redo') {
    const source = direction === 'undo' ? undo : redo;
    const state = source.at(-1);
    if (!state) return;
    const now = snapshot();
    if (direction === 'undo') {
      undo = undo.slice(0, -1);
      redo = [...redo, now];
    } else {
      redo = redo.slice(0, -1);
      undo = [...undo, now];
    }
    restore(state);
  }
  function chooseSession(number: number) {
    selectionBySession[active] = selected;
    active = number;
    selected = selectionBySession[number] ?? [];
  }
  function load(next: Project) {
    remember();
    project = next;
    active =
      next.sessions.find((s) => !s.fixed)?.number ?? next.sessions[0]!.number;
    selected = [];
    selectionBySession = {};
    dirty = [];
    error = '';
    refreshPlan();
    dirty = next.sessions
      .filter(
        (s) =>
          !s.fixed &&
          s.rows.length &&
          rowsDiffer(
            s.rows,
            plan?.sessions.find((g) => g.number === s.number)?.rows ?? [],
          ),
      )
      .map((s) => s.number);
  }
  async function openProject() {
    try {
      const file = await platform.openFile('.bracketeer.json,.json');
      if (!file) return;
      const next = parseProject(new TextDecoder().decode(file.bytes));
      if (!next.sessions.length)
        throw new Error('The project needs at least one session.');
      load(next);
      notify(`Opened ${file.name}`);
    } catch (e) {
      fail(e);
    }
  }
  async function saveProject() {
    try {
      await platform.saveFile(
        `${fileStem(project.experiment.name)}.bracketeer.json`,
        serializeProject(project),
      );
      notify('Project saved');
    } catch (e) {
      fail(e);
    }
  }
  function addSession() {
    try {
      const next = newSessionFrom(project, session.number);
      remember();
      project = next;
      dirty = dirty.filter((n) => n !== session.number);
      active = next.sessions.at(-1)!.number;
      selected = [];
      refreshPlan();
    } catch (e) {
      fail(e);
    }
  }
  async function generate() {
    const started = performance.now();
    try {
      const result = planProject(project);
      edit((p) => {
        for (const s of p.sessions)
          if (!s.fixed)
            s.rows = result.sessions.find((g) => g.number === s.number)!.rows;
      }, false);
      dirty = [];
      selected = [];
      selectionBySession = {};
      plan = result;
      planError = '';
      regenerateDialog.close();
      notify('Generated all open sessions');
      await tick();
      performance.clearMeasures('bracketeer.generate');
      performance.measure('bracketeer.generate', { start: started });
    } catch (e) {
      fail(e);
    }
  }
  async function requestGenerate() {
    if (hasManualEdits) {
      regenerateDialog.showModal();
      await tick();
      cancelRegenerate.focus();
    } else generate();
  }
  function unlock() {
    if (
      edit((p) => {
        p.sessions.find((s) => s.number === session.number)!.fixed = false;
      }) &&
      session.rows.length
    )
      dirty = [...new Set([...dirty, session.number])];
  }
  function markAsRun() {
    if (!session.rows.length || session.fixed) return;
    try {
      const next = newSessionFrom(project, session.number);
      next.sessions.pop(); // Mark as run uses the engine's rotation transition without adding a session.
      remember();
      project = next;
      dirty = dirty.filter((n) => n !== session.number);
      refreshPlan();
      notify(`Session ${session.number} marked as run`);
    } catch (e) {
      fail(e);
    }
  }
  function editRows(change: (rows: Row[], p: Project) => void) {
    if (session.fixed) return;
    if (
      edit(
        (p) =>
          change(p.sessions.find((s) => s.number === session.number)!.rows, p),
        false,
      )
    )
      dirty = [...new Set([...dirty, session.number])];
  }
  async function cell(
    index: number,
    column: keyof QtegraCells,
    value: string | boolean,
  ) {
    const started = performance.now();
    editRows((rows, p) => {
      rows[index] = editCell(rows[index]!, column, value, p);
    });
    await tick();
    performance.clearMeasures('bracketeer.cell-edit');
    performance.measure('bracketeer.cell-edit', { start: started });
  }
  function insert(where: 'above' | 'below') {
    const index = selected.length
      ? where === 'above'
        ? Math.min(...selected)
        : Math.max(...selected) + 1
      : session.rows.length;
    editRows((rows, p) => {
      rows.splice(index, 0, {
        ...p.experiment.defaults,
        Label: 'Sample_?',
        Status: null,
        'Laser Scan Position Number': null,
        meta: { kind: 'unrecognized', name: 'Sample', block: 'unknowns' },
      });
    });
    selected = [index];
    void grid?.reveal(index);
  }
  function removeRows() {
    editRows((rows) => {
      for (const index of [...selected].sort((a, b) => b - a))
        rows.splice(index, 1);
    });
    selected = [];
  }
  function move(direction: -1 | 1) {
    if (session.fixed || !selected.length) return;
    const moved = moveRows(session.rows, selected, direction);
    editRows((rows) => {
      rows.splice(0, rows.length, ...moved.rows);
    });
    selected = moved.selected;
    void grid?.reveal(selected[0]!);
  }
  function keyboard(event: KeyboardEvent) {
    if (importDialog?.open || regenerateDialog?.open) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      const focused = document.activeElement;
      if (
        (focused instanceof HTMLInputElement ||
          focused instanceof HTMLTextAreaElement) &&
        !focused.closest('.sequence-grid')
      )
        return;
      event.preventDefault();
      // Finish an in-progress cell edit before applying project history.
      if (
        document.activeElement instanceof HTMLInputElement ||
        document.activeElement instanceof HTMLTextAreaElement
      )
        document.activeElement.blur();
      history(event.shiftKey ? 'redo' : 'undo');
    } else if (
      event.altKey &&
      (event.key === 'ArrowUp' || event.key === 'ArrowDown')
    ) {
      event.preventDefault();
      move(event.key === 'ArrowUp' ? -1 : 1);
    }
  }
  async function exportSequence(format: 'xls' | 'xlsx' | 'csv') {
    try {
      await platform.saveFile(
        `${fileStem(project.experiment.name)}_${session.number}.${format}`,
        format === 'csv'
          ? toCSV(session.rows)
          : exportWorkbook(session.rows, format),
      );
      notify(`Exported ${session.rows.length} rows`);
    } catch (e) {
      fail(e);
    }
  }
  async function copy() {
    try {
      await platform.copyText(toTSV(session.rows));
      notify(`Copied ${session.rows.length} rows`);
    } catch (e) {
      fail(e);
    }
  }
  function acceptImport(result: ImportResult, source: string) {
    if (!result.rows.length) throw new Error('The sequence has no rows.');
    if (
      result.rows.some(
        (r) =>
          r['Laser Scan Position Number'] !== null &&
          !Number.isFinite(r['Laser Scan Position Number']),
      )
    )
      throw new Error(
        'The sequence contains an invalid position number. Correct it before importing.',
      );
    const derived = deriveSession(result.rows, project.standards);
    if (importMode === 'used') {
      edit((p) => {
        for (const s of p.standards)
          s.used = [
            ...new Set([...s.used, ...(derived.used[s.name] ?? [])]),
          ].sort((a, b) => a - b);
      });
    } else {
      const number = Math.max(...project.sessions.map((s) => s.number)) + 1;
      edit((p) => {
        p.sessions.push({
          number,
          fixed: true,
          source,
          rows: result.rows,
          unknowns: derived.unknowns,
        });
      });
      chooseSession(number);
    }
    importDialog.close();
    importPaste = '';
    notify(
      importMode === 'used'
        ? 'Added imported standard spots to used lists'
        : `Imported ${result.rows.length} rows`,
    );
    const issues = [...result.issues, ...derived.issues];
    if (issues.length) error = issues.map((i) => i.message).join('\n');
  }
  async function importFile() {
    try {
      const file = await platform.openFile('.xls,.xlsx,.csv,.tsv,.txt');
      if (!file) return;
      acceptImport(
        /\.(xls|xlsx)$/iu.test(file.name)
          ? importWorkbook(file.bytes, project.standards)
          : importText(new TextDecoder().decode(file.bytes), project.standards),
        file.name,
      );
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
    }
  }
  function pastedSequence() {
    try {
      acceptImport(importText(importPaste, project.standards), 'pasted text');
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
    }
  }
  function warningRows(warning: Warning, number = session.number) {
    const rows =
      warning.locations
        ?.filter((l) => l.session === number)
        .map((l) => l.rowIndex) ?? warning.rowIndexes;
    if (warning.locations)
      for (const location of warning.locations)
        selectionBySession[location.session] = warning.locations
          .filter((l) => l.session === location.session)
          .map((l) => l.rowIndex);
    if (number !== active) chooseSession(number);
    selected = rows;
    void grid?.reveal(rows[0] ?? 0);
  }
  function setLayout(next: Layout) {
    layout = next;
  }
  function collapse(name: string, closed: boolean) {
    if (layout.collapsed.includes(name) === closed) return;
    setLayout({
      ...layout,
      collapsed: closed
        ? [...layout.collapsed, name]
        : layout.collapsed.filter((s) => s !== name),
    });
  }
  function resetLayout() {
    layout = { folded: false, collapsed: [] };
    menuOpen = false;
    try {
      localStorage.removeItem('bracketeer.layout');
    } catch {
      /* Storage is optional. */
    }
  }
  function resetRecipe() {
    edit((p) => {
      p.recipe = structuredClone(DEFAULT_RECIPE);
    });
    menuOpen = false;
  }
  function chooseTheme(event: Event) {
    theme = (event.currentTarget as HTMLSelectElement).value as Theme;
    try {
      localStorage.setItem('bracketeer.theme', theme);
    } catch {
      /* Storage is optional. */
    }
  }
  onMount(() => {
    try {
      const storedTheme = localStorage.getItem('bracketeer.theme');
      if (
        storedTheme === 'light' ||
        storedTheme === 'dark' ||
        storedTheme === 'system'
      )
        theme = storedTheme;
      const storedLayout = JSON.parse(
        localStorage.getItem('bracketeer.layout') ?? 'null',
      ) as Partial<Layout> | null;
      if (storedLayout)
        layout = {
          folded: storedLayout.folded === true,
          collapsed: Array.isArray(storedLayout.collapsed)
            ? storedLayout.collapsed.filter((s) => typeof s === 'string')
            : [],
        };
      const stored = localStorage.getItem('bracketeer.project');
      if (stored) {
        const restored = parseProject(stored);
        if (!restored.sessions.length)
          throw new Error('Saved project has no sessions.');
        load(restored);
      }
    } catch (e) {
      fail(e);
    }
    undo = [];
    redo = [];
    const media = matchMedia('(prefers-color-scheme: dark)');
    systemDark = media.matches;
    const update = () => {
      systemDark = media.matches;
    };
    media.addEventListener('change', update);
    const flush = () => {
      try {
        localStorage.setItem('bracketeer.project', serializeProject(project));
      } catch {
        /* Keep the project available for file saving. */
      }
    };
    window.addEventListener('pagehide', flush);
    refreshPlan();
    ready = true;
    return () => {
      media.removeEventListener('change', update);
      window.removeEventListener('pagehide', flush);
      clearTimeout(noticeTimer);
    };
  });
  $effect(() => {
    document.documentElement.dataset.theme =
      theme === 'system' ? (systemDark ? 'dark' : 'light') : theme;
  });
  $effect(() => {
    if (!ready) return;
    const pending = project;
    saved = 'Saving…';
    const timer = setTimeout(() => {
      try {
        localStorage.setItem('bracketeer.project', serializeProject(pending));
        saved = 'Saved on this computer';
      } catch {
        saved = 'Autosave unavailable · use Save project';
      }
    }, 350);
    return () => clearTimeout(timer);
  });
  $effect(() => {
    if (!ready) return;
    try {
      if (!layout.folded && !layout.collapsed.length)
        localStorage.removeItem('bracketeer.layout');
      else localStorage.setItem('bracketeer.layout', JSON.stringify(layout));
    } catch {
      /* Layout still works without storage. */
    }
  });
</script>

<svelte:window onkeydown={keyboard} />
<main class="app-shell">
  <header class="topbar" data-testid="topbar">
    <div class="top-line">
      <h1>bracketeer</h1>
      <input
        class="experiment-title"
        aria-label="Experiment title"
        value={project.experiment.name}
        placeholder="Untitled experiment"
        onchange={(e) =>
          edit((p) => {
            p.experiment.name = e.currentTarget.value;
          })}
      />
      <div class="file-actions">
        <button onclick={openProject}>Open project</button><button
          onclick={saveProject}>Save project</button
        >
        <button
          onclick={() => {
            importError = '';
            importDialog.showModal();
          }}>Import sequence</button
        >
      </div>
      <label class="theme-control"
        >Theme<select aria-label="Theme" value={theme} onchange={chooseTheme}
          ><option value="light">Light</option><option value="dark">Dark</option
          ><option value="system">System</option></select
        ></label
      >
      <div class="menu-wrap">
        <button
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          onclick={() => {
            menuOpen = !menuOpen;
          }}>Menu</button
        >
        {#if menuOpen}<div class="menu" id="app-menu">
            <button onclick={resetLayout}>Reset layout</button><button
              onclick={resetRecipe}>Reset recipe</button
            >
          </div>{/if}
      </div>
    </div>
    <nav class="session-tabs" aria-label="Sessions">
      {#each project.sessions as s (s.number)}<button
          class:active={s.number === session.number}
          aria-current={s.number === session.number ? 'page' : undefined}
          onclick={() => chooseSession(s.number)}
          >Session {s.number}{s.fixed
            ? s.source
              ? ' · imported'
              : ' · run'
            : ''}</button
        >{/each}
      <button
        aria-label="New session from current"
        title="Mark this session as run and add a new session"
        onclick={addSession}>+</button
      >
    </nav>
  </header>
  <div class="workspace" class:folded={layout.folded}>
    <aside
      class="inputs-panel"
      aria-label="Experiment inputs"
      data-testid="left-panel"
    >
      <div class="panel-heading">
        <span>Inputs</span><button
          aria-label={layout.folded ? 'Unfold inputs' : 'Fold inputs'}
          onclick={() => setLayout({ ...layout, folded: !layout.folded })}
          >{layout.folded ? '»' : '«'}</button
        >
      </div>
      {#if !layout.folded}<div
          class="inputs-scroll"
          data-testid="inputs-scroll"
        >
          <Inputs
            {project}
            {session}
            {plan}
            collapsed={layout.collapsed}
            {edit}
            {collapse}
          />
        </div>{/if}
    </aside>
    <section class="sequence-panel" aria-label="Sequence editor">
      <div class="grid-toolbar" data-testid="grid-toolbar">
        <div class="toolbar-line">
          <button
            class="generate"
            disabled={!plan ||
              !project.sessions.some((s) => !s.fixed && s.unknowns.length)}
            onclick={requestGenerate}>Generate</button
          >
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
        </div>
        <div class="toolbar-line row-tools">
          <button disabled={session.fixed} onclick={() => insert('above')}
            >Insert above</button
          ><button disabled={session.fixed} onclick={() => insert('below')}
            >Insert below</button
          >
          <button
            disabled={session.fixed || !selected.length}
            onclick={removeRows}>Delete rows</button
          >
          <button
            title="Alt+↑"
            disabled={session.fixed || !selected.length}
            onclick={() => move(-1)}>Move up</button
          ><button
            title="Alt+↓"
            disabled={session.fixed || !selected.length}
            onclick={() => move(1)}>Move down</button
          >
          <button
            title="Ctrl/Cmd+Z"
            disabled={!undo.length}
            onclick={() => history('undo')}>Undo</button
          ><button
            title="Ctrl/Cmd+Shift+Z"
            disabled={!redo.length}
            onclick={() => history('redo')}>Redo</button
          >
          <span class="selection-count"
            >{selected.length
              ? `${selected.length} selected`
              : session.fixed
                ? 'Read-only'
                : 'Select rows by number'}</span
          >
        </div>
      </div>
      {#if error || planError}<div class="app-error" role="alert">
          {error || planError}<button
            aria-label="Dismiss error"
            onclick={() => {
              error = '';
            }}>×</button
          >
        </div>{/if}
      {#if !session.rows.length}
        <div class="empty-state">
          <h2>Build your run sequence</h2>
          <p>Add unknowns, check the pools, then Generate.</p>
          <p>Generate plans all open sessions together.</p>
          <button onclick={() => load(exampleProject())}>Open example</button
          ><small>Today's three-session experiment, ready to generate.</small>
        </div>
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
          <strong>{session.rows.length} rows</strong><span
            >{counts.structure.chunks.reduce((sum, n) => sum + n, 0)} unknowns</span
          >{#each project.standards as s, i (i)}<span
              >{s.name} {counts.used[s.name]?.length ?? 0}</span
            >{/each}
        </div>
        <div class="legend">
          <span class="kind-unknown">Unknown</span><span class="kind-primary"
            >Primary</span
          ><span class="kind-secondary">Secondary</span><span
            class="kind-reference">Reference</span
          ><span class="hint">{saved}</span>
        </div>
        <div
          class="warnings"
          data-testid="warnings"
          aria-label="Sequence warnings"
        >
          {#if !warnings.length}<span class="no-warnings">No warnings</span
            >{/if}
          {#each warnings as warning, i (i)}<div class="warning-item">
              <button class="warning-link" onclick={() => warningRows(warning)}
                >{warning.message}</button
              >{#if warning.locations}{#each [...new Set(warning.locations.map((l) => l.session))].filter((n) => n !== session.number) as number (number)}<button
                    onclick={() => warningRows(warning, number)}
                    >Show Session {number}</button
                  >{/each}{/if}
            </div>{/each}
        </div>
      </footer>
    </section>
  </div>
  <div class="toast" role="status" aria-live="polite">{message}</div>
</main>

<dialog bind:this={regenerateDialog} aria-labelledby="regenerate-title">
  <h2 id="regenerate-title">Replace manual edits?</h2>
  <p>
    Generate will replace {replaceCount} rows in all open sessions, including manual
    edits.
  </p>
  <div class="dialog-actions">
    <button
      bind:this={cancelRegenerate}
      onclick={() => regenerateDialog.close()}>Cancel</button
    ><button class="primary" onclick={generate}>Regenerate</button>
  </div>
</dialog>
<dialog bind:this={importDialog} aria-labelledby="import-title">
  <h2 id="import-title">Import sequence</h2>
  <label
    >Import as<select aria-label="Import destination" bind:value={importMode}
      ><option value="session">A new fixed session</option><option value="used"
        >Used standard spots for this experiment</option
      ></select
    ></label
  >
  <p class="hint">Used lists are shared by every session in this experiment.</p>
  <button onclick={importFile}>Choose .xls, .xlsx or .csv</button>
  <label class="paste-label"
    >Paste Qtegra rows<textarea
      aria-label="Paste sequence"
      rows="6"
      bind:value={importPaste}
      placeholder="Paste the 13 columns, with or without a header"
    ></textarea></label
  >
  {#if importError}<p class="error" role="alert">{importError}</p>{/if}
  <div class="dialog-actions">
    <button onclick={() => importDialog.close()}>Cancel</button><button
      class="primary"
      disabled={!importPaste.trim()}
      onclick={pastedSequence}>Import pasted sequence</button
    >
  </div>
</dialog>
