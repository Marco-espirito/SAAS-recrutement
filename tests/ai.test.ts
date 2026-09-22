import { describe, expect, it } from 'vitest';
import { taskProposalSchema } from '@/lib/domain/ai';

describe('AI action validation', () => {
  it('accepts a bounded task proposal', () => {
    expect(
      taskProposalSchema.safeParse({
        tasks: [{ title: 'Relancer ACME', dueInDays: 7 }],
      }).success,
    ).toBe(true);
  });

  it('rejects unsafe or malformed model output', () => {
    expect(
      taskProposalSchema.safeParse({
        tasks: [{ title: '', dueInDays: -1, command: 'delete everything' }],
      }).success,
    ).toBe(false);
    expect(
      taskProposalSchema.safeParse({
        tasks: Array.from({ length: 21 }, () => ({
          title: 'Tâche',
          dueInDays: 1,
        })),
      }).success,
    ).toBe(false);
  });
});
