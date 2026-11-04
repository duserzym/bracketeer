<script lang="ts">
  import { tick } from 'svelte';
  import { parseLabel } from '../engine/labels';
  import {
    QTEGRA_COLUMNS,
    type QtegraCells,
    type Session,
    type Standard,
  } from '../engine/types';

  let {
    session,
    standards,
    selected,
    onselect,
    onedit,
  }: {
    session: Session;
    standards: Standard[];
    selected: number[];
    onselect: (rows: number[]) => void;
    onedit: (
      index: number,
      column: keyof QtegraCells,
      value: string | boolean,
    ) => void;
  } = $props();
  let anchor = 0;
  let scroller: HTMLDivElement;
  // Label takes the remaining width; the constant columns stay compact.
  const columnWidths: Partial<Record<keyof QtegraCells, number>> = {
    Status: 40,
    'Duration [s]': 56,
    Comment: 88,
    Evaluate: 54,
    'Sample Type': 76,
    Standard: 56,
    'Dilution Factor': 52,
    Amount: 50,
    'Final Quantity': 60,
    Identifier: 90,
    'Laser Scan Position Number': 126,
    'Laser Output Setting [%]': 100,
  };
  function select(index: number, event: MouseEvent | KeyboardEvent) {
    if (event.shiftKey) {
      const first = Math.min(anchor, index);
      onselect(
        Array.from(
          { length: Math.abs(anchor - index) + 1 },
          (_, i) => first + i,
        ),
      );
    } else if (event.metaKey || event.ctrlKey) {
      onselect(
        selected.includes(index)
          ? selected.filter((r) => r !== index)
          : [...selected, index],
      );
      anchor = index;
    } else {
      onselect([index]);
      anchor = index;
    }
  }
  export async function reveal(index: number) {
    await tick();
    scroller
      .querySelector(`[data-row="${index}"]`)
      ?.scrollIntoView({ block: 'center', inline: 'nearest' });
  }
  function change(event: Event, index: number, column: keyof QtegraCells) {
    const input = event.currentTarget as HTMLInputElement;
    if (!input.reportValidity()) return;
    onedit(index, column, column === 'Evaluate' ? input.checked : input.value);
  }
</script>

<div class="grid-scroll" bind:this={scroller} data-testid="grid-scroll">
  <table
    class="sequence-grid"
    role="grid"
    aria-label={`Session ${session.number} sequence`}
    aria-readonly={session.fixed}
  >
    <colgroup>
      <col class="row-number" />
      {#each QTEGRA_COLUMNS as column (column)}
        <col
          style:width={columnWidths[column] === undefined
            ? undefined
            : `${columnWidths[column]}px`}
        />
      {/each}
    </colgroup>
    <thead
      ><tr
        ><th class="row-number" scope="col">Row</th>
        {#each QTEGRA_COLUMNS as column (column)}<th
            scope="col"
            class:label-column={column === 'Label'}
            class:position-column={column === 'Laser Scan Position Number'}
            >{column}</th
          >{/each}
      </tr></thead
    >
    <tbody>
      {#each session.rows as row, i (i)}
        {@const kind = parseLabel(row.Label, standards).kind}
        <tr
          data-row={i}
          data-kind={kind}
          aria-selected={selected.includes(i)}
          class:selected={selected.includes(i)}
        >
          <th scope="row" class="row-number kind-{kind}"
            ><button
              aria-label={`Select row ${i + 1}`}
              aria-pressed={selected.includes(i)}
              onclick={(e) => select(i, e)}>{i + 1}</button
            ></th
          >
          {#each QTEGRA_COLUMNS as column (column)}
            {@const numeric =
              column === 'Duration [s]' ||
              column === 'Dilution Factor' ||
              column === 'Laser Scan Position Number' ||
              column === 'Laser Output Setting [%]'}
            <td
              class:numeric
              class:label-column={column === 'Label'}
              class:position-column={column === 'Laser Scan Position Number'}
            >
              <input
                type={column === 'Evaluate'
                  ? 'checkbox'
                  : numeric
                    ? 'number'
                    : 'text'}
                step={numeric ? 'any' : undefined}
                aria-label={`Row ${i + 1} ${column}`}
                title={column === 'Status'
                  ? 'Status stays blank for Qtegra'
                  : `${kind}: ${row.Label}`}
                value={column === 'Evaluate' ? undefined : (row[column] ?? '')}
                checked={column === 'Evaluate' ? row.Evaluate : undefined}
                readonly={column === 'Status' || session.fixed}
                disabled={column === 'Evaluate' && session.fixed}
                required={numeric && column !== 'Laser Scan Position Number'}
                onclick={(e) => select(i, e)}
                onchange={(e) => change(e, i, column)}
              />
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>
</div>
