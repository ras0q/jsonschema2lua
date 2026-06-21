/** Supported JSON Schema value after reference parsing. */
export type JsonSchema = {
  $schema?: string;
  $ref?: string;
  title?: string;
  description?: string;
  type?: string | string[];
  properties?: Record<string, JsonSchema>;
  required?: string[];
  items?: JsonSchema;
  additionalProperties?: boolean | JsonSchema;
  enum?: unknown[];
  const?: unknown;
  anyOf?: JsonSchema[];
  oneOf?: JsonSchema[];
  $defs?: Record<string, JsonSchema>;
  [key: string]: unknown;
};

/** Internal Lua type representation used before emission. */
export type LuaType =
  | { kind: "any" }
  | { kind: "nil" }
  | { kind: "primitive"; name: "string" | "number" | "integer" | "boolean" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "array"; item: LuaType }
  | { kind: "map"; key: LuaType; value: LuaType }
  | { kind: "union"; types: LuaType[] }
  | { kind: "ref"; name: string }
  | { kind: "class"; name: string; fields: LuaField[] };

/** Field on a generated Lua class. */
export type LuaField = {
  name: string;
  type: LuaType;
  optional: boolean;
  description?: string;
};

/** Named class collected during conversion. */
export type LuaClass = {
  name: string;
  fields: LuaField[];
  description?: string;
};

/** Options that control schema-to-Lua conversion. */
export type ConvertOptions = {
  rootName?: string;
  strict?: boolean;
};

/** Result of converting a JSON Schema document. */
export type ConvertResult = {
  rootName: string;
  classes: LuaClass[];
  rootType?: LuaType;
};

/** Options that control Lua annotation emission. */
export type EmitOptions = {
  banner?: boolean;
  version?: string;
};

/** Validation keywords ignored unless strict mode is enabled. */
export const UNSUPPORTED_KEYWORDS = [
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "minLength",
  "maxLength",
  "pattern",
  "format",
  "minItems",
  "maxItems",
  "uniqueItems",
  "multipleOf",
] as const;
