import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import {
  evaluationSchemaForMode,
  interviewSummarySchema,
  INTERVIEW_MODES,
  skillGapReportSchema,
} from '@career-prep/shared';
import {
  restoreOptionalNulls,
  toOpenAiStrictSchema,
} from '../../src/services/llm/openaiSchema.js';
import { generatedQuestionsSchema } from '../../src/services/interview/schemas.js';

type JsonSchema = Record<string, unknown>;

function jsonSchemaFor(schema: z.ZodTypeAny): JsonSchema {
  const converted = zodToJsonSchema(schema, {
    $refStrategy: 'none',
    target: 'jsonSchema7',
  }) as JsonSchema;
  delete converted.$schema;
  return converted;
}

/**
 * Walks every object node and asserts the two rules OpenAI strict mode enforces,
 * which is exactly what a 400 would otherwise tell us at runtime.
 */
function assertStrictCompliant(node: unknown, path = '(root)'): void {
  if (Array.isArray(node)) {
    node.forEach((entry, index) => assertStrictCompliant(entry, `${path}[${index}]`));
    return;
  }
  if (typeof node !== 'object' || node === null) return;

  const schema = node as JsonSchema;

  if (schema.properties && typeof schema.properties === 'object') {
    const keys = Object.keys(schema.properties as JsonSchema);
    expect(schema.additionalProperties, `${path}: additionalProperties`).toBe(false);
    expect([...(schema.required as string[])].sort(), `${path}: required`).toEqual([...keys].sort());

    for (const key of keys) {
      assertStrictCompliant((schema.properties as JsonSchema)[key], `${path}.${key}`);
    }
  }

  expect(schema.default, `${path}: default must be stripped`).toBeUndefined();

  for (const container of ['items', 'anyOf', 'allOf', 'oneOf', 'not']) {
    if (schema[container] !== undefined) {
      assertStrictCompliant(schema[container], `${path}.${container}`);
    }
  }
}

describe('toOpenAiStrictSchema', () => {
  it('makes every property required and forbids extra properties', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(z.object({ a: z.string(), b: z.string().optional() })),
    );

    expect(strict.required).toEqual(['a', 'b']);
    expect(strict.additionalProperties).toBe(false);
  });

  it('expresses an originally optional property as nullable', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(z.object({ kept: z.string(), maybe: z.string().optional() })),
    );
    const properties = strict.properties as JsonSchema;

    expect((properties.kept as JsonSchema).type).toBe('string');
    expect((properties.maybe as JsonSchema).type).toEqual(['string', 'null']);
  });

  it('treats a defaulted property as optional and strips the default', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(z.object({ flag: z.boolean().default(false) })),
    );
    const flag = (strict.properties as JsonSchema).flag as JsonSchema;

    expect(flag.type).toEqual(['boolean', 'null']);
    expect(flag.default).toBeUndefined();
  });

  it('converts a small integer range into an enum, because ranges are not enforced', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(z.object({ score: z.number().int().min(1).max(5) })),
    );
    const score = (strict.properties as JsonSchema).score as JsonSchema;

    expect(score.enum).toEqual([1, 2, 3, 4, 5]);
    expect(score.minimum).toBeUndefined();
    expect(score.maximum).toBeUndefined();
  });

  it('leaves a wide integer range as a range', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(z.object({ overall: z.number().int().min(0).max(100) })),
    );
    const overall = (strict.properties as JsonSchema).overall as JsonSchema;

    expect(overall.enum).toBeUndefined();
    expect(overall.minimum).toBe(0);
    expect(overall.maximum).toBe(100);
  });

  it('applies the rules inside array items', () => {
    const strict = toOpenAiStrictSchema(
      jsonSchemaFor(
        z.object({
          rows: z.array(z.object({ name: z.string(), note: z.string().optional() })),
        }),
      ),
    );
    const items = ((strict.properties as JsonSchema).rows as JsonSchema).items as JsonSchema;

    expect(items.required).toEqual(['name', 'note']);
    expect(items.additionalProperties).toBe(false);
  });

  it('does not modify the schema it was given', () => {
    const original = jsonSchemaFor(z.object({ a: z.string(), b: z.string().optional() }));
    const snapshot = JSON.stringify(original);

    toOpenAiStrictSchema(original);

    // The Anthropic provider keeps using the unmodified schema.
    expect(JSON.stringify(original)).toBe(snapshot);
  });

  const realSchemas: Array<[string, z.ZodTypeAny]> = [
    ['skillGapReport', skillGapReportSchema],
    ['interviewSummary', interviewSummarySchema],
    ['generatedQuestions', generatedQuestionsSchema],
    ...INTERVIEW_MODES.map(
      (mode) => [`evaluation:${mode}`, evaluationSchemaForMode(mode)] as [string, z.ZodTypeAny],
    ),
  ];

  it.each(realSchemas)('%s satisfies every strict-mode rule', (_name, schema) => {
    assertStrictCompliant(toOpenAiStrictSchema(jsonSchemaFor(schema)));
  });

  it('produces a different schema per interview mode', () => {
    // Regression: one shared schema name once caused every mode to be sent the
    // first mode's dimensions.
    const perMode = INTERVIEW_MODES.map((mode) =>
      JSON.stringify(toOpenAiStrictSchema(jsonSchemaFor(evaluationSchemaForMode(mode)))),
    );
    expect(new Set(perMode).size).toBe(INTERVIEW_MODES.length);

    const technical = perMode[INTERVIEW_MODES.indexOf('TECHNICAL')] as string;
    expect(technical).toContain('technicalAccuracy');
    expect(technical).not.toContain('calculationAccuracy');
  });

  it.each(realSchemas)('%s has its 1-5 score fields enumerated', (_name, schema) => {
    const strict = toOpenAiStrictSchema(jsonSchemaFor(schema));
    const serialised = JSON.stringify(strict);

    // No 1-5 range should survive as a bound the model is free to ignore.
    expect(serialised).not.toMatch(/"minimum":1,"maximum":5/);
  });
});

describe('restoreOptionalNulls', () => {
  it('drops a null that stood in for an absent optional field', () => {
    const schema = z.object({ flag: z.boolean().default(false), name: z.string() });
    const restored = restoreOptionalNulls({ flag: null, name: 'x' }, jsonSchemaFor(schema));

    expect(restored).toEqual({ name: 'x' });
    // The Zod default now applies rather than failing on null.
    expect(schema.parse(restored)).toEqual({ flag: false, name: 'x' });
  });

  it('keeps a null in a field that is genuinely nullable and required', () => {
    const schema = z.object({ evidence: z.string().nullable() });
    const restored = restoreOptionalNulls({ evidence: null }, jsonSchemaFor(schema));

    expect(restored).toEqual({ evidence: null });
    expect(schema.parse(restored)).toEqual({ evidence: null });
  });

  it('works through arrays of objects', () => {
    const schema = z.object({
      rows: z.array(z.object({ note: z.string().optional(), id: z.string() })),
    });
    const restored = restoreOptionalNulls(
      { rows: [{ note: null, id: 'a' }, { note: 'keep', id: 'b' }] },
      jsonSchemaFor(schema),
    );

    expect(restored).toEqual({ rows: [{ id: 'a' }, { note: 'keep', id: 'b' }] });
  });

  it('leaves non-null values untouched', () => {
    const schema = z.object({ flag: z.boolean().default(false) });
    expect(restoreOptionalNulls({ flag: true }, jsonSchemaFor(schema))).toEqual({ flag: true });
  });

  it('round-trips a full evaluation payload with every optional nulled out', () => {
    const schema = evaluationSchemaForMode('TECHNICAL');
    const payload = {
      strengths: [{ title: 'Clear', description: 'Explains the concept accurately.' }],
      weaknesses: [],
      suggestedImprovements: [
        { title: 'Add an example', description: 'Give a concrete case.', actionableStep: 'Pick one project.' },
      ],
      scores: { technicalAccuracy: 4, reasoning: 3, completeness: 3, practicalApplicability: 4 },
      overallScore: 63,
      summary: 'A solid answer.',
      // Strict mode requires these keys; null means "not provided".
      insufficientAnswer: null,
      evaluationLimitation: null,
    };

    const restored = restoreOptionalNulls(payload, jsonSchemaFor(schema));
    const result = schema.safeParse(restored);

    expect(result.success).toBe(true);
    expect(result.success && result.data.insufficientAnswer).toBe(false);
    expect(result.success && result.data.evaluationLimitation).toBeNull();
  });
});
