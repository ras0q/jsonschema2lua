import { resolveRefs, resolveRefsFromText } from "./resolve_refs.ts";
import type { JsonSchema } from "./types.ts";

/** Loaded schema with its source path. */
export type LoadedSchema = {
  path: string;
  schema: JsonSchema;
};

/** Load and parse a JSON Schema file from disk. */
export async function loadSchema(path: string): Promise<LoadedSchema> {
  const schema = await resolveRefs(path);
  return { path, schema };
}

/** Load and parse a JSON Schema document from a JSON string. */
export async function loadSchemaFromText(
  text: string,
  source = "<stdin>",
): Promise<LoadedSchema> {
  const schema = await resolveRefsFromText(text);
  return { path: source, schema };
}
