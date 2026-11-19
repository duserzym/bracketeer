<script lang="ts">
  import type { Project } from '../engine/types';
  import { countStandards } from '../engine/count';
  import { checkSpots } from '../engine/checks';
  import { deriveSession } from '../engine/derive';
  import {
    addStandardRange,
    autoStandardRange,
    editStandardRange,
  } from '../engine/numbering';
  import { formatSpots, parseSpotList } from '../engine/parse';
  import { minerals } from './catalogue';
  import CommitInput from './CommitInput.svelte';
  let {
    project,
    edit,
  }: { project: Project; edit: (change: (p: Project) => void) => void } =
    $props();
  const counts = $derived.by(() => {
    try {
      return countStandards(project);
    } catch {
      return [];
    }
  });
  const issues = $derived(checkSpots(project));
  const fixedUse = $derived(
    project.sessions
      .filter((s) => s.fixed)
      .map((s) => ({
        number: s.number,
        used: deriveSession(s.rows, project.standards).used,
      })),
  );
  const several = $derived(
    project.standards.some(
      (s) =>
        s.role !== 'reference' &&
        s.mineral &&
        s.mineral !== project.wizard?.mineral,
    ),
  );
  const cadence = $derived(project.recipe.secondaries === 'cadence');
  const apply = (next: Project) => edit((p) => Object.assign(p, next));
  function endpoint(
    name: string,
    index: number,
    field: 'from' | 'to',
    value: number,
  ) {
    const next = structuredClone(project);
    const standard = next.standards.find((s) => s.name === name)!;
    if (!standard.ranges.length)
      standard.ranges.push({
        from: value,
        to: value,
        auto: { from: true, to: true },
      });
    apply(editStandardRange(next, name, index, field, value));
  }
</script>

<section
  class="standard-spots"
  aria-label="Standard spots"
  data-testid="spots-panel"
>
  <h2>Standard spots</h2>
  <div data-testid="spots-scroll">
    <table class="standard-spots-table" aria-label="Standard spots">
      <colgroup
        ><col class="standard-name" /><col class="endpoint" /><col
          class="endpoint"
        /><col class="placed" /><col class="used" /><col class="spare" /><col
          class="range-action"
        />
        {#if cadence}<col class="cadence" /><col class="cadence" />{/if}
      </colgroup>
      <thead
        ><tr
          ><th>Standard</th><th>Begin</th><th>End</th><th>Placed / needed</th
          ><th>Used</th><th>Spare</th><th></th>{#if cadence}<th>Per bracket</th
            ><th>Every / Odd / Even</th>{/if}</tr
        ></thead
      >
      {#each project.standards as standard, standardIndex (standard.name)}
        {@const count = counts.find((c) => c.name === standard.name)}
        <tbody data-testid={`standard-${standard.name}`}>
          {#each standard.ranges.length ? standard.ranges : [null] as range, i (i)}
            {@const rowIssues = issues.filter(
              (issue) =>
                issue.target.kind === 'standard' &&
                issue.target.name === standard.name &&
                issue.target.index === i,
            )}
            <tr>
              <th scope="row"
                >{i ? '↳' : standard.name}{#if !i}<small
                    >{standard.role}{several && standard.role !== 'reference'
                      ? `; ${minerals.find((m) => m.id === (standard.mineral ?? project.wizard?.mineral))?.name ?? standard.mineral}`
                      : ''}</small
                  >{/if}</th
              >
              {#each ['from', 'to'] as field (field)}
                {@const key = field as 'from' | 'to'}
                {@const label = `${standard.name} ${i ? `range ${i + 1} ` : ''}${key === 'from' ? 'begin' : 'end'}`}
                <td
                  ><CommitInput
                    {label}
                    value={range?.[key] ?? ''}
                    min={key === 'to' && range?.auto?.to ? 0 : 1}
                    required={!!range}
                    hand={!!range && !range.auto?.[key]}
                    invalid={rowIssues.some((p) => p.severity === 'error')}
                    commit={(value) =>
                      endpoint(standard.name, i, key, Number(value))}
                    automatic={range &&
                    (key === 'from' || i === standard.ranges.length - 1)
                      ? () =>
                          apply(
                            autoStandardRange(project, standard.name, i, key),
                          )
                      : undefined}
                  /></td
                >
              {/each}
              {#if i === 0}
                <td
                  class:error={!!count?.short}
                  data-testid={`placed-${standard.name}`}
                  >{count
                    ? `${count.available} / ${count.needed}`
                    : '—'}{#if count?.short}<strong class="short-count"
                      >{count.short} short</strong
                    >{/if}</td
                >
                <td
                  ><CommitInput
                    label={`${standard.name} used`}
                    type="text"
                    value={formatSpots(standard.used)}
                    validate={(value) =>
                      parseSpotList(value)
                        .errors.map((e) => `${e.token}: ${e.reason}`)
                        .join(' ')}
                    commit={(value) =>
                      edit((p) => {
                        p.standards[standardIndex]!.used =
                          parseSpotList(value).spots;
                      })}
                  /></td
                >
                <td
                  ><CommitInput
                    label={`${standard.name} keep spare`}
                    min={0}
                    value={standard.spare}
                    commit={(value) =>
                      edit((p) => {
                        p.standards[standardIndex]!.spare = Number(value);
                      })}
                  /></td
                >
                <td
                  ><button
                    class="add-range"
                    aria-label={`${standard.name} + range`}
                    onclick={() =>
                      apply(addStandardRange(project, standard.name))}
                    >+ range</button
                  ></td
                >
                {#if cadence}
                  <td
                    >{#if standard.role === 'secondary'}<CommitInput
                        label={`${standard.name} per bracket`}
                        min={1}
                        value={standard.perBracket ??
                          project.recipe.spotsPerSecondary}
                        commit={(value) =>
                          edit((p) => {
                            p.standards[standardIndex]!.perBracket =
                              Number(value);
                          })}
                      />{/if}</td
                  >
                  <td
                    >{#if standard.role === 'secondary'}<select
                        aria-label={`${standard.name} cadence`}
                        value={standard.cadence ?? 'every'}
                        onchange={(e) => {
                          const value = e.currentTarget.value as
                            'every' | 'odd' | 'even';
                          edit((p) => {
                            p.standards[standardIndex]!.cadence = value;
                          });
                        }}
                      >
                        <option value="every">Every</option><option value="odd"
                          >Odd</option
                        ><option value="even">Even</option></select
                      >{/if}</td
                  >
                {/if}
              {:else}<td colspan={cadence ? 6 : 4}></td>{/if}
            </tr>
            {#each rowIssues as issue, n (n)}<tr class="standard-detail"
                ><td
                  colspan={cadence ? 9 : 7}
                  class:error={issue.severity === 'error'}
                  class:hint={issue.severity === 'warning'}>{issue.message}</td
                ></tr
              >{/each}
          {/each}
          <tr class="standard-detail"
            ><td colspan={cadence ? 9 : 7}>
              <div
                class="hint standard-formula"
                data-testid={`formula-${standard.name}`}
              >
                {count?.formula ??
                  'Count unavailable until the recipe can be planned.'}
              </div>
              {#each fixedUse.filter((s) => s.used[standard.name]?.length) as fixed (fixed.number)}<div
                  class="hint fixed-used"
                >
                  Session {fixed.number} used: {formatSpots(
                    fixed.used[standard.name]!,
                  )}
                </div>{/each}
            </td></tr
          >
        </tbody>
      {/each}
    </table>
  </div>
  <p class="hint hand-legend">
    The accent bar marks a value typed by hand. Auto lets it follow the rows
    above.
  </p>
</section>
