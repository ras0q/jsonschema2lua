import { convertSchema } from "./src/convert.ts";
import { emitLua } from "./src/emit_lua.ts";
import { loadSchema, loadSchemaFromText } from "./src/load_schema.ts";
import type {
  ConvertOptions,
  ConvertResult,
  EmitOptions,
} from "./src/types.ts";

export { convertSchema, emitLua, loadSchema, loadSchemaFromText };
export type { ConvertOptions, ConvertResult, EmitOptions };

/** Generate Lua annotations from a JSON Schema file path. */
export async function generateFromFile(
  inputPath: string,
  convertOptions: ConvertOptions = {},
  emitOptions: EmitOptions = {},
): Promise<string> {
  const { schema } = await loadSchema(inputPath);
  const converted = convertSchema(schema, convertOptions);
  return emitLua(converted, emitOptions);
}

/** Generate Lua annotations from a JSON Schema string. */
export async function generateFromText(
  text: string,
  convertOptions: ConvertOptions = {},
  emitOptions: EmitOptions = {},
  source = "<stdin>",
): Promise<string> {
  const { schema } = await loadSchemaFromText(text, source);
  const converted = convertSchema(schema, convertOptions);
  return emitLua(converted, emitOptions);
}

/** Generate Lua annotations from an in-memory JSON Schema document. */
export function generateFromSchema(
  schema: Parameters<typeof convertSchema>[0],
  convertOptions: ConvertOptions = {},
  emitOptions: EmitOptions = {},
): string {
  const converted = convertSchema(schema, convertOptions);
  return emitLua(converted, emitOptions);
}

export const version = "0.1.0";
