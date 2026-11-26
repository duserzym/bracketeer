<!-- Ported from upblab ui/src/components/ui/ProgressBar.svelte @ 419eadc -->
<!-- Usage: <ProgressBar value={ready} total={count} noun="capsules" />; null value means unknown. -->
<script lang="ts">
  import { progressState } from './controls';
  let {
    value,
    total,
    noun,
    hideCaption = false,
  }: {
    value?: number | null;
    total: number;
    noun: string;
    hideCaption?: boolean;
  } = $props();
  const progress = $derived(progressState(value, total, noun));
</script>

<div class="count-progress">
  {#if !hideCaption}<span class="caption">{progress.caption}</span>{/if}
  <div
    class="track"
    role="progressbar"
    aria-label={noun}
    aria-valuemin="0"
    aria-valuemax={progress.max}
    aria-valuenow={progress.now}
    aria-valuetext={progress.caption}
  >
    <span class="fill" style:width={`${progress.percent}%`}></span>
  </div>
</div>
