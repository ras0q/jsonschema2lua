import type { JsonSchema } from "./types.ts";

/**
 * Merge `allOf` subschemas into the current schema so composed object shapes
 * retain discriminator fields alongside referenced `$defs`.
 */
export function mergeAllOfSchema(
  schema: JsonSchema,
  defs: Record<string, JsonSchema>,
): JsonSchema {
  if (!schema.allOf || schema.allOf.length === 0) {
    return schema;
  }

  const { allOf, ...base } = schema;
  let merged = stripCompositionKeywords(base);

  for (const part of allOf) {
    const resolved = resolveSchemaForMerge(part, defs);
    const resolvedMerged = mergeAllOfSchema(resolved, defs);
    merged = mergeObjectSchemas(merged, resolvedMerged);
  }

  return merged;
}

/** Return a referenced `$defs` name when a union branch is only a `$ref` wrapper. */
export function tryPureRefBranch(
  schema: JsonSchema,
  qualifyName: (name: string) => string,
): string | null {
  if (schema.$ref) {
    return qualifyName(refFragmentToDefName(schema.$ref));
  }

  if (!schema.allOf || schema.allOf.length !== 1) {
    return null;
  }

  if (hasMeaningfulOwnSchema(schema, ["allOf", "description", "title"])) {
    return null;
  }

  const part = schema.allOf[0];
  if (part.$ref) {
    return qualifyName(refFragmentToDefName(part.$ref));
  }

  return null;
}

/** Build a class name suffix from a string discriminator const value. */
export function discriminatorSuffix(value: string): string {
  return value
    .split("_")
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/** Find a string `const` property commonly used as a discriminator. */
export function findDiscriminatorConst(schema: JsonSchema): string | undefined {
  for (const property of Object.values(schema.properties ?? {})) {
    if (typeof property?.const === "string") {
      return property.const;
    }
    if (
      property?.enum?.length === 1 &&
      typeof property.enum[0] === "string"
    ) {
      return property.enum[0];
    }
  }
}

export function variantNameFromSchema(
  baseName: string,
  schema: JsonSchema,
  index: number,
): string {
  const discriminator = findDiscriminatorConst(schema);
  if (discriminator) {
    return `${baseName}${discriminatorSuffix(discriminator)}`;
  }
  return `${baseName}Variant${index + 1}`;
}

function stripCompositionKeywords(schema: JsonSchema): JsonSchema {
  const { allOf: _allOf, anyOf: _anyOf, oneOf: _oneOf, ...rest } = schema;
  return rest;
}

function resolveSchemaForMerge(
  schema: JsonSchema,
  defs: Record<string, JsonSchema>,
): JsonSchema {
  if (schema.$ref) {
    const defName = refFragmentToDefName(schema.$ref);
    const def = defs[defName];
    if (def) {
      return structuredClone(def);
    }
  }
  return schema;
}

function refFragmentToDefName(ref: string): string {
  const segments = (ref.split("#").pop() ?? ref).split("/").filter(Boolean);
  return segments.at(-1) ?? "";
}

function hasMeaningfulOwnSchema(
  schema: JsonSchema,
  ignoreKeys: string[],
): boolean {
  const ignored = new Set(ignoreKeys);
  return Object.keys(schema).some((key) => !ignored.has(key));
}

function mergeObjectSchemas(
  base: JsonSchema,
  extension: JsonSchema,
): JsonSchema {
  const baseProps = base.properties ?? {};
  const extProps = extension.properties ?? {};
  const mergedProps = { ...extProps, ...baseProps };

  const mergedRequired = [
    ...new Set([...(extension.required ?? []), ...(base.required ?? [])]),
  ].sort();

  const mergedType = mergeTypeKeyword(base.type, extension.type);

  return {
    ...extension,
    ...base,
    type: mergedType,
    properties: Object.keys(mergedProps).length > 0 ? mergedProps : undefined,
    required: mergedRequired.length > 0 ? mergedRequired : undefined,
    description: base.description ?? extension.description,
    additionalProperties: base.additionalProperties ??
      extension.additionalProperties,
  };
}

function mergeTypeKeyword(
  left: string | string[] | undefined,
  right: string | string[] | undefined,
): string | string[] | undefined {
  if (left === undefined) {
    return right;
  }
  if (right === undefined) {
    return left;
  }

  const leftTypes = normalizeTypes(left);
  const rightTypes = normalizeTypes(right);
  if (leftTypes.includes("object") || rightTypes.includes("object")) {
    return "object";
  }

  return left;
}

function normalizeTypes(type: string | string[]): string[] {
  return Array.isArray(type) ? type : [type];
}
