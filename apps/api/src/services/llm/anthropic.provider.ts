import { randomUUID } from 'node:crypto';
import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny, z } from 'zod';
import { env } from '../../config/env.js';
import { AppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { buildUserMessage, SAFETY_PREAMBLE } from './prompt.js';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

/** Beta flag for the `fallbacks: "default"` scalar form. */
const SERVER_FALLBACK_BETA = 'server-side-fallback-2026-07-01';

/**
 * Zod is the single source of truth for every schema; the JSON Schema the API
 * needs is derived from it, so the constraint the model is given and the
 * constraint the server enforces cannot drift apart.
 *
 * Keyed on the schema object, never on the schema name: the four interview modes
 * share one name but have different score dimensions, and a name-keyed cache
 * silently served one mode's schema to another.
 */
const schemaCache = new WeakMap<ZodTypeAny, Record<string, unknown>>();

function jsonSchemaFor(schema: ZodTypeAny): Record<string, unknown> {
  const cached = schemaCache.get(schema);
  if (cached) return cached;

  const converted = zodToJsonSchema(schema, {
    // The API wants one self-contained schema, not a document with $defs.
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as Record<string, unknown>;
  delete converted.$schema;

  schemaCache.set(schema, converted);
  return converted;
}

/**
 * Calls the Messages API with structured output, validates the result against
 * the caller's Zod schema, and retries a bounded number of times when the
 * model returns something that does not fit.
 */
export class AnthropicProvider implements LlmProvider {
  readonly name = 'anthropic';
  readonly model: string;

  private readonly client: Anthropic;
  /** Turned off at runtime if the account rejects the fallback beta. */
  private serverFallbacksEnabled: boolean;

  constructor() {
    const config = env();
    this.model = config.LLM_MODEL;
    this.serverFallbacksEnabled = config.LLM_SERVER_FALLBACKS;
    this.client = new Anthropic({
      apiKey: config.LLM_API_KEY,
      // SDK timeout is in milliseconds; it also bounds each retry.
      timeout: config.LLM_TIMEOUT_MS,
      maxRetries: config.LLM_MAX_RETRIES,
    });
  }

  async complete<S extends ZodTypeAny>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>>> {
    const config = env();
    const nonce = randomUUID().slice(0, 8);
    const system = `${SAFETY_PREAMBLE}\n\n${request.systemPrompt}`;
    const maxTokens = Math.min(
      request.maxOutputTokens ?? config.LLM_MAX_OUTPUT_TOKENS,
      config.LLM_MAX_OUTPUT_TOKENS,
    );

    const messages: Anthropic.MessageParam[] = [
      { role: 'user', content: buildUserMessage(request.task, request.untrustedInputs, nonce) },
    ];

    let inputTokens = 0;
    let outputTokens = 0;
    let lastIssue = 'unknown';

    // One initial attempt plus a bounded number of repair attempts.
    const totalAttempts = Math.max(1, config.LLM_MAX_RETRIES) + 1;

    for (let attempt = 0; attempt < totalAttempts; attempt += 1) {
      const response = await this.send(request, system, messages, maxTokens);

      inputTokens += response.usage.input_tokens ?? 0;
      outputTokens += response.usage.output_tokens ?? 0;

      if (response.stop_reason === 'refusal') {
        logger.warn(
          { operation: request.operation, category: response.stop_details?.category },
          'Model declined the request',
        );
        throw new AppError(
          'AI_UNAVAILABLE',
          'The AI coach could not process that request. Please rephrase and try again.',
        );
      }

      if (response.stop_reason === 'max_tokens') {
        lastIssue = 'response hit the output token limit';
      }

      const parsed = response.parsed_output;
      if (parsed !== null && parsed !== undefined) {
        const validated = request.schema.safeParse(parsed);
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
        lastIssue = 'response was not valid JSON for the requested schema';
      }

      logger.warn(
        { operation: request.operation, attempt: attempt + 1, issue: lastIssue },
        'Model output failed schema validation',
      );

      if (attempt === totalAttempts - 1) break;

      // Repair turn: show the model what was wrong without resending the data.
      messages.push(
        { role: 'assistant', content: this.textOf(response) || '{}' },
        {
          role: 'user',
          content: `That response did not match the required schema (${lastIssue}). Return the corrected JSON object only, with every required field present and within its limits.`,
        },
      );
    }

    throw new AppError(
      'AI_INVALID_RESPONSE',
      'The AI coach returned an unexpected response. Please try again in a moment.',
      { logContext: { operation: request.operation, issue: lastIssue } },
    );
  }

  private textOf(response: { content: Array<{ type: string }> }): string {
    return response.content
      .filter((block): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('');
  }

  private async send<S extends ZodTypeAny>(
    request: LlmRequest<S>,
    system: string,
    messages: Anthropic.MessageParam[],
    maxTokens: number,
  ) {
    const config = env();
    const base = {
      model: this.model,
      max_tokens: maxTokens,
      system,
      messages,
      output_config: {
        effort: config.LLM_EFFORT,
        format: jsonSchemaOutputFormat(jsonSchemaFor(request.schema) as never),
      },
    } as const;

    try {
      if (this.serverFallbacksEnabled) {
        return await this.client.messages.parse({
          ...base,
          betas: [SERVER_FALLBACK_BETA],
          fallbacks: 'default',
        } as Parameters<typeof this.client.messages.parse>[0]);
      }
      return await this.client.messages.parse(base);
    } catch (error) {
      // An account without the fallback beta rejects the request outright.
      // Drop the flag once and keep serving rather than failing every call.
      if (
        this.serverFallbacksEnabled &&
        error instanceof Anthropic.BadRequestError &&
        /fallback|beta/i.test(error.message)
      ) {
        logger.warn('Server-side refusal fallback is not enabled for this account; disabling it.');
        this.serverFallbacksEnabled = false;
        return this.client.messages.parse(base);
      }
      throw this.normalise(error, request);
    }
  }

  /** Maps provider errors onto app errors. Provider payloads never reach the user. */
  private normalise<S extends ZodTypeAny>(error: unknown, request: LlmRequest<S>): AppError {
    const context = { operation: request.operation, provider: this.name };

    if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
      return new AppError('AI_UNAVAILABLE', 'The AI coach is not configured correctly. Please contact support.', {
        logContext: { ...context, reason: 'auth' },
        cause: error,
      });
    }
    if (error instanceof Anthropic.RateLimitError) {
      return new AppError('AI_UNAVAILABLE', 'The AI coach is busy right now. Please try again in a minute.', {
        logContext: { ...context, reason: 'rate_limited' },
      });
    }
    if (error instanceof Anthropic.APIConnectionTimeoutError) {
      return new AppError('TIMEOUT', 'The AI coach took too long to respond. Please try again.', {
        logContext: { ...context, reason: 'timeout' },
      });
    }
    if (error instanceof Anthropic.APIConnectionError) {
      return new AppError('AI_UNAVAILABLE', 'We could not reach the AI coach. Please try again shortly.', {
        logContext: { ...context, reason: 'connection' },
      });
    }
    if (error instanceof Anthropic.APIError) {
      const quotaExhausted = error.status === 402 || /credit|quota|billing/i.test(error.message);
      return new AppError(
        'AI_UNAVAILABLE',
        quotaExhausted
          ? 'The AI coach is temporarily unavailable. Please try again later.'
          : 'The AI coach could not complete that request. Please try again.',
        { logContext: { ...context, status: error.status }, cause: error },
      );
    }

    return new AppError('AI_UNAVAILABLE', 'The AI coach is temporarily unavailable. Please try again.', {
      logContext: context,
      cause: error,
    });
  }
}
