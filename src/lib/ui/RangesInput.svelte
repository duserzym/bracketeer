<script lang="ts">
  import { parseRanges, parseUsedSpots } from '../engine/parse';
  let {
    value,
    label,
    used = false,
    disabled = false,
    oncommit,
  }: {
    value: string;
    label: string;
    used?: boolean;
    disabled?: boolean;
    oncommit: (text: string) => void;
  } = $props();
  let draft = $derived(value);
  let errors = $derived(
    (used ? parseUsedSpots(draft) : parseRanges(draft)).errors,
  );
</script>

<label class="range-field">
  <span>{label}</span>
  <input
    aria-label={label}
    class:invalid={errors.length > 0}
    aria-invalid={errors.length > 0}
    {disabled}
    bind:value={draft}
    placeholder={used ? 'None' : '848-856, 866-874'}
    onchange={() => {
      if (!errors.length) oncommit(draft);
    }}
  />
  {#each errors as error, i (i)}
    <small class="error">Not applied: {error.text} — {error.reason}</small>
  {/each}
</label>
