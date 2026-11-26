<script lang="ts">
  import CommitInput from './CommitInput.svelte';
  import StandardSpots from './StandardSpots.svelte';
  import SegmentedControl from './SegmentedControl.svelte';
  import StatusChip from './StatusChip.svelte';
  import MetaChip from './MetaChip.svelte';
  import IconButton from './IconButton.svelte';
  import { countText } from '../text';
  import type { ProjectPlan } from '../engine/sequence';
  import type { Project } from '../engine/types';
  import { compactChunks, bracketingSummary } from './review';

  let {
    project,
    plan,
    planError,
    edit,
    resetRecipe,
  }: {
    project: Project;
    plan: ProjectPlan | null;
    planError: string;
    edit: (change: (p: Project) => void) => void;
    resetRecipe: () => void;
  } = $props();
  const secondaries = $derived(
    project.standards.filter((s) => s.role === 'secondary'),
  );
  const sessionCount = $derived(
    project.sessions.filter((s) => !s.fixed && s.unknowns.length).length,
  );
  function value(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
</script>

<div class="bracketing-panels">
  <section class="recipe-panel" aria-label="Recipe" data-testid="recipe-scroll">
    <div class="panel-heading">
      <h2>Recipe</h2>
      <IconButton icon="refresh" label="Reset recipe" onclick={resetRecipe} />
    </div>
    <div class="section-body form-grid">
      <div class="span-2 mode-field">
        <span class="field-label">Chunking</span><SegmentedControl
          label="Chunking"
          wrap
          size="small"
          value={project.recipe.chunking.mode}
          onchange={(mode) =>
            edit((p) => {
              if (mode === 'budget') {
                delete p.recipe.secondaries;
                delete p.recipe.openingBracket;
              }
              p.recipe.chunking =
                mode === 'size'
                  ? { mode, size: 18 }
                  : mode === 'count'
                    ? { mode, count: 10 }
                    : { mode: 'budget' };
            })}
          options={[
            { value: 'budget', label: 'Auto from budget' },
            { value: 'size', label: 'Chunk target' },
            { value: 'count', label: 'Chunk count' },
          ]}
        />
      </div>
      <div class="span-2 mode-field">
        <span class="field-label">Secondaries</span><SegmentedControl
          label="Secondaries"
          wrap
          size="small"
          value={project.recipe.secondaries ?? 'rotate'}
          disabled={project.recipe.chunking.mode === 'budget'}
          onchange={(selected) => {
            const value = selected as 'rotate' | 'cadence';
            edit((p) => {
              p.recipe.secondaries = value;
            });
          }}
          options={[
            { value: 'rotate', label: 'Rotate pairs' },
            { value: 'cadence', label: 'Every, odd or even' },
          ]}
        />
      </div>
      <label class="check span-2"
        ><input
          type="checkbox"
          aria-label="Opening bracket"
          checked={project.recipe.openingBracket ?? false}
          disabled={project.recipe.chunking.mode === 'budget'}
          onchange={(e) => {
            const checked = e.currentTarget.checked;
            edit((p) => {
              p.recipe.openingBracket = checked;
            });
          }}
        />
        Opening bracket (primary and secondaries after the opening block)</label
      >
      {#if project.recipe.chunking.mode === 'budget'}<p class="hint span-2">
          Every, odd or even secondaries and the opening bracket need Chunk
          target or Chunk count.
        </p>{/if}
      {#if project.recipe.chunking.mode === 'size'}
        <label class="span-2"
          >Unknowns per chunk<CommitInput
            label="Unknowns per chunk"
            min={1}
            step="1"
            value={project.recipe.chunking.size}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.recipe.chunking = { mode: 'size', size: n };
              })}
          /></label
        >
      {:else if project.recipe.chunking.mode === 'count'}
        <label class="span-2"
          >Chunks per session<CommitInput
            label="Chunks per session"
            min={1}
            step="1"
            value={project.recipe.chunking.count}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.recipe.chunking = { mode: 'count', count: n };
              })}
          /></label
        >
      {/if}
      {#if project.recipe.chunking.mode === 'budget'}
        <label class="span-2"
          >Max pairs per bracket<CommitInput
            label="Max pairs per bracket"
            min={1}
            step="1"
            value={project.recipe.maxPairsPerBracket}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.recipe.maxPairsPerBracket = n;
              })}
          /></label
        >
      {:else if project.recipe.secondaries !== 'cadence'}
        <label class="span-2"
          >Pairs per bracket<CommitInput
            label="Pairs per bracket"
            min={0}
            step="1"
            value={project.recipe.secondaryPairsPerBracket}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.recipe.secondaryPairsPerBracket = n;
              })}
          /></label
        >
      {/if}
      <label
        >Spots per secondary<CommitInput
          label="Spots per secondary"
          min={1}
          step="1"
          value={project.recipe.spotsPerSecondary}
          commit={(value) =>
            edit((p) => {
              const n = Number(value);
              p.recipe.spotsPerSecondary = n;
            })}
        /></label
      >
      <label
        >Primary per bracket<CommitInput
          label="Primary per bracket"
          min={1}
          step="1"
          value={project.recipe.primaryPerBracket}
          commit={(value) =>
            edit((p) => {
              const n = Number(value);
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
      {#if project.recipe.secondaries !== 'cadence'}
        {#each [...new Set(project.standards
              .filter((s) => s.role !== 'reference')
              .map((s) => s.mineral ?? project.wizard?.mineral ?? ''))] as group (group)}
          {@const main = group === (project.wizard?.mineral ?? '')}
          <label class="span-2"
            >Rotation start{main ? '' : ` (${group})`}<select
              aria-label={main ? 'Rotation start' : `${group} rotation start`}
              value={main
                ? project.recipe.rotationStart
                : (project.recipe.rotationStarts?.[group] ?? 0)}
              onchange={(e) => {
                const index = Number(e.currentTarget.value);
                edit((p) => {
                  if (main) p.recipe.rotationStart = index;
                  else
                    p.recipe.rotationStarts = {
                      ...p.recipe.rotationStarts,
                      [group]: index,
                    };
                });
              }}
            >
              {#each secondaries.filter((s) => (s.mineral ?? project.wizard?.mineral ?? '') === group) as standard, i (i)}<option
                  value={i}>{standard.name}</option
                >{/each}
            </select></label
          >
        {/each}
      {/if}
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
              <span>×</span><CommitInput
                label={`${block} count ${i + 1}`}
                min={0}
                step="1"
                value={entry.count}
                commit={(value) =>
                  edit((p) => {
                    const n = Number(value);
                    p.recipe[key][i]!.count = n;
                  })}
              />
              <IconButton
                icon="close"
                size="small"
                label={`Remove ${block} entry ${i + 1}`}
                onclick={() =>
                  edit((p) => {
                    p.recipe[key].splice(i, 1);
                  })}
              />
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
    </div>
    <details class="sheet-columns">
      <summary>Sheet columns</summary>
      <div class="section-body form-grid">
        <p class="hint span-2">Column defaults for generated rows</p>
        <label
          >Duration [s]<CommitInput
            label="Duration [s]"
            step="any"
            value={project.experiment.defaults['Duration [s]']}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.experiment.defaults['Duration [s]'] = n;
              })}
          /></label
        >
        <label
          >Laser output [%]<CommitInput
            label="Laser output [%]"
            step="any"
            value={project.experiment.defaults['Laser Output Setting [%]']}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.experiment.defaults['Laser Output Setting [%]'] = n;
              })}
          /></label
        >
        <label
          >Sample type<CommitInput
            label="Sample type"
            type="text"
            value={project.experiment.defaults['Sample Type']}
            commit={(value) =>
              edit((p) => {
                p.experiment.defaults['Sample Type'] = value;
              })}
          /></label
        >
        <label
          >Dilution<CommitInput
            label="Dilution"
            step="any"
            value={project.experiment.defaults['Dilution Factor']}
            commit={(value) =>
              edit((p) => {
                const n = Number(value);
                p.experiment.defaults['Dilution Factor'] = n;
              })}
          /></label
        >
        <label class="span-2"
          >Comment<CommitInput
            label="Comment"
            type="text"
            value={project.experiment.defaults.Comment}
            commit={(value) =>
              edit((p) => {
                p.experiment.defaults.Comment = value;
              })}
          /></label
        >
        <label class="span-2"
          >Identifier<CommitInput
            label="Identifier"
            type="text"
            value={project.experiment.defaults.Identifier}
            commit={(value) =>
              edit((p) => {
                p.experiment.defaults.Identifier = value;
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
  </section>
  <section
    class="plan-summary"
    aria-label="Live summary"
    data-testid="plan-summary"
  >
    <h2>Live summary</h2>
    <p><MetaChip text={`${countText(sessionCount, 'session')} planned`} /></p>
    {#if planError}<p class="error" role="alert">
        <StatusChip tone="warning" text={planError} />
      </p>{/if}
    {#if plan}
      <p class="budget" data-testid="budget">
        {bracketingSummary(project, plan)}
      </p>
    {/if}
    {#each project.sessions as session (session.number)}
      {#if session.fixed}
        <p>
          Session {session.number}, {session.source ? 'imported' : 'run'}, {countText(
            session.rows.length,
            'row',
          )}, read-only
        </p>
      {:else}
        {@const generated = plan?.sessions.find(
          (s) => s.number === session.number,
        )}
        <div
          class="session-plan"
          data-testid={`session-plan-${session.number}`}
        >
          <h3>Session {session.number}</h3>
          {#if generated?.chunks.length}
            <p>Chunks: {compactChunks(generated.chunks)}</p>
            <p>
              <MetaChip
                text={`${countText(
                  generated.chunks.length +
                    (project.recipe.openingBracket ? 1 : 0),
                  'bracket',
                )} · Mid block: ${
                  generated.chunks.length < 2 ||
                  !project.recipe.mid.some((entry) => entry.count > 0)
                    ? 'none'
                    : `bracket ${Math.floor((generated.chunks.length + 1) / 2)}`
                }`}
              />
            </p>
          {:else}<p>No unknowns to plan</p>{/if}
        </div>
      {/if}
    {/each}
    <StandardSpots {project} {edit} />
    {#if plan}
      {#each plan.advisories as advisory (advisory)}<p class="error">
          <StatusChip tone="warning" text={advisory} />
        </p>{/each}
      {#each plan.sessions as session (session.number)}
        {#each session.warnings as warning, i (i)}<p class="error">
            <StatusChip
              tone="warning"
              text={`Session ${session.number}: ${warning.message}`}
            />
          </p>{/each}
      {/each}
    {/if}
  </section>
</div>
