import { describe, expect, it } from 'vitest';
import {
  resolveAiProvider,
  stageProposalSchema,
  taskProposalSchema,
} from '@/lib/domain/ai';

describe('AI provider resolution', () => {
  it('is unconfigured when no key and no explicit provider are set', () => {
    expect(
      resolveAiProvider({ hasOpenAiKey: false, hasGeminiKey: false }),
    ).toBeNull();
  });

  it('prefers Gemini when both keys are present without an explicit choice', () => {
    expect(resolveAiProvider({ hasOpenAiKey: true, hasGeminiKey: true })).toBe(
      'gemini',
    );
  });

  it('falls back to whichever single key is configured', () => {
    expect(resolveAiProvider({ hasOpenAiKey: true, hasGeminiKey: false })).toBe(
      'openai',
    );
    expect(resolveAiProvider({ hasOpenAiKey: false, hasGeminiKey: true })).toBe(
      'gemini',
    );
  });

  it('lets an explicit AI_PROVIDER override key presence', () => {
    expect(
      resolveAiProvider({
        configuredProvider: 'openai',
        hasOpenAiKey: false,
        hasGeminiKey: true,
      }),
    ).toBe('openai');
  });
});

describe('AI action validation', () => {
  it('accepts only bounded application stage proposals', () => {
    const valid = {
      updates: [
        {
          applicationId: '123e4567-e89b-42d3-a456-426614174000',
          stage: 'INTERVIEW',
        },
      ],
    };
    expect(stageProposalSchema.safeParse(valid).success).toBe(true);
    expect(
      stageProposalSchema.safeParse({
        updates: [{ ...valid.updates[0], stage: 'DELETE' }],
      }).success,
    ).toBe(false);
    expect(
      stageProposalSchema.safeParse({
        updates: Array.from({ length: 21 }, () => valid.updates[0]),
      }).success,
    ).toBe(false);
  });
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
