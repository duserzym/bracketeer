// Ported from upblab ui/src/components/ui/controls.test.ts @ 419eadc
import { describe, expect, it } from 'vitest';
import { render } from 'svelte/server';
import { readFileSync } from 'node:fs';
import { compile } from 'svelte/compiler';
import ts from 'typescript';
import type { IconName } from './Icon.svelte';

// The repo's Node-only Vitest config has no Svelte plugin. Compile the actual
// components to SSR modules in memory, preserving the upstream render assertions
// without starting a server or changing shared test configuration.
const modules = new Map<string, string>();
function controlURL(name: string): string {
  const cached = modules.get(name);
  if (cached) return cached;
  const source = readFileSync(new URL(name, import.meta.url), 'utf8');
  const code = name.endsWith('.svelte')
    ? compile(source, { filename: name, generate: 'server' }).js.code
    : ts.transpileModule(source, {
        compilerOptions: { module: ts.ModuleKind.ESNext },
      }).outputText;
  const linked = code.replace(/from '([^']+)'/g, (_, specifier: string) => {
    const url = specifier.startsWith('.')
      ? controlURL(
          specifier.endsWith('.svelte') ? specifier : specifier + '.ts',
        )
      : import.meta.resolve(specifier);
    return `from '${url}'`;
  });
  const url =
    'data:text/javascript;base64,' + Buffer.from(linked).toString('base64');
  modules.set(name, url);
  return url;
}
async function loadControl<T>(name: string): Promise<T> {
  return import(/* @vite-ignore */ controlURL(name));
}
const { default: SegmentedControl } = await loadControl<
  typeof import('./SegmentedControl.svelte')
>('./SegmentedControl.svelte');
const { default: IconButton } = await loadControl<
  typeof import('./IconButton.svelte')
>('./IconButton.svelte');
const { default: Icon } =
  await loadControl<typeof import('./Icon.svelte')>('./Icon.svelte');
const { default: ProgressBar } = await loadControl<
  typeof import('./ProgressBar.svelte')
>('./ProgressBar.svelte');
const { default: Stepper } =
  await loadControl<typeof import('./Stepper.svelte')>('./Stepper.svelte');
const { default: StatusChip } = await loadControl<
  typeof import('./StatusChip.svelte')
>('./StatusChip.svelte');
const { default: MetaChip } =
  await loadControl<typeof import('./MetaChip.svelte')>('./MetaChip.svelte');

describe('compact control variants', () => {
  it('keeps full radio names, titles and the selected tab stop when wrapping', () => {
    const { body } = render(SegmentedControl, {
      props: {
        label: 'Capsule navigation',
        value: 'chemistry',
        wrap: true,
        size: 'small',
        options: [
          { value: '', label: 'Sources' },
          {
            value: 'chemistry',
            label: 'Chemistry',
            ariaLabel: 'Full chemistry step name',
          },
        ],
      },
    });
    expect(body).toContain('role="radiogroup" aria-label="Capsule navigation"');
    expect(body).toMatch(
      /value="chemistry"[^>]*aria-checked="true"[^>]*aria-label="Full chemistry step name"[^>]*title="Full chemistry step name"[^>]*tabindex="0"/,
    );
    expect(body).toMatch(/value=""[^>]*aria-checked="false"[^>]*tabindex="-1"/);
    expect(body).toMatch(/class="[^"]*small[^"]*wrap/);
  });
  it('disables every entry while saving without losing its checked state', () => {
    const { body } = render(SegmentedControl, {
      props: {
        label: 'Entries',
        value: '1',
        disabled: true,
        options: [
          { value: '1', label: 'Entry 1' },
          { value: '2', label: 'Entry 2' },
        ],
      },
    });
    expect(body.match(/ disabled/g)).toHaveLength(2);
    expect(body.match(/aria-checked="true"/g)).toHaveLength(1);
  });
  it('keeps action names, disabled state, popover wiring and test ids in a small icon button', () => {
    const { body } = render(IconButton, {
      props: {
        icon: 'more',
        label: 'Presets',
        size: 'small',
        disabled: true,
        popovertarget: 'presets',
        'aria-expanded': false,
        'data-testid': 'action',
      },
    });
    for (const attribute of [
      'aria-label="Presets"',
      'title="Presets"',
      'popovertarget="presets"',
      'aria-expanded="false"',
      'data-testid="action"',
      'disabled',
      'type="button"',
      'aria-hidden="true"',
    ])
      expect(body).toContain(attribute);
    expect(body).toMatch(/class="[^"]*small/);
    expect(body).not.toContain('element=');
  });
  it('can hide a progress caption without losing the accessible progress value', () => {
    const props = { value: 2, total: 5, noun: 'Session upload progress' };
    const hidden = render(ProgressBar, {
      props: { ...props, hideCaption: true },
    }).body;
    expect(hidden).toContain('role="progressbar"');
    expect(hidden).toContain('aria-valuenow="2"');
    expect(hidden).toContain('aria-valuetext="2 of 5 Session upload progress"');
    expect(hidden).not.toContain('class="caption');
    expect(render(ProgressBar, { props }).body).toContain('class="caption');
  });
  it.each<IconName>([
    'arrow-up',
    'arrow-down',
    'chevron-right',
    'close',
    'more',
    'maximize',
    'restore',
    'zoom-in',
    'zoom-out',
    'fit',
    'hide',
    'show',
    'pin',
    'settings',
  ])('renders the decorative %s glyph', (kind) => {
    const { body } = render(Icon, { props: { kind } });
    expect(body).toContain('aria-hidden="true"');
    expect(body).toContain('<path');
    expect(body).toContain('stroke="currentColor"');
  });
});

it('keeps review view switches as named pressed buttons', () => {
  const { body } = render(SegmentedControl, {
    props: {
      label: 'Sequence view',
      buttonMode: true,
      value: 'grid',
      options: [
        { value: 'grid', label: 'Grid' },
        { value: 'paste', label: 'Qtegra paste' },
      ],
    },
  });
  expect(body).toContain('role="group" aria-label="Sequence view"');
  expect(body).toMatch(
    /value="grid"[^>]*aria-pressed="true"[^>]*aria-label="Grid"/,
  );
  expect(body).toMatch(
    /value="paste"[^>]*aria-pressed="false"[^>]*aria-label="Qtegra paste"/,
  );
  expect(body).not.toContain('role="radio"');
});
it('keeps wizard button names, reachability, current step and counts', () => {
  const { body } = render(Stepper, {
    props: {
      label: 'Wizard steps',
      onselect: () => {},
      steps: [
        {
          label: 'Mineral',
          fullName: 'Mineral',
          ariaLabel: '1 Mineral',
          detail: '1 group',
          state: 'done',
        },
        {
          label: 'Unknowns',
          fullName: 'Unknowns',
          ariaLabel: '2 Unknowns',
          detail: '2 samples',
          state: 'current',
        },
        {
          label: 'Review',
          fullName: 'Review',
          ariaLabel: '4 Review',
          detail: '0 rows',
          state: 'pending',
          disabled: true,
          title: 'Enter unknowns',
        },
      ],
    },
  });
  expect(body).toContain('aria-label="Wizard steps"');
  expect(body).toMatch(/aria-label="1 Mineral"[^>]*>.*?1 group/s);
  expect(body).toMatch(/aria-label="2 Unknowns"[^>]*aria-current="step"/);
  expect(body).toMatch(
    /aria-label="4 Review"[^>]*title="Enter unknowns"[^>]*disabled/,
  );
  for (const detail of ['1 group', '2 samples', '0 rows'])
    expect(body).toContain(detail);
});
it('renders the existing validation message as a state and keeps facts quiet', () => {
  const warning = render(StatusChip, {
    props: { tone: 'warning', text: '2 short' },
  }).body;
  expect(warning).toMatch(/class="[^"]*warning/);
  expect(warning).toContain('2 short');
  const success = render(StatusChip, {
    props: { tone: 'success', text: 'No warnings' },
  }).body;
  expect(success).toMatch(/class="[^"]*success/);
  expect(success).toContain('No warnings');
  const fact = render(MetaChip, { props: { text: '332 rows' } }).body;
  expect(fact).toContain('title="332 rows"');
  expect(fact).not.toContain('<button');
});
