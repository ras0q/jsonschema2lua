import $RefParser from "@apidevtools/json-schema-ref-parser";
import type { JsonSchema } from "./types.ts";

/**
 * Parse a schema file and resolve local file references while preserving internal
 * `$ref` pointers for named type generation.
 */
export async function resolveRefs(schemaPath: string): Promise<JsonSchema> {
  const schema = await $RefParser.parse(schemaPath);
  return schema as JsonSchema;
}

/**
 * Parse JSON Schema text and resolve references. Internal `$ref` pointers are
 * preserved for named type generation.
 */
export async function resolveRefsFromText(text: string): Promise<JsonSchema> {
  const schema = JSON.parse(text);
  const resolved = await $RefParser.parse(schema);
  return resolved as JsonSchema;
}
