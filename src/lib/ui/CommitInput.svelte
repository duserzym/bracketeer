<script lang="ts">
  import { onDestroy } from 'svelte';
  let {
    label,
    value,
    commit,
    automatic,
    hand = false,
    readonly = false,
    type = 'number',
    min = 1,
    step = '1',
    invalid = false,
    validate,
    required = type === 'number',
  }: {
    label: string;
    value: string | number;
    commit: (value: string) => void;
    automatic?: (() => void) | undefined;
    hand?: boolean;
    readonly?: boolean;
    type?: 'text' | 'number';
    min?: number | null;
    step?: string;
    invalid?: boolean;
    validate?: (value: string) => string;
    required?: boolean;
  } = $props();
  let text = $state('');
  let focused = $state(false);
  let dirty = $state(false);
  let draftError = $state('');
  let input: HTMLInputElement;
  let timer: ReturnType<typeof setTimeout>;
  let previousSaved = '';
  $effect(() => {
    const saved = String(value);
    // Tab can focus an automatic field before the preceding edit renders.
    // Refresh untouched fields, while retaining the text/caret of a typed field.
    if (!dirty && (!focused || text === previousSaved)) {
      text = saved;
      input?.setCustomValidity('');
      draftError = '';
    }
    previousSaved = saved;
  });
  function validateDraft() {
    draftError = validate?.(text) ?? '';
    if (
      !draftError &&
      type === 'number' &&
      text.trim() &&
      (step === '1'
        ? !Number.isSafeInteger(Number(text))
        : !Number.isFinite(Number(text)))
    )
      draftError =
        step === '1' ? 'Enter a whole number.' : 'Enter a finite number.';
    input.setCustomValidity(draftError);
  }
  function flush() {
    clearTimeout(timer);
    if (!dirty) return;
    validateDraft();
    if (type === 'number' && !text.trim() && !required) {
      dirty = false;
      return;
    }
    if (input.checkValidity()) {
      commit(text);
      dirty = false;
    }
  }
  onDestroy(() => clearTimeout(timer));
</script>

<div class="commit-cell" class:hand>
  <input
    bind:this={input}
    {type}
    aria-label={label}
    {readonly}
    {required}
    min={type === 'number' ? min : undefined}
    step={type === 'number' ? step : undefined}
    value={text}
    aria-invalid={invalid || undefined}
    title={hand ? 'Typed by hand; kept when rows above change.' : undefined}
    onfocus={() => {
      focused = true;
    }}
    oninput={(event) => {
      dirty = true;
      text = event.currentTarget.value;
      validateDraft();
      clearTimeout(timer);
      timer = setTimeout(flush, 300);
    }}
    onblur={() => {
      flush();
      focused = false;
    }}
    onkeydown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        flush();
      }
    }}
  />
  {#if hand && automatic && !readonly}
    <button
      class="auto-button"
      aria-label={`Auto ${label}`}
      onmousedown={(e) => e.preventDefault()}
      onclick={() => {
        clearTimeout(timer);
        automatic();
        dirty = false;
        focused = false;
      }}>Auto</button
    >
  {/if}
</div>

{#if draftError}<small class="error">{draftError}</small>{/if}
