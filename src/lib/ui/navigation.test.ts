import { describe, expect, it } from 'vitest';
import { exampleProject } from './model';
import { unknownsProblem } from './navigation';

describe('temporary unknowns validation', () => {
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
    project.sessions[1]!.unknowns[0]!.name = 'SYN-H3';
    project.sessions[1]!.unknowns[0]!.from = 31;
    expect(unknownsProblem(project)?.message).toContain('ascending');
  });
  it('reports duplicate identities, overlapping unknowns and standard pools', () => {
    const project = exampleProject();
    const second = project.sessions[1]!.unknowns[1]!;
    second.name = 'SYN-H3';
    expect(unknownsProblem(project)?.message).toContain('name and tag');
    second.name = 'SYN-H4';
    second.from = 30;
    expect(unknownsProblem(project)?.message).toContain('overlap');
    second.from = 31;
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
