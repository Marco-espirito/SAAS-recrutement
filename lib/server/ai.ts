import 'server-only';
import OpenAI from 'openai';
import { z } from 'zod';
import { resolveAiProvider as resolveProviderFromConfig } from '@/lib/domain/ai';
import { env } from './env';

export type AssistantTool = {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
};

export type AssistantToolCall = { name: string; arguments: unknown };

export type AssistantResult = {
  text: string;
  toolCalls: AssistantToolCall[];
  responseId: string;
};

export function resolveAiProvider() {
  const configuration = env();
  return resolveProviderFromConfig({
    configuredProvider: configuration.AI_PROVIDER,
    hasOpenAiKey: Boolean(configuration.OPENAI_API_KEY),
    hasGeminiKey: Boolean(configuration.GEMINI_API_KEY),
  });
}

export async function runAssistant(input: {
  instructions: string;
  message: string;
  tools: AssistantTool[];
}): Promise<AssistantResult> {
  const provider = resolveAiProvider();
  if (provider === 'gemini') return runGemini(input);
  if (provider === 'openai') return runOpenAi(input);
  throw new Error('AI_NOT_CONFIGURED');
}

async function runOpenAi(input: {
  instructions: string;
  message: string;
  tools: AssistantTool[];
}): Promise<AssistantResult> {
  const client = new OpenAI({ apiKey: env().OPENAI_API_KEY });
  const response = await client.responses.create({
    model: env().OPENAI_MODEL,
    instructions: input.instructions,
    input: input.message,
    tools: input.tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      strict: true,
      parameters: tool.parameters,
    })),
    tool_choice: 'auto',
    max_output_tokens: 1_200,
  });
  const toolCalls: AssistantToolCall[] = [];
  for (const item of response.output) {
    if (item.type !== 'function_call') continue;
    toolCalls.push({
      name: item.name,
      arguments: JSON.parse(item.arguments) as unknown,
    });
  }
  return {
    text: response.output_text ?? '',
    toolCalls,
    responseId: response.id,
  };
}

const geminiResponseSchema = z.object({
  candidates: z
    .array(
      z.object({
        content: z
          .object({
            parts: z
              .array(
                z.object({
                  text: z.string().optional(),
                  functionCall: z
                    .object({ name: z.string(), args: z.unknown().optional() })
                    .optional(),
                }),
              )
              .default([]),
          })
          .optional(),
      }),
    )
    .default([]),
});

// The default model (gemini-3.6-flash) always spends part of maxOutputTokens
// on an internal "thinking" pass before the visible answer; a low budget can
// come back with an empty response even on trivial prompts.
async function runGemini(input: {
  instructions: string;
  message: string;
  tools: AssistantTool[];
}): Promise<AssistantResult> {
  const apiKey = env().GEMINI_API_KEY;
  if (!apiKey) throw new Error('AI_NOT_CONFIGURED');
  const model = env().GEMINI_MODEL;
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: input.message }] }],
        systemInstruction: { parts: [{ text: input.instructions }] },
        tools: input.tools.length
          ? [
              {
                functionDeclarations: input.tools.map((tool) => ({
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.parameters,
                })),
              },
            ]
          : undefined,
        generationConfig: { maxOutputTokens: 2_048 },
      }),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (!response.ok)
    throw new Error(`Gemini a répondu avec le statut ${response.status}`);
  const parsed = geminiResponseSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('Réponse Gemini invalide');
  const parts = parsed.data.candidates[0]?.content?.parts ?? [];
  const text = parts
    .map((part) => part.text ?? '')
    .join('')
    .trim();
  const toolCalls: AssistantToolCall[] = parts
    .filter(
      (
        part,
      ): part is {
        text?: string;
        functionCall: { name: string; args?: unknown };
      } => Boolean(part.functionCall),
    )
    .map((part) => ({
      name: part.functionCall.name,
      arguments: part.functionCall.args,
    }));
  return { text, toolCalls, responseId: crypto.randomUUID() };
}
