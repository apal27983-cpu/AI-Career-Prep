import type { ZodTypeAny, z } from 'zod';
import { AppError } from '../../utils/errors.js';
import type { LlmProvider, LlmRequest, LlmResult } from './types.js';

/**
 * Development/test provider. It makes no network calls and returns the caller's
 * own curated content, validated against the same schema the real provider is
 * held to. Results are labelled CURATED_FALLBACK so nothing is ever presented
 * as AI-generated when it is not.
 */
export class MockProvider implements LlmProvider {
  readonly name = 'mock';
  readonly model = 'curated-fallback';

  async complete<S extends ZodTypeAny>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>>> {
    const candidate = request.fallback();
    const validated = request.schema.safeParse(candidate);

    if (!validated.success) {
      // A broken fallback is a bug in our own content, not a provider problem.
      throw new AppError('INTERNAL_ERROR', 'Something went wrong on our side. Please try again.', {
        logContext: {
          operation: request.operation,
          reason: 'curated_fallback_failed_schema',
          issues: validated.error.issues.slice(0, 4).map((issue) => issue.message),
        },
      });
    }

    return {
      data: validated.data as z.infer<S>,
      source: 'CURATED_FALLBACK',
      usage: { inputTokens: 0, outputTokens: 0 },
      model: this.model,
      provider: this.name,
      repairAttempts: 0,
    };
  }
}
