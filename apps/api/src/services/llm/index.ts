import type { ZodTypeAny, z } from 'zod';
import { env } from '../../config/env.js';
import { prisma } from '../../config/prisma.js';
import { AppError, isAppError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import { AnthropicProvider } from './anthropic.provider.js';
import { OpenAiProvider } from './openai.provider.js';
import { MockProvider } from './mock.provider.js';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

export type {
  ContentSourceName,
  LlmOperation,
  LlmProvider,
  LlmRequest,
  LlmResult,
  UntrustedInput,
} from './types.js';
export { clampForPrompt } from './prompt.js';

let provider: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (!provider) {
    switch (env().LLM_PROVIDER) {
      case 'mock':
        provider = new MockProvider();
        break;
      case 'openai':
        provider = new OpenAiProvider();
        break;
      default:
        provider = new AnthropicProvider();
    }
  }
  return provider;
}

/** Test seam: swap the provider for a stub. */
export function setProvider(replacement: LlmProvider | null): void {
  provider = replacement;
}

/** Errors that mean "the model is unavailable" rather than "the request was wrong". */
const DEGRADABLE_CODES = new Set(['AI_UNAVAILABLE', 'AI_INVALID_RESPONSE', 'TIMEOUT']);

/**
 * Runs one model call, records usage against the user and degrades to curated
 * content when the provider is unavailable. Callers get a result that always
 * states which of the two it is.
 */
export async function runLlm<S extends ZodTypeAny>(
  userId: string,
  request: LlmRequest<S>,
): Promise<LlmResult<z.infer<S>>> {
  const active = getProvider();
  const startedAt = Date.now();

  try {
    const result = await active.complete(request);
    void recordUsage(userId, request, result, Date.now() - startedAt, true);
    return result;
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    void recordUsage(
      userId,
      request,
      { model: active.model, provider: active.name, usage: { inputTokens: 0, outputTokens: 0 } },
      durationMs,
      false,
    );

    if (isAppError(error) && DEGRADABLE_CODES.has(error.code)) {
      const validated = request.schema.safeParse(request.fallback());
      if (validated.success) {
        logger.warn(
          { operation: request.operation, code: error.code },
          'Falling back to curated content after a provider failure',
        );
        return {
          data: validated.data as z.infer<S>,
          source: 'CURATED_FALLBACK',
          usage: { inputTokens: 0, outputTokens: 0 },
          model: active.model,
          provider: active.name,
          repairAttempts: 0,
        };
      }
    }

    throw error;
  }
}

/** Accounting only: operation, model and token counts. No prompts, no answers. */
async function recordUsage<S extends ZodTypeAny>(
  userId: string,
  request: LlmRequest<S>,
  result: Pick<LlmResult<unknown>, 'model' | 'provider' | 'usage'>,
  durationMs: number,
  succeeded: boolean,
): Promise<void> {
  try {
    await prisma.aiUsageLog.create({
      data: {
        userId,
        operation: request.operation,
        provider: result.provider,
        model: result.model,
        inputTokens: result.usage.inputTokens,
        outputTokens: result.usage.outputTokens,
        durationMs,
        succeeded,
      },
    });
  } catch (error) {
    logger.warn({ err: error }, 'Could not write the AI usage log');
  }
}

/**
 * Per-user daily guard on AI-backed interview sessions, on top of the
 * IP/user rate limiter.
 */
export async function assertSessionQuota(userId: string): Promise<void> {
  const config = env();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const count = await prisma.interviewSession.count({
    where: { userId, createdAt: { gte: since } },
  });

  if (count >= config.MAX_INTERVIEW_SESSIONS_PER_DAY) {
    throw new AppError(
      'USAGE_LIMIT_REACHED',
      `You have started ${config.MAX_INTERVIEW_SESSIONS_PER_DAY} practice interviews in the last 24 hours. Please continue tomorrow.`,
    );
  }
}
