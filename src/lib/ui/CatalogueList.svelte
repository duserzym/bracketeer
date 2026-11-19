<script lang="ts">
  import { roles, type Entry } from './catalogue';
  import CommitInput from './CommitInput.svelte';
  let {
    entries,
    change,
    id,
    extra = false,
  }: {
    entries: Entry[];
    change: (entries: Entry[]) => void;
    id: string;
    extra?: boolean;
  } = $props();
  const groupNames = {
    primary: 'Primary',
    secondary: 'Secondaries',
    reference: 'Reference glasses',
  };
  let additions = $state({ primary: '', secondary: '', reference: '' });
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
</script>

<div class="catalogue-groups">
  {#each roles.filter((r) => !extra || r !== 'reference') as role (role)}
    <section class="catalogue-group" aria-label={groupNames[role]}>
      <h3>{groupNames[role]}</h3>
      {#each entries
        .map((entry, index) => ({ ...entry, index }))
        .filter((e) => e.role === role) as entry, groupIndex (entry.index)}
        <div class="catalogue-entry">
          <div class="catalogue-name">
            <input
              type={role === 'primary' ? 'radio' : 'checkbox'}
              name={role === 'primary' ? `primary-standard-${id}` : undefined}
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
                    i <= entry.index && e.role === 'secondary' && e.checked,
                ).length}</span
              >{/if}
            <CommitInput
              type="text"
              label={`Rename ${entry.name}`}
              value={entry.name}
              invalid={!!nameProblem(entry.index)}
              commit={(value) => update(entry.index, { name: value })}
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
              {#each roles.filter((r) => !extra || r !== 'reference') as r (r)}<option
                  value={r}
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
                change(entries.filter((_, i) => i !== entry.index))}>×</button
            >
          </div>
          {#if nameProblem(entry.index)}<small class="error catalogue-error"
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
