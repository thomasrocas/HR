import { createProgram, getPrograms, patchProgram, Program } from '../src/api';

describe('program metadata normalization and payloads', () => {
  test('getPrograms exposes department and discipline metadata from mock seed', async () => {
    const response = await getPrograms();
    expect(response.data.length).toBeGreaterThan(0);
    const sample = response.data[0] as Program;
    expect(sample.disciplineType).toBe('Technical');
    expect(sample.department).toBe('Engineering');
  });

  test('createProgram trims metadata fields before returning', async () => {
    const created = await createProgram({
      name: 'Metadata Program',
      department: '  Research  ',
      disciplineType: '  STEM  ',
    });
    expect(created.department).toBe('Research');
    expect(created.disciplineType).toBe('STEM');
  });

  test('patchProgram accepts aliases and clears empty metadata', async () => {
    const updated = await patchProgram('p1', {
      dept: '  Support  ',
      discipline: '  Customer Success  ',
    } as unknown as Partial<Program>);
    expect(updated.department).toBe('Support');
    expect(updated.disciplineType).toBe('Customer Success');

    const cleared = await patchProgram('p1', {
      department: '   ',
      disciplineType: '   ',
    });
    expect(cleared.department).toBeNull();
    expect(cleared.disciplineType).toBeNull();
  });
});
