import type { ZodTypeAny, z } from 'zod';

/** The operations the app asks a model for. Used for usage accounting and logs. */
export type LlmOperation =
  | 'analyzeSkillGaps'
  | 'analyzeResumeFit'
  | 'generateInterviewQuestions'
  | 'evaluateInterviewAnswer'
  | 'generateInterviewSummary';

export type ContentSourceName = 'AI_GENERATED' | 'CURATED_FALLBACK';

/**
 * A request is split into trusted instructions and untrusted data on purpose.
 * `systemPrompt` and `task` are written by us and are the only place rules live.
 * Everything in `untrustedInputs` comes from a resume, a job description or a
 * candidate answer, and is passed as fenced data the model is told not to obey.
 */
export interface LlmRequest<S extends ZodTypeAny> {
  operation: LlmOperation;
  systemPrompt: string;
  /** Trusted, app-generated framing for the task (role, difficulty, counts). */
  task: string;
  untrustedInputs: UntrustedInput[];
  schema: S;
  schemaName: string;
  maxOutputTokens?: number;
  /**
   * Deterministic, curated content used when no provider is available. Required
   * so every AI-backed feature has a working path without an API key, and so a
   * provider outage degrades instead of failing.
   */
  fallback: () => z.infer<S>;
}

export interface UntrustedInput {
  /** Short label such as `resume_text`. Shown to the model as the block name. */
  label: string;
  value: string;
}

export interface LlmResult<T> {
  data: T;
  /** Whether this came from the model or from curated content. Never conflated. */
  source: ContentSourceName;
  usage: { inputTokens: number; outputTokens: number };
  model: string;
  provider: string;
  /** Number of extra attempts spent getting schema-valid output. */
  repairAttempts: number;
}

export interface LlmProvider {
  readonly name: string;
  readonly model: string;
  complete<S extends ZodTypeAny>(request: LlmRequest<S>): Promise<LlmResult<z.infer<S>>>;
}
