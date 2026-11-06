<script lang="ts">
  import type { ProjectPlan } from '../engine/sequence';
  import type { Project } from '../engine/types';
  import { compactChunks, doubledBrackets } from './review';

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
  const planned = $derived(
    plan?.sessions.filter((s) => !s.fixed && s.chunks.length) ?? [],
  );
  function value(event: Event) {
    return (event.currentTarget as HTMLInputElement).value;
  }
  function numeric(event: Event, apply: (p: Project, n: number) => void) {
    const input = event.currentTarget as HTMLInputElement;
    if (
      !input.checkValidity() ||
      !input.value.trim() ||
      !Number.isFinite(input.valueAsNumber)
    )
      return;
    edit((p) => apply(p, input.valueAsNumber));
  }
</script>

<div class="bracketing-panels">
  <section class="recipe-panel" aria-label="Recipe" data-testid="recipe-scroll">
    <div class="panel-heading">
      <h2>Recipe</h2>
      <button onclick={resetRecipe}>Reset recipe</button>
    </div>
    <div class="section-body form-grid">
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
            aria-label="Unknowns per chunk"
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
            aria-label="Chunks per session"
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
            aria-label="Max pairs per bracket"
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
            aria-label="Pairs per bracket"
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
          aria-label="Spots per secondary"
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
          aria-label="Primary per bracket"
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
      <fieldset class="span-2 block-list">
        <legend>Keep spare</legend>
        <div class="form-grid">
          {#each project.standards as standard, i (i)}
            <label
              >{standard.name}<input
                aria-label={`${standard.name} keep spare`}
                type="number"
                required
                min="0"
                step="1"
                value={standard.spare}
                onchange={(e) =>
                  numeric(e, (p, n) => {
                    p.standards[i]!.spare = n;
                  })}
              /></label
            >
          {/each}
        </div>
      </fieldset>
    </div>
    <details class="sheet-columns">
      <summary>Sheet columns</summary>
      <div class="section-body form-grid">
        <p class="hint span-2">Column defaults for generated rows</p>
        <label
          >Duration [s]<input
            aria-label="Duration [s]"
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
            aria-label="Laser output [%]"
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
            aria-label="Dilution"
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
  </section>
  <section
    class="plan-summary"
    aria-label="Live summary"
    data-testid="plan-summary"
  >
    <h2>Live summary</h2>
    <p>
      {project.sessions.filter((s) => !s.fixed && s.unknowns.length).length} sessions
      planned
    </p>
    {#if planError}<p class="error" role="alert">{planError}</p>{/if}
    {#if plan}
      <p class="budget" data-testid="budget">
        {plan.budget.K} brackets for {planned.length} sessions ({planned
          .map((s) => s.chunks.length)
          .join(' + ') || '0'}), {plan.budget.P} secondary pairs. Doubled brackets:
        {doubledBrackets(plan).join(', ') || 'none'}.
      </p>
    {/if}
    {#each project.sessions as session (session.number)}
      {#if session.fixed}
        <p>
          Session {session.number}, {session.source ? 'imported' : 'run'}, {session
            .rows.length} rows, read-only
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
              {generated.chunks.length} brackets · Mid block: {generated.chunks
                .length < 2 ||
              !project.recipe.mid.some((entry) => entry.count > 0)
                ? 'none'
                : `bracket ${Math.floor((generated.chunks.length + 1) / 2)}`}
            </p>
          {:else}<p>No unknowns to plan</p>{/if}
        </div>
      {/if}
    {/each}
    <table class="budget-table" aria-label="Standard budget">
      <thead
        ><tr
          ><th>Standard</th><th>Available</th><th>Needed</th><th>Left after</th
          ></tr
        ></thead
      >
      <tbody
        >{#each project.standards as standard (standard.name)}
          {@const budget = plan?.budget.perStandard[standard.name]}
          <tr
            ><th scope="row">{standard.name}</th><td
              >{budget?.available ?? '—'}</td
            ><td>{budget?.needed ?? '—'}</td><td
              class:error={budget && budget.leftAfter < 0}
              >{budget?.leftAfter ?? '—'}</td
            ></tr
          >
        {/each}</tbody
      >
    </table>
    {#if plan}
      {#each plan.advisories as advisory (advisory)}<p class="error">
          {advisory}
        </p>{/each}
      {#each plan.sessions as session (session.number)}
        {#each session.warnings as warning, i (i)}<p class="error">
            Session {session.number}: {warning.message}
          </p>{/each}
      {/each}
    {/if}
  </section>
</div>
