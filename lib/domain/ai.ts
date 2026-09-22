import { z } from 'zod';

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
