<script lang="ts">
  import { toTSV } from '../engine/export';
  import { QTEGRA_COLUMNS, type Row } from '../engine/types';
  import { splitTSV } from './review';
  let { rows, copy }: { rows: Row[]; copy: () => void } = $props();
  const cells = $derived(splitTSV(toTSV(rows)));
</script>

<div class="paste-heading">
  <span>{rows.length} rows · 13 columns · No header</span>
  <button onclick={copy}>Copy for Qtegra</button>
</div>
<div class="paste-scroll" data-testid="paste-scroll">
  <table class="paste-table" aria-label="Qtegra paste">
    <thead
      ><tr
        ><th aria-label="Row number"
        ></th>{#each QTEGRA_COLUMNS as column, i (column)}<th
            title={column}
            scope="col">{String.fromCharCode(65 + i)}</th
          >{/each}</tr
      ></thead
    >
    <tbody
      >{#each cells as row, i (i)}<tr
          ><th scope="row">{i + 1}</th>{#each row as value, j (j)}<td
              >{value}</td
            >{/each}</tr
        >{/each}</tbody
    >
  </table>
</div>
