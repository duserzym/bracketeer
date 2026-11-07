<script lang="ts">
  import { tick } from 'svelte';
  import { deriveSession } from '../engine/derive';
  import { formatSpots, parseSpotList, spotRuns } from '../engine/parse';
  import type { Project, Session } from '../engine/types';
  import {
    draftText,
    parseSamplePaste,
    rangeSpots,
    sampleRows,
    type InputProblem,
    type SampleRow,
    type UnknownsState,
  } from './unknowns';

  let {
    project,
    session,
    state = $bindable(),
    problems,
    warnings,
    paste = $bindable(''),
    edit,
    changeStandards,
    importSequence,
  }: {
    project: Project;
    session: Session;
    state: UnknownsState;
    problems: InputProblem[];
    warnings: InputProblem[];
    paste?: string;
    edit: (change: (p: Project) => void) => void;
    changeStandards: () => void;
    importSequence: () => void;
  } = $props();
  const rows = $derived(sampleRows(session, state));
  const parsed = $derived(parseSamplePaste(paste));
  const total = $derived(
    rows.reduce((sum, r) => sum + rangeSpots(r.ranges).length, 0),
  );
  const fixedUse = $derived(
    project.sessions
      .filter((s) => s.fixed)
      .map((s) => ({
        number: s.number,
        used: deriveSession(s.rows, project.standards).used,
      })),
  );
  function rowProblems(i: number) {
    return problems.filter(
      (p) => p.session === session.number && p.row === i + 1,
    );
  }
  function store(nextRows: SampleRow[], commit: boolean) {
    if (session.fixed) return;
    const unknowns = nextRows.flatMap((r) =>
      r.ranges.map((range) => ({ name: r.name, tag: r.tag, ...range })),
    );
    state = {
      ...state,
      sessions: {
        ...state.sessions,
        [session.number]: {
          signature: JSON.stringify(commit ? unknowns : session.unknowns),
          rows: nextRows,
        },
      },
    };
    if (commit && JSON.stringify(unknowns) !== JSON.stringify(session.unknowns))
      edit((p) => {
        p.sessions.find((s) => s.number === session.number)!.unknowns =
          unknowns;
      });
  }
  function patch(index: number, patch: Partial<SampleRow>, commit: boolean) {
    store(
      rows.map((r, i) => (i === index ? { ...r, ...patch } : r)),
      commit,
    );
  }
  function commitSpots(index: number) {
    const row = rows[index]!;
    const result = parseSpotList(row.text);
    if (result.errors.length || !result.spots.length) return;
    patch(index, { ranges: spotRuns(result.spots) }, true);
  }
  async function addSample() {
    const spot =
      Math.max(0, ...rows.flatMap((r) => r.ranges.map((r) => r.to))) + 1;
    store(
      [
        ...rows,
        {
          key: crypto.randomUUID(),
          name: '',
          tag: '',
          ranges: [{ from: spot, to: spot }],
          text: String(spot),
        },
      ],
      true,
    );
    await tick();
    document
      .querySelector<HTMLInputElement>(
        `.step-two [aria-label="Unknown ${rows.length} name"]`,
      )
      ?.focus();
  }
  function move(index: number, delta: number) {
    const next = [...rows];
    [next[index], next[index + delta]] = [next[index + delta]!, next[index]!];
    store(next, true);
  }
  function standardText(name: string, field: 'pool' | 'used', saved: string) {
    return draftText(state, `${name}:${field}`, saved);
  }
  function typeStandard(
    name: string,
    field: 'pool' | 'used',
    saved: string,
    text: string,
  ) {
    state = {
      ...state,
      standards: { ...state.standards, [`${name}:${field}`]: { text, saved } },
    };
  }
  function commitStandard(name: string, field: 'pool' | 'used', text: string) {
    const parsed = parseSpotList(text);
    if (parsed.errors.length) return;
    const saved = formatSpots(parsed.spots);
    typeStandard(name, field, saved, text);
    const current = project.standards.find((s) => s.name === name)!;
    if (
      formatSpots(
        field === 'pool' ? rangeSpots(current.ranges) : current.used,
      ) === saved
    )
      return;
    edit((p) => {
      const standard = p.standards.find((s) => s.name === name)!;
      if (field === 'pool') standard.ranges = spotRuns(parsed.spots);
      else standard.used = parsed.spots;
    });
  }
</script>

<div class="step-two">
  <div class="step-two-heading">
    <label
      >Experiment name<input
        aria-label="Experiment name"
        value={project.experiment.name}
        oninput={(e) =>
          edit((p) => {
            p.experiment.name = e.currentTarget.value;
          })}
      /></label
    >
    <button onclick={importSequence}>Import sequence…</button>
  </div>
  <div class="unknown-panels">
    <section
      class="samples-panel"
      aria-label="Unknown samples"
      data-testid="samples-panel"
    >
      <h2>
        Unknowns <small
          >Session {session.number}{session.fixed ? ' · read-only' : ''}</small
        >
      </h2>
      <div class="samples-scroll" data-testid="samples-scroll">
        <table class="samples-table" aria-label="Unknowns">
          <colgroup
            ><col class="number" /><col class="sample-name" /><col
              class="sample-tag"
            /><col class="sample-spots" /><col /><col
              class="actions"
            /></colgroup
          >
          <thead
            ><tr
              ><th scope="col">Row</th><th scope="col">Name</th><th scope="col"
                >Tag</th
              ><th scope="col">Spots</th><th scope="col">Normalized</th><th
                scope="col">Order</th
              ></tr
            ></thead
          >
          <tbody>
            {#each rows as row, i (row.key)}
              <tr>
                <th scope="row">{i + 1}</th>
                <td
                  ><input
                    aria-label={`Unknown ${i + 1} name`}
                    readonly={session.fixed}
                    value={row.name}
                    aria-invalid={rowProblems(i).some(
                      (p) => p.field === 'name',
                    )}
                    oninput={(e) =>
                      patch(i, { name: e.currentTarget.value }, true)}
                  /></td
                >
                <td
                  ><input
                    aria-label={`Unknown ${i + 1} tag`}
                    readonly={session.fixed}
                    value={row.tag}
                    oninput={(e) =>
                      patch(i, { tag: e.currentTarget.value }, true)}
                  /></td
                >
                <td
                  ><input
                    aria-label={`Unknown ${i + 1} spots`}
                    readonly={session.fixed}
                    value={row.text}
                    aria-invalid={rowProblems(i).some(
                      (p) => p.field === 'spots',
                    )}
                    oninput={(e) =>
                      patch(i, { text: e.currentTarget.value }, false)}
                    onchange={() => commitSpots(i)}
                    onblur={() => commitSpots(i)}
                    onkeydown={(e) => {
                      if (e.key === 'Enter') {
                        commitSpots(i);
                        e.preventDefault();
                      }
                    }}
                  /></td
                >
                <td class="normalized"
                  >{formatSpots(rangeSpots(row.ranges))} · {rangeSpots(
                    row.ranges,
                  ).length} spots</td
                >
                <td class="row-actions">
                  <button
                    aria-label={`Move unknown ${i + 1} up`}
                    disabled={session.fixed || i === 0}
                    onclick={() => move(i, -1)}>↑</button
                  >
                  <button
                    aria-label={`Move unknown ${i + 1} down`}
                    disabled={session.fixed || i === rows.length - 1}
                    onclick={() => move(i, 1)}>↓</button
                  >
                  <button
                    aria-label={`Delete unknown ${i + 1}`}
                    disabled={session.fixed}
                    onclick={() =>
                      store(
                        rows.filter((_, n) => n !== i),
                        true,
                      )}>×</button
                  >
                </td>
              </tr>
              {#if rowProblems(i).length}<tr
                  ><td></td><td colspan="5"
                    >{#each rowProblems(i) as problem, n (n)}<div class="error">
                        {problem.message}
                      </div>{/each}</td
                  ></tr
                >{/if}
            {/each}
          </tbody>
        </table>
      </div>
      <div class="sample-paste">
        <div class="toolbar-line">
          <button disabled={session.fixed} onclick={addSample}
            >Add sample</button
          ><span class="hint" data-testid="unknown-total"
            >{total} unknowns in this session</span
          >
        </div>
        {#each [...problems, ...warnings].filter((p) => p.session === session.number && !p.row) as problem, i (i)}<p
            class:error={problems.includes(problem)}
            class="hint"
          >
            {problem.message}
          </p>{/each}
        <label class="paste-label"
          >Paste unknowns<textarea
            aria-label="Paste unknowns"
            rows="2"
            bind:value={paste}
            disabled={session.fixed}
            placeholder="SYN-H3 S 1-30, 35, 40-42"
          ></textarea></label
        >
        {#each parsed.errors as error (error.line)}<p class="error">
            Line {error.line}: {error.text} — {error.reason}
          </p>{/each}
        <button
          disabled={session.fixed ||
            !parsed.rows.length ||
            !!parsed.errors.length}
          onclick={() => {
            store(
              [
                ...rows,
                ...parsed.rows.map((r) => ({ ...r, key: crypto.randomUUID() })),
              ],
              true,
            );
            paste = '';
          }}>Add pasted unknowns</button
        >
      </div>
    </section>
    <section
      class="spots-panel"
      aria-label="Standards’ spots"
      data-testid="spots-panel"
    >
      <div class="toolbar-line">
        <h2>Standards’ spots</h2>
        <button class="text-link" onclick={changeStandards}
          >Change standards</button
        >
      </div>
      <div class="spots-scroll" data-testid="spots-scroll">
        {#each project.standards as standard (standard.name)}
          <article class="spot-card">
            <h3>{standard.name} <small>{standard.role}</small></h3>
            {#each ['pool', 'used'] as field (field)}
              {@const key = field as 'pool' | 'used'}
              {@const spots =
                key === 'pool' ? rangeSpots(standard.ranges) : standard.used}
              {@const saved = formatSpots(spots)}
              {@const text = standardText(standard.name, key, saved)}
              {@const issues = problems.filter(
                (p) => p.standard === standard.name && p.field === key,
              )}
              {@const syntax = parseSpotList(text).errors}
              <label class="spot-field"
                >{key === 'pool' ? 'Pool' : 'Used'}<input
                  aria-label={`${standard.name} ${key === 'pool' ? 'ranges' : 'used'}`}
                  value={text}
                  aria-invalid={!!issues.length || !!syntax.length}
                  oninput={(e) =>
                    typeStandard(
                      standard.name,
                      key,
                      saved,
                      e.currentTarget.value,
                    )}
                  onchange={(e) =>
                    commitStandard(standard.name, key, e.currentTarget.value)}
                  onblur={(e) =>
                    commitStandard(standard.name, key, e.currentTarget.value)}
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      commitStandard(standard.name, key, e.currentTarget.value);
                      e.preventDefault();
                    }
                  }}
                /><span class="hint"
                  >{saved || 'None'} · {spots.length} spots</span
                ></label
              >
              {#each issues as issue, i (i)}<div class="error">
                  {issue.message}
                </div>{/each}
              {#if key === 'used'}{#each syntax as issue, i (i)}<div
                    class="error"
                  >
                    {issue.token}: {issue.reason}
                  </div>{/each}{/if}
            {/each}
            {#each fixedUse.filter((s) => s.used[standard.name]?.length) as fixed (fixed.number)}<p
                class="hint fixed-used"
              >
                Session {fixed.number} used: {formatSpots(
                  fixed.used[standard.name]!,
                )}
              </p>{/each}
            {#each warnings.filter((p) => p.standard === standard.name) as warning, i (i)}<p
                class="hint"
              >
                {warning.message}
              </p>{/each}
          </article>
        {/each}
      </div>
    </section>
  </div>
</div>
