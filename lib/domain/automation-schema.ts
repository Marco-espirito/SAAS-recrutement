import { z } from 'zod';
import { isAutomationCondition, type AutomationCondition } from './automation';

export const actionSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('CREATE_TASK'),
    title: z.string().min(1).max(200),
    body: z.string().max(5_000).optional(),
    dueInDays: z.number().int().min(0).max(365).default(0),
  }),
  z.object({
    type: z.literal('CREATE_EMAIL_DRAFT'),
    title: z.string().min(1).max(200),
    body: z.string().max(10_000),
  }),
  z.object({
    type: z.literal('UPDATE_APPLICATION_STAGE'),
    stage: z.enum([
      'TO_APPLY',
      'SENT',
      'FOLLOW_UP',
      'INTERVIEW',
      'OFFER',
      'REJECTED',
      'PLACED',
    ]),
  }),
]);

const conditionsSchema = z
  .array(z.custom<AutomationCondition>(isAutomationCondition))
  .max(20)
  .default([]);

export const automationInput = z
  .object({
    name: z.string().trim().min(2).max(160),
    enabled: z.boolean().default(false),
    triggerType: z.enum(['APPLICATION_CREATED', 'APPLICATION_STAGE_CHANGED']),
    delayDays: z.number().int().min(0).max(365).default(0),
    conditions: conditionsSchema,
    actions: z.array(actionSchema).min(1).max(20),
  })
  .strict();

export const automationPreviewInput = automationInput.extend({
  payload: z.record(z.string(), z.unknown()),
});
