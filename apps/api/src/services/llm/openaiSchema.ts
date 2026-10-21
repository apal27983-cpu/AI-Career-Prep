/**
 * Adapts a JSON Schema generated from our Zod schemas to what OpenAI's strict
 * structured output mode requires.
 *
 * Strict mode is worth the adaptation: without it the schema is only a hint, and
 * the model returns values outside the stated bounds (measured: 1-5 score fields
 * coming back as 8 and 9). With it, the structure and the enumerated values are
 * enforced by the decoder, so the first attempt is usually valid.
 *
 * Two rules drive everything here:
 *  1. Every property must appear in `required`, and `additionalProperties` must
 *     be false. Optionality is expressed by allowing null instead.
 *  2. Numeric ranges are not enforced, but `enum` is. A small integer range is
 *     therefore better expressed as an enumeration of its values.
 */

type JsonSchema = Record<string, unknown>;

/** Integer ranges up to this many values become an enum. */
const MAX_ENUM_SPAN = 20;

function isPlainObject(value: unknown): value is JsonSchema {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asTypeList(type: unknown): string[] {
  if (typeof type === 'string') return [type];
  if (Array.isArray(type)) return type.filter((entry): entry is string => typeof entry === 'string');
  return [];
}

/**
 * `{ type: 'integer', minimum: 1, maximum: 5 }` becomes an enum of 1..5, which
 * strict mode enforces. Wider ranges are left alone.
 */
function enumerateBoundedInteger(node: JsonSchema): boolean {
  const types = asTypeList(node.type);
  if (types.length !== 1 || types[0] !== 'integer') return false;
  if (node.enum !== undefined) return false;

  const min = node.minimum;
  const max = node.maximum;
  if (typeof min !== 'number' || typeof max !== 'number') return false;
  if (!Number.isInteger(min) || !Number.isInteger(max)) return false;

  const span = max - min + 1;
  if (span < 2 || span > MAX_ENUM_SPAN) return false;

  node.enum = Array.from({ length: span }, (_, index) => min + index);
  delete node.minimum;
  delete node.maximum;
  return true;
}

/** Keywords strict mode has no use for, or actively rejects. */
const DROPPED_KEYWORDS = ['default', '$schema', 'definitions', '$defs'] as const;

function transform(node: unknown): void {
  if (Array.isArray(node)) {
    for (const entry of node) transform(entry);
    return;
  }
  if (!isPlainObject(node)) return;

  for (const keyword of DROPPED_KEYWORDS) delete node[keyword];

  enumerateBoundedInteger(node);

  if (isPlainObject(node.properties)) {
    const properties = node.properties;
    const keys = Object.keys(properties);
    const originallyRequired = new Set(
      Array.isArray(node.required)
        ? node.required.filter((key): key is string => typeof key === 'string')
        : [],
    );

    for (const key of keys) {
      const child = properties[key];
      if (!isPlainObject(child)) continue;

      // An optional property becomes required-but-nullable. The response side
      // turns that null back into "absent" so Zod defaults still apply.
      if (!originallyRequired.has(key)) {
        const types = asTypeList(child.type);
        if (types.length > 0 && !types.includes('null')) {
          child.type = [...types, 'null'];
        }
      }
      transform(child);
    }

    node.required = keys;
    node.additionalProperties = false;
  }

  // Recurse through the remaining schema containers.
  for (const key of ['items', 'anyOf', 'allOf', 'oneOf', 'not', 'prefixItems']) {
    if (node[key] !== undefined) transform(node[key]);
  }
}

/**
 * Returns a deep copy adapted for strict mode. The input is not modified, so the
 * Anthropic provider keeps using the unmodified schema.
 */
export function toOpenAiStrictSchema(schema: JsonSchema): JsonSchema {
  const copy = structuredClone(schema) as JsonSchema;
  transform(copy);
  return copy;
}

/**
 * Undoes rule 1 on the way back: a null in a slot that the original schema did
 * not require means "not provided", so it is removed and the Zod schema's own
 * default or optionality takes over. Nulls in genuinely nullable fields are
 * left exactly as they are, which is why this walks the ORIGINAL schema.
 */
export function restoreOptionalNulls(value: unknown, originalSchema: JsonSchema): unknown {
  return walk(value, originalSchema);
}

function walk(value: unknown, schema: unknown): unknown {
  if (!isPlainObject(schema)) return value;

  if (Array.isArray(value)) {
    const items = schema.items;
    if (items === undefined) return value;
    return value.map((entry) => walk(entry, items));
  }

  if (!isPlainObject(value)) return value;
  if (!isPlainObject(schema.properties)) return value;

  const properties = schema.properties;
  const required = new Set(
    Array.isArray(schema.required)
      ? schema.required.filter((key): key is string => typeof key === 'string')
      : [],
  );

  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value)) {
    const childSchema = properties[key];

    if (entry === null && !required.has(key)) {
      // Was optional in our schema; drop it so `.default(...)` applies.
      continue;
    }
    out[key] = childSchema === undefined ? entry : walk(entry, childSchema);
  }
  return out;
}
