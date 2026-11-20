import { describe, expect, it } from 'vitest';
import { exampleProject } from './model';
import { designProblem, unknownsProblem } from './navigation';

describe('unknowns navigation validation', () => {
  it('accepts the example, including fixed sessions', () => {
    expect(unknownsProblem(exampleProject())).toBeNull();
  });
  it('requires open unknowns and reports unnamed or invalid ranges with a focus target', () => {
    const project = exampleProject();
    project.sessions.forEach((s) => {
      s.fixed = true;
    });
    expect(unknownsProblem(project)?.message).toContain('open session');
    project.sessions[1]!.fixed = false;
    project.sessions[1]!.unknowns[0]!.name = '';
    expect(unknownsProblem(project)).toMatchObject({
      session: 2,
      label: 'Unknown 1 name',
    });
    project.sessions[1]!.unknowns[0]!.name = 'SYN-1';
    project.sessions[1]!.unknowns[0]!.from = 31;
    expect(unknownsProblem(project)?.message).toContain('ascending');
  });
  it('reports duplicate identities, overlapping unknowns and standard pools', () => {
    const project = exampleProject();
    const second = project.sessions[1]!.unknowns[2]!;
    second.name = 'SYN-1';
    expect(unknownsProblem(project)?.message).toContain('name and tag');
    second.name = 'SYN-3';
    second.from = 30;
    expect(unknownsProblem(project)?.message).toContain('also in row 1, SYN-1');
    second.from = 56;
    project.standards[0]!.ranges = [{ from: 1, to: 1000 }];
    expect(unknownsProblem(project)?.message).toContain('S513 pool');
  });
  it('requires pools and rejects overlapping pools', () => {
    const project = exampleProject();
    project.standards[0]!.ranges = [];
    expect(unknownsProblem(project)).toEqual({
      message: 'Add a pool for S513',
      label: 'S513 ranges',
    });
    project.standards[0]!.ranges = [{ from: 728, to: 757 }];
    expect(unknownsProblem(project)?.message).toContain('pools overlap');
  });
});

describe('design wizard validation', () => {
  it('allows absent or overlapping pools in Unknowns and catches them in Bracketing', () => {
    const project = exampleProject();
    project.standards[0]!.ranges = [];
    expect(designProblem(project)).toBeNull();
    expect(designProblem(project, true)).toEqual({
      message: 'Add a pool for S513',
      label: 'S513 begin',
    });
    project.standards[0]!.ranges = [{ from: 1, to: 1000 }];
    expect(designProblem(project)).toBeNull();
    expect(designProblem(project, true)?.message).toContain('pool');
  });
  it('numbers every continued entry, permits adjacent identities, and focuses errors in later sessions', () => {
    const project = exampleProject();
    project.sessions[1]!.unknowns.splice(1, 0, {
      name: 'SYN-1',
      tag: 'S',
      from: 1000,
      to: 1001,
    });
    expect(designProblem(project)).toBeNull();
    project.sessions[2]!.unknowns[0]!.from = 0;
    expect(designProblem(project)).toMatchObject({
      session: 3,
      label: 'Unknown 1 begin',
    });
    project.sessions[2]!.unknowns[0]!.from = 235;
    project.sessions[1]!.unknowns[3]!.name = 'SYN-1';
    expect(designProblem(project)?.label).toBe('Unknown 4 name');
  });
  it('accepts zero-demand standards without pools in design modes, but requires pools for demand', () => {
    const project = exampleProject();
    project.recipe.chunking = { mode: 'size', size: 1000 };
    project.standards.find((s) => s.name === 'LTSE')!.ranges = [];
    expect(designProblem(project, true)).toBeNull();
    project.standards[0]!.ranges = [];
    expect(designProblem(project, true)?.message).toBe('Add a pool for S513');
  });
});
