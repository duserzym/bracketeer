<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { SvelteSet } from 'svelte/reactivity';
  import VersionChip from './lib/updates/VersionChip.svelte';
  import CheckUpdatesButton from './lib/updates/CheckUpdatesButton.svelte';
  import UpdatesPanel from './lib/updates/UpdatesPanel.svelte';
  import { startScheduler } from './lib/updates/updater.svelte';
  let updatesPanel: UpdatesPanel;
  import { deriveSession } from './lib/engine/derive';
  import type { ImportResult } from './lib/engine/import';
  import {
    parseProject,
    serializeProject,
    newSessionFrom,
  } from './lib/engine/project';
  import { planProject, type ProjectPlan } from './lib/engine/sequence';
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
  import CommitInput from './lib/ui/CommitInput.svelte';
  import type Review from './lib/ui/Step4Review.svelte';
  import { afterPaintIdle, loadOnce } from './lib/ui/lazy';
  import Step1Mineral from './lib/ui/Step1Mineral.svelte';
  import { resolveAuto } from './lib/engine/numbering';
  import {
    applySelection,
    catalogue,
    deriveStep,
    guessMineral,
    minerals,
    restoreSeeds,
    saveCatalogue,
    selectionFromProject,
    selectionProblem,
    type Entry,
    type Step,
  } from './lib/ui/catalogue';
  import {
    launchContinue,
    nonemptyProject,
    readRecent,
    recordRecent,
    type Recent,
  } from './lib/ui/recent';
  import { designProblem, type Problem } from './lib/ui/navigation';

  const loadUnknowns = loadOnce(() => import('./lib/ui/Step2Unknowns.svelte'));
  const loadBracketing = loadOnce(
    () => import('./lib/ui/Step3Bracketing.svelte'),
  );
  const loadReview = loadOnce(() => import('./lib/ui/Step4Review.svelte'));
  let Step2Unknowns =
    $state<Awaited<ReturnType<typeof loadUnknowns>>['default']>();
  let Step3Bracketing =
    $state<Awaited<ReturnType<typeof loadBracketing>>['default']>();
  let Step4Review = $state<Awaited<ReturnType<typeof loadReview>>['default']>();
  let mountedSteps = $state.raw<Step[]>([]);
  // Project state changes synchronously; only presentation waits for a chunk.
  let renderedStep = $state<Step>(1);
  let stepLoadError = $state('');
  let stepLoadAttempt = $state(0);

  async function prepareStep(target: Step) {
    if (target === 2) Step2Unknowns = (await loadUnknowns()).default;
    if (target === 3) Step3Bracketing = (await loadBracketing()).default;
    if (target === 4) Step4Review = (await loadReview()).default;
  }

  type Theme = 'light' | 'dark' | 'system';
  type Snapshot = {
    project: Project;
    dirty: number[];
    active: number;
    selected: number[];
    entries: Entry[];
    extras: Record<string, Entry[]>;
  };
  function blankProject(): Project {
    const next = emptyProject();
    next.standards = next.standards.map((s) => ({ ...s, ranges: [] }));
    return next;
  }
  let project = $state.raw<Project>(blankProject());
  let entries = $state.raw<Entry[]>([]);
  let extras = $state.raw<Record<string, Entry[]>>({});
  let recent = $state.raw<Recent[]>([]);
  let continuation = $state.raw<Recent | null>(null);
  let unknownPaste = $state('');
  let inputsEpoch = $state(0);
  let unknownsEpoch = $state(0);
  let invalidFields = $state<Partial<Record<2 | 3, Problem>>>({});
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
  let ready = $state(false);
  let message = $state('');
  let copied = $state('');
  let reviewView = $state<'grid' | 'paste'>('grid');
  let error = $state('');
  let saved = $state('');
  let menuOpen = $state(false);
  let importDialog: HTMLDialogElement;
  let regenerateDialog: HTMLDialogElement;
  let cancelRegenerate: HTMLButtonElement;
  let grid: Review | undefined = $state();
  let importMode = $state('session');
  let importPaste = $state('');
  let importError = $state('');
  let noticeTimer: ReturnType<typeof setTimeout>;
  let actionNumber = 0;
  const step = $derived(project.wizard?.step ?? 1);
  const invalidInput = $derived(
    step === 2 ? invalidFields[2] : invalidFields[3],
  );
  const mineral = $derived(project.wizard?.mineral ?? '');
  const resolvedDark = $derived(
    theme === 'dark' || (theme === 'system' && systemDark),
  );
  const mineralProblem = $derived.by(() => {
    const main = selectionProblem(mineral, entries);
    if (main) return main;
    const names = new SvelteSet(
      entries.filter((e) => e.checked).map((e) => e.name.trim()),
    );
    for (const [id, list] of Object.entries(extras)) {
      const problem = selectionProblem(id, list);
      if (problem)
        return `${minerals.find((m) => m.id === id)?.name ?? id}: ${problem}`;
      for (const entry of list.filter(
        (e) => e.checked && e.role !== 'reference',
      )) {
        if (names.has(entry.name.trim()))
          return `Two standards are called ${entry.name.trim()}`;
        names.add(entry.name.trim());
      }
    }
    return '';
  });
  function selectedProject(): Project {
    const next = applySelection(project, mineral, entries);
    for (const [id, list] of Object.entries(extras)) {
      const selected = applySelection(
        project,
        id,
        list.filter((e) => e.role !== 'reference'),
      );
      next.standards.push(
        ...selected.standards.map((standard) => ({ ...standard, mineral: id })),
      );
    }
    return next;
  }
  const inputProblem = $derived(designProblem(project));
  const standardProblem = $derived(designProblem(project, true));
  const blocking = $derived(
    step === 1
      ? mineralProblem
      : step === 2
        ? invalidInput?.message || inputProblem?.message || ''
        : step === 3
          ? invalidInput?.message ||
            mineralProblem ||
            inputProblem?.message ||
            standardProblem?.message ||
            planError ||
            ''
          : '',
  );
  const stepNames = ['Mineral', 'Unknowns', 'Bracketing', 'Review'];

  function setStep(next: Step) {
    if (next === 1 && step !== 1) syncSelections(project, mineral);
    project = {
      ...project,
      wizard: { mineral: mineral || guessMineral(project), step: next },
    };
    void checkInputs();
  }
  function reachProblem(target: number): string {
    if (target <= step) return '';
    if (target > 1 && mineralProblem) return mineralProblem;
    if (target > 2 && invalidFields[2]) return invalidFields[2].message;
    if (target > 2 && inputProblem) return inputProblem.message;
    if (target > 3 && invalidFields[3]) return invalidFields[3].message;
    if (target > 3 && standardProblem) return standardProblem.message;
    if (target > 3 && planError) return planError;
    return '';
  }
  async function goTo(target: Step) {
    if (target <= step) {
      setStep(target);
      return;
    }
    if (reachProblem(target)) return;
    if (step === 1) {
      const next = resolveAuto(selectedProject());
      if (
        JSON.stringify([next.standards, next.recipe]) !==
        JSON.stringify([project.standards, project.recipe])
      )
        remember();
      project = next;
      refreshPlan();
      setStep(2);
    }
    if (target >= 3 && step === 2) setStep(3);
    if (target === 4 && step === 3) await requestGenerate();
  }
  function nextStep() {
    if (step < 4 && !blocking) void goTo((step + 1) as Step);
  }
  function chooseMineral(id: string) {
    if (id === mineral) return;
    const name = minerals.find((m) => m.id === id)!.name;
    if (
      nonemptyProject(project) &&
      !window.confirm(
        `Switch to ${name}? Unknowns are kept; the standards list changes.`,
      )
    )
      return;
    remember();
    entries = catalogue(id);
    project = { ...project, wizard: { mineral: id, step: 1 } };
    extras = {};
    error = '';
  }
  function changeEntries(next: Entry[]) {
    remember();
    entries = next;
    saveCatalogue(mineral, next);
  }
  function projectSelections(next: Project, chosen: string) {
    const entries = selectionFromProject(
      {
        ...next,
        standards: next.standards.filter(
          (s) => s.role === 'reference' || !s.mineral || s.mineral === chosen,
        ),
      },
      chosen,
    );
    const extras = Object.fromEntries(
      [
        ...new Set(
          next.standards
            .filter(
              (s) =>
                s.role !== 'reference' && s.mineral && s.mineral !== chosen,
            )
            .map((s) => s.mineral!),
        ),
      ].map((id) => [
        id,
        selectionFromProject(
          {
            ...next,
            standards: next.standards.filter(
              (s) => s.role !== 'reference' && s.mineral === id,
            ),
          },
          id,
        ).filter((e) => e.role !== 'reference'),
      ]),
    );
    return { entries, extras };
  }
  function syncSelections(next: Project, chosen: string) {
    const selection = projectSelections(next, chosen);
    entries = selection.entries;
    extras = selection.extras;
  }
  function changeExtra(id: string, list: Entry[]) {
    remember();
    extras = { ...extras, [id]: list };
    saveCatalogue(id, list);
  }
  function addMineral(id: string) {
    changeExtra(
      id,
      catalogue(id).filter((e) => e.role !== 'reference'),
    );
  }
  function removeMineral(id: string) {
    remember();
    extras = Object.fromEntries(
      Object.entries(extras).filter(([key]) => key !== id),
    );
    const next = structuredClone(project);
    next.standards = next.standards.filter(
      (s) => s.role === 'reference' || s.mineral !== id,
    );
    next.sessions.forEach((session) => {
      if (session.mineral === id && !session.fixed) delete session.mineral;
    });
    project = resolveAuto(next);
    refreshPlan();
  }
  function newProject() {
    load(blankProject(), true);
    menuOpen = false;
  }
  function resume(entry: Recent) {
    try {
      load(parseProject(entry.project));
      recent = recordRecent(project);
    } catch (e) {
      fail(e);
    }
  }
  async function focusProblem() {
    if (step === 3 && !invalidInput) {
      if (mineralProblem) setStep(1);
      else if (inputProblem || standardProblem?.session) setStep(2);
      await tick();
    }
    if (step === 1) {
      if (!mineral)
        document.querySelector<HTMLButtonElement>('[role="radio"]')?.focus();
      else {
        const checked = entries
          .map((e, i) => ({ ...e, i }))
          .filter((e) => e.checked);
        const duplicate = checked.find(
          (e, i) =>
            !e.name.trim() ||
            checked.slice(0, i).some((p) => p.name.trim() === e.name.trim()),
        );
        const label = duplicate
          ? `Rename ${duplicate.name}`
          : 'Add primary standard';
        document
          .querySelector<HTMLInputElement>(
            `[aria-label="${CSS.escape(label)}"]`,
          )
          ?.focus();
      }
      return;
    }
    const problem =
      invalidInput ??
      (step === 2 ? inputProblem : (standardProblem ?? inputProblem));
    if (problem?.session) chooseSession(problem.session);
    await tick();
    const field = problem?.label
      ? [
          ...document.querySelectorAll<HTMLElement>(
            `${step === 2 ? '.step-two' : '.bracketing-step'} [aria-label="${CSS.escape(problem.label)}"]`,
          ),
        ].find((field) => !field.closest('[hidden]'))
      : document.querySelector<HTMLElement>(
          '.bracketing-step :invalid, .bracketing-step [aria-invalid="true"]',
        );
    const details = field?.closest('details');
    if (details) details.open = true;
    field?.focus();
  }
  async function checkInputs() {
    await tick();
    if (step !== renderedStep || (step !== 2 && step !== 3)) return;
    const field = document.querySelector<HTMLInputElement>(
      `${step === 2 ? '.unknowns-step' : '.bracketing-step'} input:invalid`,
    );
    const problem: Problem | undefined = field
      ? {
          message: `Enter a valid value for ${field.getAttribute('aria-label') || field.closest('label')?.textContent?.trim() || 'this input'}`,
          ...(field.closest<HTMLElement>('[data-unknown-session]')
            ? {
                session: Number(
                  field.closest<HTMLElement>('[data-unknown-session]')!.dataset
                    .unknownSession,
                ),
              }
            : {}),
          label:
            field.getAttribute('aria-label') ||
            field.closest('label')?.textContent?.trim() ||
            '',
        }
      : undefined;
    const next = { ...invalidFields };
    if (problem) next[step] = problem;
    else delete next[step];
    invalidFields = next;
  }
  const session = $derived(
    project.sessions.find((s) => s.number === active) ?? project.sessions[0]!,
  );
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
    return { project, dirty, active, selected, entries, extras };
  }
  function remember() {
    undo = [...undo.slice(-49), snapshot()];
    redo = [];
  }
  function edit(change: (p: Project) => void, replan = true) {
    try {
      const next = structuredClone(project);
      change(next);
      const resolved = resolveAuto(next);
      if (JSON.stringify(resolved) === JSON.stringify(project)) return true;
      remember();
      project = resolved;
      error = '';
      if (replan) {
        refreshPlan();
        void checkInputs();
      }
      return true;
    } catch (e) {
      fail(e);
      return false;
    }
  }
  function restore(s: Snapshot) {
    const currentStep = step;
    project = s.project.wizard
      ? { ...s.project, wizard: { ...s.project.wizard, step: currentStep } }
      : s.project;
    entries = s.entries;
    extras = s.extras;
    if (mineral) saveCatalogue(mineral, entries);
    for (const [id, list] of Object.entries(extras)) saveCatalogue(id, list);
    dirty = s.dirty;
    active = s.active;
    selected = s.selected;
    selectionBySession = {};
    refreshPlan();
    void checkInputs();
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
  function load(next: Project, blank = false) {
    const chosen = next.wizard?.mineral ?? guessMineral(next);
    const selection = blank
      ? { entries: [], extras: {} }
      : projectSelections(next, chosen);
    let target: Step = blank ? 1 : (next.wizard?.step ?? deriveStep(next));
    let problem = '';
    if (!blank && target > 1) {
      problem = selectionProblem(chosen, selection.entries);
      if (problem) target = 1;
      else if (target > 2) {
        problem = designProblem(next)?.message ?? '';
        if (problem) target = 2;
        else if (target > 3) {
          try {
            const issue = designProblem(next, true);
            if (issue) throw new Error(issue.message);
            planProject(next);
          } catch (e) {
            problem = e instanceof Error ? e.message : String(e);
            target = 3;
          }
        }
      }
    }
    remember();
    entries = selection.entries;
    extras = selection.extras;
    project = blank
      ? next
      : { ...next, wizard: { mineral: chosen, step: target } };
    reviewView = 'grid';
    unknownPaste = '';
    unknownsEpoch += 1;
    inputsEpoch += 1;
    invalidFields = {};
    active =
      next.sessions.find((s) => !s.fixed)?.number ?? next.sessions[0]!.number;
    selected = [];
    selectionBySession = {};
    dirty = [];
    error = problem;
    const firstProblem = target === 2 ? designProblem(project) : null;
    if (firstProblem?.session) active = firstProblem.session;
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
      recent = recordRecent(project);
      menuOpen = false;
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
      recent = recordRecent(project);
      menuOpen = false;
      notify('Project saved');
    } catch (e) {
      fail(e);
    }
  }
  function addOpenSession() {
    const number = Math.max(...project.sessions.map((s) => s.number)) + 1;
    edit((p) => {
      p.sessions.push({ number, fixed: false, unknowns: [], rows: [] });
    });
    chooseSession(number);
  }
  function addSession() {
    try {
      const next = newSessionFrom(project, session.number);
      remember();
      project = next;
      dirty = dirty.filter((n) => n !== session.number);
      active = next.sessions.at(-1)!.number;
      selected = [];
      setStep(2);
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
      setStep(4);
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
    if (!(document.activeElement instanceof HTMLTextAreaElement)) {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
        event.preventDefault();
        nextStep();
        return;
      }
      if (event.altKey && event.key === 'ArrowLeft') {
        event.preventDefault();
        if (step > 1) setStep((step - 1) as Step);
        return;
      }
    }
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
    const rows = session.rows;
    const name = `${fileStem(project.experiment.name)}_${session.number}.${format}`;
    try {
      const { exportWorkbook, toCSV } = await import('./lib/engine/export');
      await platform.saveFile(
        name,
        format === 'csv' ? toCSV(rows) : exportWorkbook(rows, format),
      );
      notify(`Exported ${rows.length} rows`);
    } catch (e) {
      fail(e);
    }
  }
  async function copy() {
    const rows = session.rows;
    const startedAt = actionNumber;
    try {
      const { toTSV } = await import('./lib/engine/export');
      await platform.copyText(toTSV(rows));
      if (startedAt !== actionNumber) return;
      clearTimeout(noticeTimer);
      message = '';
      copied = `Copied ${rows.length} rows. Paste into the LabBook sample list.`;
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
      setStep(4);
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
      const { importWorkbook, importText } =
        await import('./lib/engine/import');
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
  async function pastedSequence() {
    try {
      const { importText } = await import('./lib/engine/import');
      acceptImport(importText(importPaste, project.standards), 'pasted text');
    } catch (e) {
      importError = e instanceof Error ? e.message : String(e);
    }
  }
  async function warningRows(warning: Warning, number = session.number) {
    reviewView = 'grid';
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
    await tick();
    void grid?.reveal(rows[0] ?? 0);
  }
  async function resetLayout() {
    menuOpen = false;
    try {
      localStorage.removeItem('bracketeer.layout');
    } catch {
      /* Storage is optional. */
    }
    try {
      await platform.resetWindow();
    } catch (e) {
      fail(e);
    }
  }
  function resetRecipe() {
    inputsEpoch += 1;
    invalidFields = {};
    edit((p) => {
      p.recipe = structuredClone(DEFAULT_RECIPE);
      for (const block of ['opening', 'mid', 'closing'] as const)
        p.recipe[block] = p.recipe[block].filter(
          (e) =>
            e.standard === '@primary' ||
            p.standards.some((s) => s.name === e.standard),
        );
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
    const clearCopied = () => {
      actionNumber += 1;
      copied = '';
    };
    document.addEventListener('click', clearCopied, true);
    document.addEventListener('input', clearCopied, true);
    document.addEventListener('keydown', clearCopied, true);
    continuation = launchContinue();
    recent = readRecent();
    try {
      const storedTheme = localStorage.getItem('bracketeer.theme');
      if (
        storedTheme === 'light' ||
        storedTheme === 'dark' ||
        storedTheme === 'system'
      )
        theme = storedTheme;
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
    const stopUpdates = startScheduler();
    return () => {
      stopUpdates();
      media.removeEventListener('change', update);
      window.removeEventListener('pagehide', flush);
      clearTimeout(noticeTimer);
      document.removeEventListener('click', clearCopied, true);
      document.removeEventListener('input', clearCopied, true);
      document.removeEventListener('keydown', clearCopied, true);
    };
  });
  $effect(() => {
    const target = step;
    const attempt = stepLoadAttempt; // Retry without changing project state.
    let current = true;
    stepLoadError = '';
    void prepareStep(target).then(
      () => {
        if (!current || step !== target || stepLoadAttempt !== attempt) return;
        mountedSteps = [...new Set([...mountedSteps, target])];
        renderedStep = target;
        void checkInputs();
      },
      (e: unknown) => {
        if (!current || step !== target || stepLoadAttempt !== attempt) return;
        stepLoadError = `Could not load ${stepNames[target - 1]!.toLowerCase()}. ${e instanceof Error ? e.message : String(e)}`;
      },
    );
    return () => {
      current = false;
    };
  });
  $effect(() => {
    if (!ready || renderedStep !== step || renderedStep === 4) return;
    const next = (renderedStep + 1) as Step;
    return afterPaintIdle(() => {
      // A prefetch failure is silent; navigation retries and reports failures.
      void prepareStep(next).catch(() => {});
    });
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
</script>

<svelte:window onkeydown={keyboard} />
<main class="app-shell">
  <header class="topbar" data-testid="topbar">
    <div class="top-line">
      <h1>bracketeer</h1>
      <div class="experiment-title">
        <CommitInput
          label="Experiment title"
          type="text"
          value={project.experiment.name}
          commit={(value) =>
            edit((p) => {
              p.experiment.name = value;
            })}
        />
      </div>

      <nav class="step-bar" aria-label="Wizard steps">
        {#each stepNames as name, i (name)}
          <button
            class:current={step === i + 1}
            aria-current={step === i + 1 ? 'step' : undefined}
            disabled={!!reachProblem(i + 1)}
            title={reachProblem(i + 1) || `Go to ${name.toLowerCase()}`}
            onclick={() => goTo((i + 1) as Step)}>{i + 1} {name}</button
          >
        {/each}
      </nav>
      <button
        title="Ctrl/Cmd+Z"
        disabled={!undo.length}
        onclick={() => history('undo')}>Undo</button
      >
      <button
        title="Ctrl/Cmd+Shift+Z"
        disabled={!redo.length}
        onclick={() => history('redo')}>Redo</button
      >
      <label class="theme-control"
        >Theme<select aria-label="Theme" value={theme} onchange={chooseTheme}
          ><option value="light">Light</option><option value="dark">Dark</option
          ><option value="system">System</option></select
        ></label
      >
      <CheckUpdatesButton onopen={() => updatesPanel.open()} />
      <div class="menu-wrap">
        <button
          aria-expanded={menuOpen}
          aria-controls="app-menu"
          onclick={() => {
            menuOpen = !menuOpen;
          }}>Menu</button
        >
        {#if menuOpen}<div class="menu" id="app-menu">
            <button onclick={openProject}>Open project</button>
            <button onclick={saveProject}>Save project</button>
            <button
              onclick={() => {
                menuOpen = false;
                importError = '';
                importDialog.showModal();
              }}>Import sequence</button
            >
            <button onclick={newProject}>New project</button>
            <button onclick={resetLayout}>Reset layout</button><button
              onclick={resetRecipe}>Reset recipe</button
            >
          </div>{/if}
      </div>
    </div>
  </header>
  {#if error}<div class="app-error" role="alert">
      {error}<button
        aria-label="Dismiss error"
        onclick={() => {
          error = '';
        }}>×</button
      >
    </div>{/if}
  {#if stepLoadError}
    <div class="app-error" role="alert">
      {stepLoadError}<button
        onclick={() => {
          stepLoadAttempt += 1;
        }}>Retry</button
      >
    </div>
  {/if}
  <div class="wizard-body">
    {#if renderedStep === 1}
      <Step1Mineral
        {mineral}
        {entries}
        {extras}
        {changeExtra}
        {addMineral}
        {removeMineral}
        dark={resolvedDark}
        {recent}
        {continuation}
        choose={chooseMineral}
        change={changeEntries}
        restore={() => changeEntries(restoreSeeds(mineral))}
        open={openProject}
        openExample={() => {
          try {
            load(exampleProject());
            recent = recordRecent(project);
          } catch (e) {
            fail(e);
          }
        }}
        {resume}
      />
    {/if}
    {#if Step2Unknowns && mountedSteps.includes(2)}
      <section
        hidden={renderedStep !== 2}
        class="unknowns-step"
        aria-label="Unknowns"
        oninput={checkInputs}
        onchange={checkInputs}
      >
        {@render sessions()}
        {#key unknownsEpoch}
          <Step2Unknowns
            {project}
            {session}
            bind:paste={unknownPaste}
            {edit}
            importSequence={() => {
              importError = '';
              importDialog.showModal();
            }}
          />
        {/key}
      </section>
    {/if}
    {#if Step3Bracketing && mountedSteps.includes(3)}
      {#key inputsEpoch}
        <section
          hidden={renderedStep !== 3}
          class="bracketing-step"
          aria-label="Bracketing"
          oninput={checkInputs}
          onchange={checkInputs}
        >
          <Step3Bracketing {project} {plan} {planError} {edit} {resetRecipe} />
        </section>
      {/key}
    {/if}
    {#if renderedStep === 4 && Step4Review}
      <Step4Review
        bind:this={grid}
        {project}
        {session}
        bind:selected
        bind:reviewView
        tabs={sessions}
        {copied}
        {message}
        {saved}
        {markAsRun}
        {unlock}
        {exportSequence}
        {copy}
        {saveProject}
        {insert}
        {removeRows}
        {move}
        {addSession}
        {cell}
        {warningRows}
        backToBracketing={() => setStep(3)}
      />
    {/if}
  </div>
  <footer class="wizard-footer">
    {#if step > 1}<button onclick={() => setStep((step - 1) as Step)}
        >Back</button
      >{/if}
    <span class="toolbar-spacer"></span>
    {#if blocking}<button class="blocking-message" onclick={focusProblem}
        >{blocking}</button
      >{/if}
    {#if step < 4}<button
        class="primary"
        disabled={!!blocking}
        onclick={nextStep}
        >{step === 1
          ? 'Next: unknowns'
          : step === 2
            ? 'Next: bracketing'
            : 'Generate and review'}</button
      >{/if}
    <VersionChip onopen={() => updatesPanel.open()} />
  </footer>
</main>

<UpdatesPanel bind:this={updatesPanel} />

{#snippet sessions()}
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
    {#if renderedStep === 2}
      <button onclick={addOpenSession}>+ Session</button>
    {/if}
  </nav>
{/snippet}

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
    ><button
      onclick={() => {
        regenerateDialog.close();
        setStep(4);
      }}>Keep my edits</button
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
