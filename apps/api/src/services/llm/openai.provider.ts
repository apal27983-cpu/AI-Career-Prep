import { randomUUID } from 'node:crypto';
import OpenAI from 'openai';
// These two are thrown by the `.parse()` helper and are not re-exported on the
// OpenAI namespace object, so they come from the error module directly.
import {
  ContentFilterFinishReasonError,
  LengthFinishReasonError,
} from 'openai/core/error';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny, z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { buildUserMessage, SAFETY_PREAMBLE } from './prompt.js';
import { restoreOptionalNulls, toOpenAiStrictSchema } from './openaiSchema.js';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

/**
 * Our effort scale has five levels; OpenAI's `reasoning_effort` is narrower on
 * some models, so the top level is folded down rather than risking a 400.
 */
const EFFORT_MAP: Record<string, string> = {
  low: 'low',
  medium: 'medium',
  high: 'high',
  xhigh: 'xhigh',
  max: 'xhigh',
};

interface CachedSchema {
  /** As generated from Zod. Used to undo the strict-mode null padding. */
  original: Record<string, unknown>;
  /** Adapted for strict structured output. */
  strict: Record<string, unknown>;
}

/**
 * Calls the Chat Completions API with strict structured output, validates the
 * result against the caller's Zod schema, and retries a bounded number of times
 * when the model returns something that does not fit.
 *
 * Zod stays the single source of truth: the JSON Schema sent to the model is
 * derived from it, so the constraint the model is given and the constraint the
 * server enforces cannot drift apart.
 */
export class OpenAiProvider implements LlmProvider {
  readonly name = 'openai';
  readonly model: string;

  private readonly client: OpenAI;
  /**
   * Keyed on the schema object, never on the schema name: the four interview
   * modes share one name but have different score dimensions, and a name-keyed
   * cache silently served one mode's schema to another.
   */
  private readonly schemaCache = new WeakMap<ZodTypeAny, CachedSchema>();
  /** Turned off at runtime if the model rejects the parameter. */
  private sendReasoningEffort = true;

  constructor() {
    const config = env();
    this.model = config.LLM_MODEL;
    this.client = new OpenAI({
      apiKey: config.LLM_API_KEY,
      // SDK timeout is in milliseconds and also bounds each retry.
      timeout: config.LLM_TIMEOUT_MS,
      maxRetries: config.LLM_MAX_RETRIES,
    });
  }

  private schemasFor(schema: ZodTypeAny): CachedSchema {
    const cached = this.schemaCache.get(schema);
    if (cached) return cached;

    const original = zodToJsonSchema(schema, {
      $refStrategy: 'none',
      target: 'jsonSchema7',
    }) as Record<string, unknown>;
    delete original.$schema;

    const entry: CachedSchema = { original, strict: toOpenAiStrictSchema(original) };
    this.schemaCache.set(schema, entry);
    return entry;
  }

  async complete<S extends ZodTypeAny>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>>> {
    const config = env();
    const nonce = randomUUID().slice(0, 8);
    const { original, strict } = this.schemasFor(request.schema);

    const maxTokens = Math.min(
      request.maxOutputTokens ?? config.LLM_MAX_OUTPUT_TOKENS,
      config.LLM_MAX_OUTPUT_TOKENS,
    );

    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: 'system', content: `${SAFETY_PREAMBLE}\n\n${request.systemPrompt}` },
      { role: 'user', content: buildUserMessage(request.task, request.untrustedInputs, nonce) },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let lastIssue = 'unknown';

    const totalAttempts = Math.max(1, config.LLM_MAX_RETRIES) + 1;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      const response = await this.send(request, messages, maxTokens, strict);

      inputTokens += response.usage?.prompt_tokens ?? 0;
      outputTokens += response.usage?.completion_tokens ?? 0;

      const choice = response.choices[0];

      if (choice?.message.refusal) {
        logger.warn({ operation: request.operation }, 'Model declined the request');
        throw new AppError(
          'AI_UNAVAILABLE',
          'The AI coach could not process that request. Please rephrase and try again.',
        );
      }

      if (choice?.finish_reason === 'length') {
        lastIssue = 'the response hit the output token limit before the JSON was complete';
      }

      const parsed = choice?.message.parsed;
      if (parsed !== null && parsed !== undefined) {
        // Strict mode made optional fields nullable; undo that so the Zod
        // defaults apply rather than failing on an explicit null.
        const restored = restoreOptionalNulls(parsed, original);
        const validated = request.schema.safeParse(restored);

        if (validated.success) {
          return {
            data: validated.data as z.infer<S>,
            source: 'AI_GENERATED',
            usage: { inputTokens, outputTokens },
            model: this.model,
            provider: this.name,
            repairAttempts: attempt,
          };
        }

        lastIssue = validated.error.issues
          .slice(0, 4)
          .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
          .join('; ');
      } else if (lastIssue === 'unknown') {
        lastIssue = 'the response was not valid JSON for the requested schema';
      }

      logger.warn(
        { operation: request.operation, attempt: attempt + 1, issue: lastIssue },
        'Model output failed schema validation',
      );

      if (attempt === totalAttempts - 1) break;

      // Repair turn: show the model what was wrong without resending the data.
      messages.push(
        { role: 'assistant', content: choice?.message.content ?? '{}' },
        {
          role: 'user',
          content: `That response did not satisfy the required schema (${lastIssue}). Return the corrected JSON object only, with every required field present and within its stated limits.`,
        },
      );
    }

    throw new AppError(
      'AI_INVALID_RESPONSE',
      'The AI coach returned an unexpected response. Please try again in a moment.',
      { logContext: { operation: request.operation, issue: lastIssue } },
    );
  }

  private async send<S extends ZodTypeAny>(
    request: LlmRequest<S>,
    messages: OpenAI.Chat.ChatCompletionMessageParam[],
    maxTokens: number,
    strictSchema: Record<string, unknown>,
  ) {
    const config = env();

    const body = {
      model: this.model,
      messages,
      // Newer models require `max_completion_tokens` rather than `max_tokens`.
      max_completion_tokens: maxTokens,
      response_format: {
        type: 'json_schema' as const,
        json_schema: {
          name: request.schemaName,
          schema: strictSchema,
          // Strict mode is what makes the enumerated bounds binding.
          strict: true,
        },
      },
    };

    try {
      if (this.sendReasoningEffort) {
        return await this.client.chat.completions.parse({
          ...body,
          reasoning_effort: EFFORT_MAP[config.LLM_EFFORT] ?? 'medium',
        } as Parameters<typeof this.client.chat.completions.parse>[0]);
      }
      return await this.client.chat.completions.parse(body);
    } catch (error) {
      // Some models do not take a reasoning effort. Drop it once and keep
      // serving rather than failing every call.
      if (
        this.sendReasoningEffort &&
        error instanceof OpenAI.BadRequestError &&
        /reasoning_effort|reasoning/i.test(error.message)
      ) {
        logger.warn(
          { model: this.model },
          'Model does not accept reasoning_effort; continuing without it.',
        );
        this.sendReasoningEffort = false;
        return this.client.chat.completions.parse(body);
      }
      throw this.normalise(error, request);
    }
  }

  /** Maps provider errors onto app errors. Provider payloads never reach the user. */
  private normalise<S extends ZodTypeAny>(error: unknown, request: LlmRequest<S>): AppError {
    const context = { operation: request.operation, provider: this.name, model: this.model };

    if (
      error instanceof OpenAI.AuthenticationError ||
      error instanceof OpenAI.PermissionDeniedError
    ) {
      return new AppError(
        'AI_UNAVAILABLE',
        'The AI coach is not configured correctly. Please contact support.',
        { logContext: { ...context, reason: 'auth' }, cause: error },
      );
    }
    if (error instanceof OpenAI.RateLimitError) {
      // 429 also covers an exhausted quota, which is not worth retrying.
      const quotaExhausted = /quota|billing|insufficient/i.test(error.message);
      return new AppError(
        'AI_UNAVAILABLE',
        quotaExhausted
          ? 'The AI coach is temporarily unavailable. Please try again later.'
          : 'The AI coach is busy right now. Please try again in a minute.',
        { logContext: { ...context, reason: quotaExhausted ? 'quota' : 'rate_limited' } },
      );
    }
    if (error instanceof OpenAI.APIConnectionTimeoutError) {
      return new AppError('TIMEOUT', 'The AI coach took too long to respond. Please try again.', {
        logContext: { ...context, reason: 'timeout' },
      });
    }
    if (error instanceof OpenAI.APIConnectionError) {
      return new AppError('AI_UNAVAILABLE', 'We could not reach the AI coach. Please try again shortly.', {
        logContext: { ...context, reason: 'connection' },
      });
    }
    if (error instanceof OpenAI.NotFoundError) {
      // Almost always a model id the account cannot use.
      return new AppError(
        'AI_UNAVAILABLE',
        'The AI coach is not configured correctly. Please contact support.',
        { logContext: { ...context, reason: 'model_not_found' }, cause: error },
      );
    }
    if (error instanceof LengthFinishReasonError) {
      return new AppError(
        'AI_INVALID_RESPONSE',
        'That response was cut short. Please try again, or shorten your input.',
        { logContext: { ...context, reason: 'max_tokens' } },
      );
    }
    if (error instanceof ContentFilterFinishReasonError) {
      return new AppError(
        'AI_UNAVAILABLE',
        'The AI coach could not process that request. Please rephrase and try again.',
        { logContext: { ...context, reason: 'content_filter' } },
      );
    }
    if (error instanceof OpenAI.APIError) {
      return new AppError('AI_UNAVAILABLE', 'The AI coach could not complete that request. Please try again.', {
        logContext: { ...context, status: error.status },
        cause: error,
      });
    }

    return new AppError('AI_UNAVAILABLE', 'The AI coach is temporarily unavailable. Please try again.', {
      logContext: context,
      cause: error,
    });
  }
}
