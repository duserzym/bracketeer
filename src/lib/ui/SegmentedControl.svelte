<!-- Ported from upblab ui/src/components/ui/SegmentedControl.svelte @ 419eadc -->
<!-- Usage: <SegmentedControl {options} bind:value label="Views" />; view switches only. -->
<script lang="ts">
  import { segmentedIndex, type SegmentedOption } from './controls';
  let {
    options,
    value = $bindable(),
    label,
    onchange,
    size = 'normal',
    wrap = false,
    disabled = false,
    buttonMode = false,
  }: {
    options: SegmentedOption[];
    value: string;
    label: string;
    onchange?: (value: string) => void;
    size?: 'small' | 'normal';
    wrap?: boolean;
    disabled?: boolean;
    buttonMode?: boolean;
  } = $props();
  let buttons = $state<HTMLButtonElement[]>([]);
  const active = $derived(
    Math.max(
      0,
      options.findIndex((option) => option.value === value),
    ),
  );
  function select(index: number) {
    // Like a native select, selecting the current mode must not reset its inputs.
    if (disabled || options[index]!.value === value) return;
    value = options[index]!.value;
    onchange?.(value);
  }
  function keyboard(event: KeyboardEvent, index: number) {
    const next = segmentedIndex(event.key, index, options.length);
    if (next === null || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    select(next);
    buttons[next]?.focus();
  }
</script>

<div
  class="segments"
  class:small={size === 'small'}
  class:wrap
  role={buttonMode ? 'group' : 'radiogroup'}
  aria-label={label}
>
  {#each options as option, index (option.value)}
    <button
      type="button"
      value={option.value}
      role={buttonMode ? undefined : 'radio'}
      aria-checked={buttonMode ? undefined : value === option.value}
      aria-pressed={buttonMode ? value === option.value : undefined}
      aria-label={option.ariaLabel ?? option.label}
      title={option.title ?? option.ariaLabel ?? option.label}
      tabindex={buttonMode || index === active ? 0 : -1}
      {disabled}
      bind:this={buttons[index]}
      onclick={() => select(index)}
      onkeydown={(event) => keyboard(event, index)}>{option.label}</button
    >
  {/each}
</div>

<style>
  .segments {
    display: inline-flex;
    flex: none;
    border: 1px solid var(--border);
    border-radius: var(--control-radius);
    background: var(--subtle);
  }
  button {
    border: 0;
    border-radius: 0;
    padding: 5px 12px;
    background: transparent;
    cursor: pointer;
    white-space: nowrap;
  }
  button + button {
    border-left: 1px solid var(--border);
  }
  button:first-child {
    border-radius: calc(var(--control-radius) - 1px) 0 0
      calc(var(--control-radius) - 1px);
  }
  button:last-child {
    border-radius: 0 calc(var(--control-radius) - 1px)
      calc(var(--control-radius) - 1px) 0;
  }
  button[aria-checked='true'],
  button[aria-pressed='true'] {
    background: var(--selection);
    color: var(--accent);
    box-shadow: inset 0 0 0 1px var(--accent);
  }
  button:hover {
    background-color: var(--selection);
  }
  button:active {
    background-image: linear-gradient(
      var(--control-press),
      var(--control-press)
    );
  }
  button:focus-visible {
    position: relative;
    z-index: 1;
    outline: 2px solid var(--accent);
    outline-offset: 2px;
  }
  .small button {
    height: 28px;
    padding: 2px 8px;
    font-size: 12px;
  }
  .wrap {
    flex-wrap: wrap;
    width: fit-content;
    min-width: 0;
    max-width: 100%;
  }
  .wrap button {
    min-width: 0;
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    flex: 0 1 auto;
  }
  button:disabled {
    opacity: 0.5;
    cursor: default;
  }
</style>
