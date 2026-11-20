<script lang="ts">
  import { tick } from 'svelte';
  import type { Project, Session } from '../engine/types';
  import { addSample, autoUnknown, editUnknown } from '../engine/numbering';
  import { checkSpots } from '../engine/checks';
  import { parseGrainAtlasSpots } from '../engine/grainatlas';
  import { spotRuns } from '../engine/parse';
  import { platform } from '../platform';
  import { minerals } from './catalogue';
  import { parseSamplePaste } from './unknowns';
  import { countText } from '../text';
  import CommitInput from './CommitInput.svelte';
  let {
    project,
    session,
    paste = $bindable(''),
    edit,
    importSequence,
  }: {
    project: Project;
    session: Session;
    paste?: string;
    edit: (change: (p: Project) => void) => void;
    importSequence: () => void;
  } = $props();
  const parsed = $derived(parseSamplePaste(paste));
  const issues = $derived(checkSpots(project));
  const groups = $derived([
    ...new Set([
      project.wizard?.mineral ?? '',
      ...project.standards
        .filter((s) => s.role !== 'reference')
        .map((s) => s.mineral ?? project.wizard?.mineral ?? ''),
    ]),
  ]);
  const total = $derived(
    session.unknowns.reduce(
      (n, row) => n + Math.max(0, row.to - row.from + 1),
      0,
    ),
  );
  const placed = $derived(
    project.grainatlas?.spots.reduce(
      (n, range) => n + range.to - range.from + 1,
      0,
    ) ?? 0,
  );
  let loadError = $state('');
  const apply = (next: Project) => edit((p) => Object.assign(p, next));
  async function add() {
    const index = session.unknowns.length;
    apply(addSample(project, session.number, { name: '', tag: '' }, 1));
    await tick();
    // The active session is the only visible unknown table.
    const section = document.querySelector<HTMLElement>(
      `[data-unknown-session="${session.number}"]`,
    );
    section
      ?.querySelector<HTMLInputElement>(
        `[aria-label="Unknown ${index + 1} name"]`,
      )
      ?.focus();
  }
  function move(index: number, direction: number) {
    edit((p) => {
      const rows = p.sessions.find(
        (s) => s.number === session.number,
      )!.unknowns;
      [rows[index], rows[index + direction]] = [
        rows[index + direction]!,
        rows[index]!,
      ];
    });
  }
  function nameIssue(current: Session, index: number): string {
    const row = current.unknowns[index]!;
    const previous = current.unknowns[index - 1];
    if (previous?.name === row.name && previous.tag === row.tag) return '';
    const earlier = current.unknowns
      .slice(0, index)
      .findIndex(
        (r) =>
          r.name.trim() === row.name.trim() && r.tag.trim() === row.tag.trim(),
      );
    return earlier < 0
      ? ''
      : `Row ${index + 1}, ${row.name}: this name and tag are also in row ${earlier + 1}.`;
  }
  async function loadSpots() {
    try {
      const file = await platform.openFile('.csv,.txt');
      if (!file) return;
      const result = parseGrainAtlasSpots(new TextDecoder().decode(file.bytes));
      if (result.errors.length) {
        loadError = result.errors
          .map((e) => `Line ${e.line}: ${e.reason}`)
          .join(' ');
        return;
      }
      edit((p) => {
        p.grainatlas = { file: file.name, spots: spotRuns(result.spots) };
      });
      loadError = '';
    } catch (error) {
      loadError = error instanceof Error ? error.message : String(error);
    }
  }
</script>

<div class="step-two">
  <div class="step-two-heading">
    <label
      >Experiment name<CommitInput
        label="Experiment name"
        value={project.experiment.name}
        type="text"
        commit={(value) =>
          edit((p) => {
            p.experiment.name = value;
          })}
      /></label
    >
    <button onclick={importSequence}>Import sequence…</button>
    <button onclick={loadSpots}>Load GrainAtlas spots…</button>
  </div>
  {#if project.grainatlas}
    <div class="toolbar-line hint">
      GrainAtlas: {countText(placed, 'spot')} from {project.grainatlas.file}
      <button
        onclick={() =>
          edit((p) => {
            delete p.grainatlas;
          })}>Remove</button
      >
    </div>
  {/if}
  {#if loadError}<p class="error" role="alert">{loadError}</p>{/if}
  <section
    class="samples-panel"
    aria-label="Unknown samples"
    data-testid="samples-panel"
  >
    <div class="toolbar-line">
      <h2>
        Unknowns <small
          >Session {session.number}{session.fixed ? ' · read-only' : ''}</small
        >
      </h2>
      {#if groups.length > 1}
        <label class="session-mineral"
          >Mineral<select
            aria-label="Session mineral"
            disabled={session.fixed}
            value={session.mineral ?? project.wizard?.mineral}
            onchange={(e) => {
              const value = e.currentTarget.value;
              edit((p) => {
                p.sessions.find((s) => s.number === session.number)!.mineral =
                  value;
              });
            }}
          >
            {#each groups as group (group)}<option value={group}
                >{minerals.find((m) => m.id === group)?.name ?? group}</option
              >{/each}
          </select></label
        >
      {/if}
    </div>
    <div class="samples-scroll" data-testid="samples-scroll">
      {#each project.sessions as current (current.number)}
        <div
          hidden={current.number !== session.number}
          data-unknown-session={current.number}
        >
          <table class="samples-table" aria-label="Unknowns">
            <colgroup
              ><col class="number" /><col class="sample-name" /><col
                class="sample-tag"
              /><col /><col /><col /><col class="actions" /></colgroup
            >
            <thead
              ><tr
                ><th>Row</th><th>Name</th><th>Tag</th><th>Begin</th><th>End</th
                ><th>Count</th><th>Order</th></tr
              ></thead
            >
            <tbody>
              {#each current.unknowns as row, i (i)}
                {@const rowIssues = issues.filter(
                  (p) =>
                    p.target.kind === 'unknown' &&
                    p.target.session === current.number &&
                    p.target.index === i,
                )}
                <tr>
                  <th scope="row">{i + 1}</th>
                  <td
                    ><CommitInput
                      label={`Unknown ${i + 1} name`}
                      value={row.name}
                      type="text"
                      readonly={current.fixed}
                      invalid={!row.name.trim() || !!nameIssue(current, i)}
                      commit={(value) =>
                        edit((p) => {
                          p.sessions.find(
                            (s) => s.number === current.number,
                          )!.unknowns[i]!.name = value;
                        })}
                    />
                    {#if i > 0 && row.name === current.unknowns[i - 1]!.name && row.tag === current.unknowns[i - 1]!.tag}<small
                        class="hint">↳ continued</small
                      >{/if}
                  </td>
                  <td
                    ><CommitInput
                      label={`Unknown ${i + 1} tag`}
                      value={row.tag}
                      type="text"
                      readonly={current.fixed}
                      commit={(value) =>
                        edit((p) => {
                          p.sessions.find(
                            (s) => s.number === current.number,
                          )!.unknowns[i]!.tag = value;
                        })}
                    /></td
                  >
                  {#each ['from', 'to', 'count'] as field (field)}
                    {@const key = field as 'from' | 'to' | 'count'}
                    {@const label =
                      key === 'from' ? 'begin' : key === 'to' ? 'end' : 'count'}
                    <td
                      ><CommitInput
                        label={`Unknown ${i + 1} ${label}`}
                        value={key === 'count'
                          ? row.to - row.from + 1
                          : row[key]}
                        readonly={current.fixed}
                        min={key === 'count' ? null : 1}
                        validate={(value) =>
                          key === 'count' &&
                          (!Number.isSafeInteger(Number(value)) ||
                            Number(value) < 1)
                            ? 'Enter a positive whole number.'
                            : ''}
                        hand={key !== 'count' && !row.auto?.[key]}
                        invalid={key !== 'count' &&
                          rowIssues.some((p) => p.severity === 'error')}
                        commit={(value) =>
                          apply(
                            editUnknown(
                              project,
                              current.number,
                              i,
                              key,
                              Number(value),
                            ),
                          )}
                        automatic={key === 'count'
                          ? undefined
                          : () =>
                              apply(
                                autoUnknown(project, current.number, i, key),
                              )}
                      /></td
                    >
                  {/each}
                  <td class="row-actions">
                    <button
                      aria-label={`Move unknown ${i + 1} up`}
                      disabled={current.fixed || i === 0}
                      onclick={() => move(i, -1)}>↑</button
                    >
                    <button
                      aria-label={`Move unknown ${i + 1} down`}
                      disabled={current.fixed ||
                        i === current.unknowns.length - 1}
                      onclick={() => move(i, 1)}>↓</button
                    >
                    <button
                      aria-label={`Delete unknown ${i + 1}`}
                      disabled={current.fixed}
                      onclick={() =>
                        edit((p) => {
                          p.sessions
                            .find((s) => s.number === current.number)!
                            .unknowns.splice(i, 1);
                        })}>×</button
                    >
                  </td>
                </tr>
                {#if !row.name.trim()}<tr
                    ><td></td><td colspan="6" class="error"
                      >Row {i + 1}, unnamed: add a name.</td
                    ></tr
                  >{/if}
                {#if nameIssue(current, i)}<tr
                    ><td></td><td colspan="6" class="error"
                      >{nameIssue(current, i)}</td
                    ></tr
                  >{/if}
                {#each rowIssues as issue, n (n)}<tr
                    ><td></td><td
                      colspan="6"
                      class:error={issue.severity === 'error'}
                      class:hint={issue.severity === 'warning'}
                      >{issue.message}</td
                    ></tr
                  >{/each}
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
    <div class="sample-paste">
      <p class="hint hand-legend">
        The accent bar marks a value typed by hand. Auto lets it follow the rows
        above.
      </p>
      <div class="toolbar-line">
        <button disabled={session.fixed} onclick={add}>Add sample</button>
        <span class="hint" data-testid="unknown-total"
          >{countText(total, 'unknown')} in this session</span
        >
      </div>
      {#if !session.fixed && !session.unknowns.length}<p class="hint">
          Session {session.number} has no unknowns.
        </p>{/if}
      <label class="paste-label"
        >Paste unknowns<textarea
          aria-label="Paste unknowns"
          rows="2"
          bind:value={paste}
          disabled={session.fixed}
          placeholder="SYN-1 S 1-30, 35, 40-42"
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
          edit((p) => {
            p.sessions
              .find((s) => s.number === session.number)!
              .unknowns.push(
                ...parsed.rows.flatMap((r) =>
                  r.ranges.map((range) => ({
                    name: r.name,
                    tag: r.tag,
                    ...range,
                  })),
                ),
              );
          });
          paste = '';
        }}>Add pasted unknowns</button
      >
    </div>
  </section>
</div>
