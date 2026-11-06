<script lang="ts">
  import { minerals, roles, type Entry } from './catalogue';
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
  } = $props();
  const groupNames = {
    primary: 'Primary',
    secondary: 'Secondaries',
    reference: 'Reference glasses',
  };
  let additions = $state({ primary: '', secondary: '', reference: '' });
  const desktop =
    typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  function update(index: number, patch: Partial<Entry>) {
    change(
      entries.map((entry, i) => ({
        ...entry,
        ...(i === index ? patch : {}),
        ...((patch.checked ||
          (patch.role === 'primary' && entries[index]?.checked)) &&
        (patch.role ?? entries[index]?.role) === 'primary' &&
        entry.role === 'primary' &&
        i !== index
          ? { checked: false }
          : {}),
      })),
    );
  }
  function nameProblem(index: number): string {
    const entry = entries[index]!;
    if (!entry.checked) return '';
    const name = entry.name.trim();
    if (!name) return 'Add a name';
    if (name === '@primary') return 'Choose a name other than @primary';
    if (
      entries.some((e, i) => i !== index && e.checked && e.name.trim() === name)
    )
      return `Two standards are called ${name}`;
    return '';
  }
  function move(index: number, direction: number) {
    const group = entries
      .map((e, i) => ({ ...e, index: i }))
      .filter((e) => e.role === entries[index]!.role);
    const target =
      group[group.findIndex((e) => e.index === index) + direction]?.index;
    if (target === undefined) return;
    const next = entries.map((e) => ({ ...e }));
    [next[index], next[target]] = [next[target]!, next[index]!];
    change(next);
  }
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
      <div class="catalogue-groups">
        {#each roles as role (role)}
          <section class="catalogue-group" aria-label={groupNames[role]}>
            <h3>{groupNames[role]}</h3>
            {#each entries
              .map((entry, index) => ({ ...entry, index }))
              .filter((e) => e.role === role) as entry, groupIndex (entry.index)}
              <div class="catalogue-entry">
                <div class="catalogue-name">
                  <input
                    type={role === 'primary' ? 'radio' : 'checkbox'}
                    name={role === 'primary' ? 'primary-standard' : undefined}
                    aria-label={`Use ${entry.name}`}
                    checked={entry.checked}
                    onchange={(e) =>
                      update(entry.index, { checked: e.currentTarget.checked })}
                  />
                  {#if role === 'secondary' && entry.checked}<span
                      class="rotation-number"
                      aria-label="Rotation number"
                      >{entries.filter(
                        (e, i) =>
                          i <= entry.index &&
                          e.role === 'secondary' &&
                          e.checked,
                      ).length}</span
                    >{/if}
                  <input
                    aria-label={`Rename ${entry.name}`}
                    aria-invalid={!!nameProblem(entry.index)}
                    class:invalid={!!nameProblem(entry.index)}
                    value={entry.name}
                    oninput={(e) =>
                      update(entry.index, { name: e.currentTarget.value })}
                  />
                </div>
                <div class="catalogue-tools">
                  <select
                    aria-label={`${entry.name} group`}
                    value={role}
                    onchange={(e) =>
                      update(entry.index, {
                        role: e.currentTarget.value as Entry['role'],
                      })}
                  >
                    {#each roles as r (r)}<option value={r}
                        >{r === 'primary'
                          ? 'Primary'
                          : r === 'secondary'
                            ? 'Secondary'
                            : 'Reference'}</option
                      >{/each}
                  </select>
                  <button
                    aria-label={`Move ${entry.name} up`}
                    disabled={groupIndex === 0}
                    onclick={() => move(entry.index, -1)}>↑</button
                  >
                  <button
                    aria-label={`Move ${entry.name} down`}
                    disabled={groupIndex ===
                      entries.filter((e) => e.role === role).length - 1}
                    onclick={() => move(entry.index, 1)}>↓</button
                  >
                  <button
                    aria-label={`Remove ${entry.name}`}
                    onclick={() =>
                      change(entries.filter((_, i) => i !== entry.index))}
                    >×</button
                  >
                </div>
                {#if nameProblem(entry.index)}<small
                    class="error catalogue-error"
                    >{nameProblem(entry.index)}</small
                  >{/if}
              </div>
            {/each}
            <form
              class="add-standard"
              onsubmit={(e) => {
                e.preventDefault();
                const name = additions[role].trim();
                if (!name) return;
                change([
                  ...entries,
                  {
                    name,
                    role,
                    checked:
                      role !== 'primary' ||
                      !entries.some((e) => e.role === 'primary' && e.checked),
                  },
                ]);
                additions[role] = '';
              }}
            >
              <input
                aria-label={`Add ${groupNames[role].toLowerCase()} standard`}
                placeholder="Add standard"
                bind:value={additions[role]}
              />
              <button
                aria-label={`Add to ${groupNames[role].toLowerCase()}`}
                disabled={!additions[role].trim()}>Add</button
              >
            </form>
          </section>
        {/each}
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
      Today's three-session zircon experiment, ready to generate.
    </p>
  </aside>
</section>
