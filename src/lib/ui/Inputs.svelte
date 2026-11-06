<script lang="ts">
  import { deriveSession } from '../engine/import';
  import { parseRanges, parseUnknowns, parseUsedSpots } from '../engine/parse';
  import type { ProjectPlan } from '../engine/sequence';
  import type {
    Project,
    Session,
    StandardRole,
    Unknown,
  } from '../engine/types';
  import RangesInput from './RangesInput.svelte';

  let {
    project,
    session,
    plan,
    collapsed,
    edit,
    collapse,
    paste = $bindable(''),
  }: {
    paste?: string;
    project: Project;
    session: Session;
    plan: ProjectPlan | null;
    collapsed: string[];
    edit: (change: (p: Project) => void) => void;
    collapse: (name: string, closed: boolean) => void;
  } = $props();
  const parsed = $derived(parseUnknowns(paste));
  const total = $derived(
    session.unknowns.reduce(
      (sum, u) => sum + Math.max(0, u.to - u.from + 1),
      0,
    ),
  );
  const secondaries = $derived(
    project.standards.filter((s) => s.role === 'secondary'),
  );
  const planned = $derived(
    plan?.sessions.filter((s) => !s.fixed && s.chunks.length) ?? [],
  );
  const doubled = $derived(
    planned.flatMap((s) => s.pairsPerBracket).filter((n) => n > 1).length,
  );
  const fixedUse = $derived(
    project.sessions
      .filter((s) => s.fixed)
      .map((s) => ({
        number: s.number,
        source: s.source,
        used: deriveSession(s.rows, project.standards).used,
      })),
  );
  function spotRanges(spots: number[]) {
    const ranges: string[] = [];
    for (let i = 0; i < spots.length; i++) {
      const first = spots[i]!;
      let last = first;
      while (spots[i + 1] === last + 1) last = spots[++i]!;
      ranges.push(first === last ? String(first) : `${first}–${last}`);
    }
    return ranges.join(', ');
  }
  function current(p: Project) {
    return p.sessions.find((s) => s.number === session.number)!;
  }
  function value(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
  function numeric(event: Event, apply: (p: Project, n: number) => void) {
    const input = event.currentTarget as HTMLInputElement;
    if (
      !input.reportValidity() ||
      !input.value.trim() ||
      !Number.isFinite(input.valueAsNumber)
    )
      return;
    edit((p) => apply(p, input.valueAsNumber));
  }
  function sample(index: number, key: keyof Unknown, event: Event) {
    if (key === 'from' || key === 'to')
      numeric(event, (p, n) => {
        current(p).unknowns[index]![key] = n;
      });
    else
      edit((p) => {
        current(p).unknowns[index]![key] = value(event);
      });
  }
  function moveUnknown(index: number, direction: number) {
    edit((p) => {
      const rows = current(p).unknowns;
      [rows[index], rows[index + direction]] = [
        rows[index + direction]!,
        rows[index]!,
      ];
    });
  }
</script>

<details
  open={!collapsed.includes('experiment')}
  ontoggle={(e) => collapse('experiment', !e.currentTarget.open)}
>
  <summary>Experiment</summary>
  <div class="section-body form-grid">
    <label class="span-2"
      >Name<input
        aria-label="Experiment name"
        value={project.experiment.name}
        onchange={(e) =>
          edit((p) => {
            p.experiment.name = value(e);
          })}
        placeholder="Experiment name"
      /></label
    >
    <p class="hint span-2">Column defaults for generated rows</p>
    <label
      >Duration [s]<input
        type="number"
        required
        step="any"
        value={project.experiment.defaults['Duration [s]']}
        onchange={(e) =>
          numeric(e, (p, n) => {
            p.experiment.defaults['Duration [s]'] = n;
          })}
      /></label
    >
    <label
      >Laser output [%]<input
        type="number"
        required
        step="any"
        value={project.experiment.defaults['Laser Output Setting [%]']}
        onchange={(e) =>
          numeric(e, (p, n) => {
            p.experiment.defaults['Laser Output Setting [%]'] = n;
          })}
      /></label
    >
    <label
      >Sample type<input
        value={project.experiment.defaults['Sample Type']}
        onchange={(e) =>
          edit((p) => {
            p.experiment.defaults['Sample Type'] = value(e);
          })}
      /></label
    >
    <label
      >Dilution<input
        type="number"
        required
        step="any"
        value={project.experiment.defaults['Dilution Factor']}
        onchange={(e) =>
          numeric(e, (p, n) => {
            p.experiment.defaults['Dilution Factor'] = n;
          })}
      /></label
    >
    <label class="span-2"
      >Comment<input
        value={project.experiment.defaults.Comment}
        onchange={(e) =>
          edit((p) => {
            p.experiment.defaults.Comment = value(e);
          })}
      /></label
    >
    <label class="span-2"
      >Identifier<input
        value={project.experiment.defaults.Identifier}
        onchange={(e) =>
          edit((p) => {
            p.experiment.defaults.Identifier = value(e);
          })}
      /></label
    >
    <label class="check span-2"
      ><input
        type="checkbox"
        checked={project.experiment.defaults.Evaluate}
        onchange={(e) =>
          edit((p) => {
            p.experiment.defaults.Evaluate = e.currentTarget.checked;
          })}
      />Evaluate</label
    >
  </div>
</details>

<details
  open={!collapsed.includes('unknowns')}
  ontoggle={(e) => collapse('unknowns', !e.currentTarget.open)}
>
  <summary>Unknowns <span class="section-count">{total} spots</span></summary>
  <div class="section-body">
    {#if session.fixed}<p class="hint">
        Unlock this session to edit its unknowns.
      </p>{/if}
    <div class="unknowns-wrap">
      <table class="unknowns-table" aria-label="Unknowns">
        <thead
          ><tr
            ><th>Name</th><th>Tag</th><th>From</th><th>To</th><th>Order</th></tr
          ></thead
        >
        <tbody>
          {#each session.unknowns as u, i (i)}
            <tr>
              {#each ['name', 'tag', 'from', 'to'] as key (key)}
                <td
                  ><input
                    aria-label={`Unknown ${i + 1} ${key}`}
                    type={key === 'from' || key === 'to' ? 'number' : 'text'}
                    min="1"
                    required={key !== 'tag'}
                    value={u[key as keyof Unknown]}
                    disabled={session.fixed}
                    onchange={(e) => sample(i, key as keyof Unknown, e)}
                  /></td
                >
              {/each}
              <td class="row-actions">
                <button
                  aria-label={`Move unknown ${i + 1} up`}
                  disabled={session.fixed || i === 0}
                  onclick={() => moveUnknown(i, -1)}>↑</button
                >
                <button
                  aria-label={`Move unknown ${i + 1} down`}
                  disabled={session.fixed || i === session.unknowns.length - 1}
                  onclick={() => moveUnknown(i, 1)}>↓</button
                >
                <button
                  aria-label={`Delete unknown ${i + 1}`}
                  disabled={session.fixed}
                  onclick={() =>
                    edit((p) => {
                      current(p).unknowns.splice(i, 1);
                    })}>×</button
                >
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    </div>
    <button
      disabled={session.fixed}
      onclick={() =>
        edit((p) => {
          const rows = current(p).unknowns;
          const from = Math.max(0, ...rows.map((r) => r.to)) + 1;
          rows.push({ name: 'Sample', tag: '', from, to: from });
        })}>Add unknown</button
    >
    <label class="paste-label"
      >Paste unknowns<textarea
        aria-label="Paste unknowns"
        rows="3"
        bind:value={paste}
        disabled={session.fixed}
        placeholder="SYN-H3 S 1-30&#10;SYN-H4 S 31-55"
      ></textarea></label
    >
    {#each parsed.errors as error (error.line)}<p class="error">
        Line {error.line}: {error.text} — {error.reason}
      </p>{/each}
    <button
      disabled={session.fixed ||
        !parsed.rows.length ||
        parsed.errors.length > 0}
      onclick={() => {
        edit((p) => {
          current(p).unknowns.push(...parsed.rows);
        });
        paste = '';
      }}>Add pasted unknowns</button
    >
    <p class="hint" data-testid="unknown-total">
      {total} unknowns in this session
    </p>
  </div>
</details>

<details
  open={!collapsed.includes('standards')}
  ontoggle={(e) => collapse('standards', !e.currentTarget.open)}
>
  <summary>Standards</summary>
  <div class="section-body">
    <p class="hint">
      Used spots include fixed sessions automatically. Spare spots stay unused.
    </p>
    {#each project.standards as s, i (i)}
      <div class="standard-card">
        <div class="standard-heading">
          <input
            aria-label={`Standard ${i + 1} name`}
            value={s.name}
            onchange={(e) =>
              edit((p) => {
                p.standards[i]!.name = value(e);
              })}
          />
          <select
            aria-label={`${s.name} role`}
            value={s.role}
            onchange={(e) =>
              edit((p) => {
                p.standards[i]!.role = value(e) as StandardRole;
              })}
          >
            <option value="primary">Primary</option><option value="secondary"
              >Secondary</option
            ><option value="reference">Reference</option>
          </select>
          <button
            aria-label={`Move standard ${s.name} up`}
            disabled={i === 0}
            onclick={() =>
              edit((p) => {
                [p.standards[i - 1], p.standards[i]] = [
                  p.standards[i]!,
                  p.standards[i - 1]!,
                ];
              })}>↑</button
          >
          <button
            aria-label={`Delete standard ${s.name}`}
            onclick={() =>
              edit((p) => {
                p.standards.splice(i, 1);
              })}>×</button
          >
        </div>
        <RangesInput
          label={`${s.name} ranges`}
          value={s.ranges
            .map((r) =>
              r.from === r.to ? String(r.from) : `${r.from}-${r.to}`,
            )
            .join(', ')}
          oncommit={(text) =>
            edit((p) => {
              p.standards[i]!.ranges = parseRanges(text).rows;
            })}
        />
        <RangesInput
          label={`${s.name} used`}
          used
          value={s.used.join(', ')}
          oncommit={(text) =>
            edit((p) => {
              p.standards[i]!.used = parseUsedSpots(text).rows;
            })}
        />
        {#each fixedUse as fixed (fixed.number)}
          {@const spots = fixed.used[s.name] ?? []}
          {#if spots.length}
            <p class="hint fixed-used">
              Session {fixed.number} ({fixed.source ? 'imported' : 'run'}):
              {spotRanges(spots)}
            </p>
          {/if}
        {/each}
        <div class="pool-stats">
          <label
            >Keep spare<input
              aria-label={`${s.name} spare`}
              type="number"
              required
              min="0"
              step="1"
              value={s.spare}
              onchange={(e) =>
                numeric(e, (p, n) => {
                  p.standards[i]!.spare = n;
                })}
            /></label
          >
          <span
            >Available<strong
              >{plan?.budget.perStandard[s.name]?.available ?? '—'}</strong
            ></span
          >
          <span
            >Needed<strong
              >{plan?.budget.perStandard[s.name]?.needed ?? '—'}</strong
            ></span
          >
          <span
            >Left after<strong
              >{plan?.budget.perStandard[s.name]?.leftAfter ?? '—'}</strong
            ></span
          >
        </div>
      </div>
    {/each}
    <button
      onclick={() =>
        edit((p) => {
          p.standards.push({
            name: `Standard ${p.standards.length + 1}`,
            role: 'secondary',
            ranges: [],
            used: [],
            spare: 0,
          });
        })}>Add standard</button
    >
  </div>
</details>

<details
  open={!collapsed.includes('recipe')}
  ontoggle={(e) => collapse('recipe', !e.currentTarget.open)}
>
  <summary>Recipe</summary>
  <div class="section-body form-grid">
    {#if plan}
      <p class="budget span-2" data-testid="budget">
        {plan.budget.K} brackets for {planned.length} sessions ({planned
          .map((s) => s.chunks.length)
          .join(' + ') || '0'}), {plan.budget.P} secondary pairs, {doubled} doubled{#each project.standards.filter((s) => s.role === 'primary') as s, i (i)};
          {s.name}
          {plan.budget.perStandard[s.name]?.leftAfter ?? '—'} left{/each}
      </p>
    {/if}
    <label class="span-2"
      >Chunking<select
        aria-label="Chunking"
        value={project.recipe.chunking.mode}
        onchange={(e) =>
          edit((p) => {
            const mode = value(e);
            p.recipe.chunking =
              mode === 'size'
                ? { mode, size: 18 }
                : mode === 'count'
                  ? { mode, count: 10 }
                  : { mode: 'budget' };
          })}
      >
        <option value="budget">Auto from budget</option><option value="size"
          >Chunk target</option
        ><option value="count">Chunk count</option>
      </select></label
    >
    {#if project.recipe.chunking.mode === 'size'}
      <label class="span-2"
        >Unknowns per chunk<input
          type="number"
          required
          min="1"
          step="1"
          value={project.recipe.chunking.size}
          onchange={(e) =>
            numeric(e, (p, n) => {
              p.recipe.chunking = { mode: 'size', size: n };
            })}
        /></label
      >
    {:else if project.recipe.chunking.mode === 'count'}
      <label class="span-2"
        >Chunks per session<input
          type="number"
          required
          min="1"
          step="1"
          value={project.recipe.chunking.count}
          onchange={(e) =>
            numeric(e, (p, n) => {
              p.recipe.chunking = { mode: 'count', count: n };
            })}
        /></label
      >
    {/if}
    {#if project.recipe.chunking.mode === 'budget'}
      <label class="span-2"
        >Max pairs per bracket<input
          type="number"
          required
          min="1"
          step="1"
          value={project.recipe.maxPairsPerBracket}
          onchange={(e) =>
            numeric(e, (p, n) => {
              p.recipe.maxPairsPerBracket = n;
            })}
        /></label
      >
    {:else}
      <label class="span-2"
        >Pairs per bracket<input
          type="number"
          required
          min="0"
          step="1"
          value={project.recipe.secondaryPairsPerBracket}
          onchange={(e) =>
            numeric(e, (p, n) => {
              p.recipe.secondaryPairsPerBracket = n;
            })}
        /></label
      >
    {/if}
    <label
      >Spots per secondary<input
        type="number"
        required
        min="1"
        step="1"
        value={project.recipe.spotsPerSecondary}
        onchange={(e) =>
          numeric(e, (p, n) => {
            p.recipe.spotsPerSecondary = n;
          })}
      /></label
    >
    <label
      >Primary per bracket<input
        type="number"
        required
        min="1"
        step="1"
        value={project.recipe.primaryPerBracket}
        onchange={(e) =>
          numeric(e, (p, n) => {
            p.recipe.primaryPerBracket = n;
          })}
      /></label
    >
    <label class="check span-2"
      ><input
        type="checkbox"
        checked={project.recipe.bracketAtSampleBoundaries}
        onchange={(e) =>
          edit((p) => {
            p.recipe.bracketAtSampleBoundaries = e.currentTarget.checked;
          })}
      />Bracket at sample boundaries</label
    >
    <label class="span-2"
      >Rotation start<select
        aria-label="Rotation start"
        value={project.recipe.rotationStart}
        onchange={(e) =>
          edit((p) => {
            p.recipe.rotationStart = Number(value(e));
          })}
      >
        {#each secondaries as s, i (i)}<option value={i}>{s.name}</option
          >{/each}
      </select></label
    >
    {#each ['opening', 'mid', 'closing'] as block (block)}
      {@const key = block as 'opening' | 'mid' | 'closing'}
      <fieldset class="span-2 block-list">
        <legend>{block[0]!.toUpperCase() + block.slice(1)} block</legend>
        {#each project.recipe[key] as entry, i (i)}
          <div class="block-entry">
            <select
              aria-label={`${block} standard ${i + 1}`}
              value={entry.standard}
              onchange={(e) =>
                edit((p) => {
                  p.recipe[key][i]!.standard = value(e);
                })}
            >
              <option value="@primary">Primary</option
              >{#each project.standards as s, j (j)}<option value={s.name}
                  >{s.name}</option
                >{/each}
            </select>
            <span>×</span><input
              aria-label={`${block} count ${i + 1}`}
              type="number"
              required
              min="0"
              step="1"
              value={entry.count}
              onchange={(e) =>
                numeric(e, (p, n) => {
                  p.recipe[key][i]!.count = n;
                })}
            />
            <button
              aria-label={`Remove ${block} entry ${i + 1}`}
              onclick={() =>
                edit((p) => {
                  p.recipe[key].splice(i, 1);
                })}>×</button
            >
          </div>
        {/each}
        <button
          onclick={() =>
            edit((p) => {
              p.recipe[key].push({ standard: '@primary', count: 2 });
            })}>Add entry</button
        >
      </fieldset>
    {/each}
    {#if plan}
      {#each plan.advisories as advisory (advisory)}<p class="error span-2">
          {advisory}
        </p>{/each}
    {/if}
  </div>
</details>
