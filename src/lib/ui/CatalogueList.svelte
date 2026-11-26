<script lang="ts">
  import StatusChip from './StatusChip.svelte';
  import { onDestroy, tick, untrack } from 'svelte';
  import { applyDrop, roles, type Entry } from './catalogue';
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
  type Role = Entry['role'];
  type Target = { role: Role; position: number };
  const groupNames = {
    primary: 'Primary',
    secondary: 'Secondaries',
    reference: 'Reference glasses',
  };
  const groups = $derived(roles.filter((r) => !extra || r !== 'reference'));
  let root: HTMLDivElement;
  let additions = $state({ primary: '', secondary: '', reference: '' });
  let announcement = $state('');
  let drag = $state<{
    from: number;
    source: Entry;
    keyboard: boolean;
    active: boolean;
    x: number;
    y: number;
    startX: number;
    startY: number;
    pointerId: number;
  } | null>(null);
  let target = $state<Target | null>(null);
  let originalEntries: Entry[] | undefined;
  $effect(() => {
    const current = entries;
    untrack(() => {
      if (drag && current !== originalEntries) cancel();
    });
  });
  let capture: HTMLButtonElement | undefined;
  let frame = 0;
  let menu = $state<number | null>(null);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuButton: HTMLButtonElement | undefined;
  const menuId = $derived(`move-standard-${id}`);
  let menuNode = $state<HTMLDivElement>();
  // Escape the scrolling panel's clipping and backdrop-filter containing block.
  function portal(node: HTMLElement) {
    document.body.append(node);
    return { destroy: () => node.remove() };
  }

  function inGroup(role: Role, withoutSource = false) {
    return entries
      .map((entry, index) => ({ ...entry, index }))
      .filter(
        (e) => e.role === role && (!withoutSource || e.index !== drag?.from),
      );
  }
  function update(index: number, patch: Partial<Entry>) {
    change(
      entries.map((entry, i) => ({
        ...entry,
        ...(i === index ? patch : {}),
        ...(patch.checked &&
        entries[index]?.role === 'primary' &&
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
  async function focusRow(role: Role, position: number, selector: string) {
    await tick();
    root
      .querySelectorAll<HTMLElement>(`[data-role="${role}"] .catalogue-entry`)
      [position]?.querySelector<HTMLButtonElement>(selector)
      ?.focus();
  }
  function drop(from: number, destination: Target, selector = '.drag-handle') {
    const next = applyDrop(
      entries,
      from,
      destination.role,
      destination.position,
    );
    // A click or an unchanged drop must not consume an Undo step.
    if (JSON.stringify(next) !== JSON.stringify(entries)) change(next);
    void focusRow(destination.role, destination.position, selector);
  }
  function move(index: number, direction: number) {
    const role = entries[index]!.role;
    const position =
      inGroup(role).findIndex((e) => e.index === index) + direction;
    const other = inGroup(role)[position]?.index;
    if (other === undefined) return;
    const next = entries.slice();
    [next[index], next[other]] = [next[other]!, next[index]!];
    change(next);
    void focusRow(role, position, '.drag-handle');
  }
  function announce(destination: Target) {
    if (!drag) return;
    announcement = `${drag.source.name}, ${groupNames[destination.role]}, position ${destination.position + 1} of ${inGroup(destination.role, true).length + 1}`;
  }
  function locate(x: number, y: number) {
    // Hit-testing the DOM (rather than captured event.target) keeps mineral lists isolated.
    const group = document
      .elementFromPoint(x, y)
      ?.closest<HTMLElement>('[data-role]');
    if (!group || group.closest('.catalogue-groups') !== root) {
      target = null;
      return;
    }
    const role = group.dataset.role as Role;
    const rows = [
      ...group.querySelectorAll<HTMLElement>('.catalogue-entry'),
    ].filter((row) => Number(row.dataset.index) !== drag?.from);
    const position = rows.findIndex((row) => {
      const rect = row.getBoundingClientRect();
      return y < rect.top + rect.height / 2;
    });
    const next = { role, position: position < 0 ? rows.length : position };
    if (target?.role !== next.role || target.position !== next.position)
      announce(next);
    target = next;
  }
  function autoScroll() {
    if (!drag || drag.keyboard || !drag.active) return;
    const panel = root.closest<HTMLElement>('.welcome-main');
    if (panel) {
      const rect = panel.getBoundingClientRect();
      if (
        drag.x >= rect.left &&
        drag.x <= rect.right &&
        drag.y >= rect.top &&
        drag.y <= rect.bottom
      ) {
        const edge = 48;
        const speed =
          drag.y < rect.top + edge
            ? -Math.ceil((rect.top + edge - drag.y) / 4)
            : drag.y > rect.bottom - edge
              ? Math.ceil((drag.y - rect.bottom + edge) / 4)
              : 0;
        if (speed) {
          panel.scrollTop += speed;
          locate(drag.x, drag.y);
        }
      }
    }
    frame = requestAnimationFrame(autoScroll);
  }
  function pointerDown(event: PointerEvent, from: number) {
    if (event.button !== 0 || !event.isPrimary || drag) return;
    closeMenu(false);
    const button = event.currentTarget as HTMLButtonElement;
    button.focus();
    button.setPointerCapture(event.pointerId);
    capture = button;
    originalEntries = entries;
    drag = {
      from,
      source: entries[from]!,
      keyboard: false,
      active: false,
      x: event.clientX,
      y: event.clientY,
      startX: event.clientX,
      startY: event.clientY,
      pointerId: event.pointerId,
    };
    event.preventDefault();
  }
  function pointerMove(event: PointerEvent) {
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    if (
      event.clientX < 0 ||
      event.clientY < 0 ||
      event.clientX >= window.innerWidth ||
      event.clientY >= window.innerHeight
    ) {
      cancel();
      return;
    }
    drag.x = event.clientX;
    drag.y = event.clientY;
    if (
      !drag.active &&
      Math.hypot(drag.x - drag.startX, drag.y - drag.startY) >= 5
    ) {
      drag.active = true;
      frame = requestAnimationFrame(autoScroll);
    }
    if (drag.active) {
      event.preventDefault();
      locate(drag.x, drag.y);
    }
  }
  function clearDrag() {
    cancelAnimationFrame(frame);
    const pointerId = drag?.pointerId;
    drag = null;
    target = null;
    if (pointerId !== undefined && capture?.hasPointerCapture(pointerId))
      capture.releasePointerCapture(pointerId);
    capture = undefined;
  }
  function cancel() {
    if (!drag) return;
    announcement = `${drag.source.name}, move cancelled`;
    clearDrag();
  }
  function finish() {
    if (!drag) return;
    const from = drag.from;
    const destination = target;
    const active = drag.active;
    clearDrag();
    if (active && destination) {
      announcement = `${entries[from]!.name}, dropped in ${groupNames[destination.role]}, position ${destination.position + 1}`;
      drop(from, destination);
    }
  }
  function pointerUp(event: PointerEvent) {
    if (!drag || drag.keyboard || drag.pointerId !== event.pointerId) return;
    if (drag.active) locate(event.clientX, event.clientY);
    finish();
  }
  function handleKey(event: KeyboardEvent, from: number) {
    if (event.key === 'Tab') {
      if (drag?.keyboard) cancel();
      return;
    }
    if (![' ', 'Enter', 'ArrowUp', 'ArrowDown', 'Escape'].includes(event.key))
      return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape') {
      cancel();
      return;
    }
    if (event.key === ' ' || event.key === 'Enter') {
      if (drag?.keyboard) finish();
      else if (!drag) {
        closeMenu(false);
        originalEntries = entries;
        drag = {
          from,
          source: entries[from]!,
          keyboard: true,
          active: true,
          x: 0,
          y: 0,
          startX: 0,
          startY: 0,
          pointerId: -1,
        };
        target = {
          role: entries[from]!.role,
          position: inGroup(entries[from]!.role).findIndex(
            (e) => e.index === from,
          ),
        };
        announce(target);
      }
      return;
    }
    if (!drag?.keyboard || !target) return;
    const slots = groups.flatMap((role) =>
      Array.from({ length: inGroup(role, true).length + 1 }, (_, position) => ({
        role,
        position,
      })),
    );
    const current = slots.findIndex(
      (slot) =>
        slot.role === target!.role && slot.position === target!.position,
    );
    target =
      slots[
        Math.max(
          0,
          Math.min(
            slots.length - 1,
            current + (event.key === 'ArrowDown' ? 1 : -1),
          ),
        )
      ]!;
    announce(target);
    const role = target.role;
    void tick().then(() =>
      root
        .querySelector<HTMLElement>(`[data-role="${role}"] .drop-indicator`)
        ?.scrollIntoView({ block: 'nearest' }),
    );
  }
  async function openMenu(
    event: MouseEvent | KeyboardEvent,
    index: number,
    last = false,
  ) {
    if (menu === index) {
      closeMenu();
      return;
    }
    cancel();
    menuButton = event.currentTarget as HTMLButtonElement;
    const rect = menuButton.getBoundingClientRect();
    menuX = Math.max(8, Math.min(rect.left, window.innerWidth - 180));
    menuY = Math.min(rect.bottom + 4, window.innerHeight - 100);
    menu = index;
    await tick();
    const items =
      menuNode?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [];
    items[last ? items.length - 1 : 0]?.focus();
  }
  function closeMenu(returnFocus = true) {
    if (menu === null) return;
    menu = null;
    if (returnFocus) menuButton?.focus();
  }
  function menuKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      closeMenu();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [
        ...(menuNode?.querySelectorAll<HTMLButtonElement>(
          '[role="menuitem"]',
        ) ?? []),
      ];
      const current = items.indexOf(
        document.activeElement as HTMLButtonElement,
      );
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? items.length - 1
            : (current + (event.key === 'ArrowDown' ? 1 : -1) + items.length) %
              items.length;
      items[next]?.focus();
    } else if (event.key === 'Tab') closeMenu();
  }
  onDestroy(() => {
    clearDrag();
  });
</script>

<svelte:window
  onpointermove={pointerMove}
  onpointerup={pointerUp}
  onpointercancel={cancel}
  onblur={() => {
    cancel();
    closeMenu(false);
  }}
  onpointerout={(event) => {
    if (!event.relatedTarget && drag && !drag.keyboard) cancel();
  }}
  onkeydown={(event) => {
    if (event.key === 'Escape' && drag) {
      event.preventDefault();
      event.stopPropagation();
      cancel();
    }
  }}
  onpointerdown={(event) => {
    if (
      menu !== null &&
      !(event.target as Element).closest('.move-menu-wrap, .catalogue-menu')
    )
      closeMenu(false);
  }}
/>

<div class="catalogue-groups" data-catalogue={id} bind:this={root}>
  <span class="sr-only" aria-live="polite" aria-atomic="true"
    >{announcement}</span
  >
  {#each groups as role (role)}
    <section
      class="catalogue-group"
      aria-label={groupNames[role]}
      data-role={role}
    >
      <h3>{groupNames[role]}</h3>
      {#each inGroup(role) as entry, groupIndex (entry.index)}
        {#if drag?.active && target?.role === role && entry.index !== drag.from && inGroup(role, true).findIndex((e) => e.index === entry.index) === target.position}
          <div class="drop-indicator" aria-hidden="true"></div>
        {/if}
        <div
          class="catalogue-entry"
          class:drag-source={drag?.active && drag.from === entry.index}
          data-index={entry.index}
        >
          <div class="catalogue-name">
            <button
              class="drag-handle"
              aria-label={`Drag ${entry.name}`}
              aria-describedby={`drag-help-${id}`}
              onpointerdown={(e) => pointerDown(e, entry.index)}
              onlostpointercapture={() => {
                if (drag && !drag.keyboard) cancel();
              }}
              onkeydown={(e) => handleKey(e, entry.index)}
              ><span class="grip" aria-hidden="true"></span></button
            >
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
              grow
              invalid={!!nameProblem(entry.index)}
              commit={(value) => update(entry.index, { name: value })}
            />
          </div>
          <div class="catalogue-tools">
            <div class="move-menu-wrap">
              <button
                class="move-to"
                aria-label={`Move ${entry.name} to…`}
                aria-haspopup="menu"
                aria-expanded={menu === entry.index}
                aria-controls={menu === entry.index ? menuId : undefined}
                onclick={(e) => void openMenu(e, entry.index)}
                onkeydown={(e) => {
                  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                    e.preventDefault();
                    void openMenu(e, entry.index, e.key === 'ArrowUp');
                  }
                }}>Move to…</button
              >
              {#if menu === entry.index}
                <div
                  id={menuId}
                  bind:this={menuNode}
                  use:portal
                  role="menu"
                  tabindex="-1"
                  aria-label={`Move ${entry.name} to`}
                  class="catalogue-menu"
                  style:left={`${menuX}px`}
                  style:top={`${menuY}px`}
                  onkeydown={menuKey}
                  onfocusout={(e) => {
                    if (
                      !(e.relatedTarget instanceof Node) ||
                      !e.currentTarget.contains(e.relatedTarget)
                    )
                      closeMenu(false);
                  }}
                >
                  {#each groups.filter((r) => r !== role) as destination (destination)}
                    <button
                      role="menuitem"
                      tabindex="-1"
                      onclick={() => {
                        closeMenu(false);
                        drop(
                          entry.index,
                          {
                            role: destination,
                            position: inGroup(destination).length,
                          },
                          '.move-to',
                        );
                      }}>{groupNames[destination]}</button
                    >
                  {/each}
                </div>
              {/if}
            </div>
            <button
              class="move-up"
              aria-label={`Move ${entry.name} up`}
              disabled={groupIndex === 0}
              onclick={() => move(entry.index, -1)}>↑</button
            >
            <button
              class="move-down"
              aria-label={`Move ${entry.name} down`}
              disabled={groupIndex === inGroup(role).length - 1}
              onclick={() => move(entry.index, 1)}>↓</button
            >
            <button
              aria-label={`Remove ${entry.name}`}
              onclick={() =>
                change(entries.filter((_, i) => i !== entry.index))}>×</button
            >
          </div>
          {#if nameProblem(entry.index)}<small class="error catalogue-error"
              ><StatusChip
                tone="warning"
                text={nameProblem(entry.index)}
              /></small
            >{/if}
        </div>
      {/each}
      {#if drag?.active && target?.role === role && target.position === inGroup(role, true).length}
        <div class="drop-indicator" aria-hidden="true"></div>
      {/if}
      {#if !inGroup(role).length}
        <div
          class="catalogue-empty"
          class:drop-ready={drag?.active && target?.role === role}
        >
          Drop a standard here
        </div>
      {/if}
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
  <span id={`drag-help-${id}`} class="sr-only"
    >Space or Enter picks up and drops. Up and Down choose a position across
    groups. Escape cancels.</span
  >
</div>
{#if drag?.active && !drag.keyboard}
  <div
    use:portal
    class="catalogue-lifted"
    aria-hidden="true"
    style:left={`clamp(12px, ${drag.x + 14}px, calc(100vw - 280px))`}
    style:top={`clamp(12px, ${drag.y + 12}px, calc(100vh - 90px))`}
  >
    <span class="grip"></span><strong>{drag.source.name}</strong>
    <span>{groupNames[drag.source.role]}</span>
  </div>
{/if}
