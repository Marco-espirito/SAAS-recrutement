import { z } from 'zod';

export type AiProvider = 'openai' | 'gemini';

/**
 * An explicit AI_PROVIDER always wins. Otherwise Gemini is preferred when
 * both keys happen to be configured, since it is the provider this project
 * defaults new setups to; OpenAI stays available for whoever already relies
 * on it. Returns null when nothing is configured at all.
 */
export function resolveAiProvider(config: {
  configuredProvider?: AiProvider;
  hasOpenAiKey: boolean;
  hasGeminiKey: boolean;
}): AiProvider | null {
  if (config.configuredProvider) return config.configuredProvider;
  if (config.hasGeminiKey) return 'gemini';
  if (config.hasOpenAiKey) return 'openai';
  return null;
}

export const taskProposalSchema = z
  .object({
    tasks: z
      .array(
        z
          .object({
            title: z.string().trim().min(1).max(200),
            dueInDays: z.number().int().min(0).max(90),
          })
          .strict(),
      )
      .min(1)
      .max(20),
  })
  .strict();

export type TaskProposal = z.infer<typeof taskProposalSchema>;
