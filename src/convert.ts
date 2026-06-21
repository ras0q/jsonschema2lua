import type {
  ConvertOptions,
  ConvertResult,
  JsonSchema,
  LuaAlias,
  LuaClass,
  LuaField,
  LuaType,
} from "./types.ts";
import { UNSUPPORTED_KEYWORDS } from "./types.ts";

type ConverterContext = {
  strict: boolean;
  classPrefix: string;
  classes: Map<string, LuaClass>;
  aliases: Map<string, LuaAlias>;
};

/**
 * Convert a JSON Schema document into the internal Lua type model.
 * Named classes and aliases from `$defs` are collected in deterministic
 * alphabetical order.
 */
export function convertSchema(
  schema: JsonSchema,
  options: ConvertOptions = {},
): ConvertResult {
  const context: ConverterContext = {
    strict: options.strict ?? false,
    classPrefix: options.classPrefix ?? "",
    classes: new Map(),
    aliases: new Map(),
  };

  if (schema.$defs) {
    const defNames = Object.keys(schema.$defs).sort();
    for (const name of defNames) {
      const defSchema = schema.$defs[name];
      const qualifiedName = qualifyClassName(context, name);
      if (isObjectSchema(defSchema)) {
        convertObjectClass(defSchema, qualifiedName, context);
      } else {
        convertNamedType(defSchema, qualifiedName, context);
      }
    }
  }

  const rootName = qualifyClassName(
    context,
    resolveRootName(schema, options.rootName),
  );
  const rootSchema = stripDocumentKeywords(schema);
  const rootType = convertType(rootSchema, context, rootName);

  if (rootType.kind === "class") {
    registerClass(context, {
      name: rootType.name,
      fields: rootType.fields,
      description: schema.description,
    });
  }

  const classes = [...context.classes.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );
  const aliases = [...context.aliases.values()].sort((a, b) =>
    a.name.localeCompare(b.name)
  );

  return {
    rootName,
    classes,
    aliases,
    rootType: rootType.kind === "class" ? undefined : rootType,
  };
}

function resolveRootName(schema: JsonSchema, override?: string): string {
  if (override) {
    return override;
  }
  if (typeof schema.title === "string" && schema.title.length > 0) {
    return schema.title;
  }
  return "Root";
}

function stripDocumentKeywords(schema: JsonSchema): JsonSchema {
  const { $defs: _defs, $schema: _schema, ...rest } = schema;
  return rest;
}

function registerClass(context: ConverterContext, luaClass: LuaClass): void {
  context.classes.set(luaClass.name, luaClass);
}

function registerAlias(context: ConverterContext, alias: LuaAlias): void {
  context.aliases.set(alias.name, alias);
}

function convertObjectClass(
  schema: JsonSchema,
  className: string,
  context: ConverterContext,
): LuaType {
  assertSupported(schema, context.strict);
  const fields = convertProperties(schema, className, context);
  registerClass(context, {
    name: className,
    fields,
    description: schema.description,
  });
  return { kind: "ref", name: className };
}

function convertNamedType(
  schema: JsonSchema,
  name: string,
  context: ConverterContext,
): LuaType {
  assertSupported(schema, context.strict);
  const type = convertType(schema, context, name);

  if (type.kind === "class") {
    registerClass(context, {
      name: type.name,
      fields: type.fields,
      description: schema.description,
    });
    return { kind: "ref", name: type.name };
  }

  registerAlias(context, {
    name,
    type,
    description: schema.description,
  });
  return { kind: "ref", name };
}

function convertType(
  schema: JsonSchema,
  context: ConverterContext,
  classNameHint: string,
): LuaType {
  assertSupported(schema, context.strict);

  if (schema.$ref) {
    return { kind: "ref", name: refToClassName(schema.$ref, context) };
  }

  if (schema.enum !== undefined) {
    return convertEnum(schema.enum);
  }

  if (schema.const !== undefined) {
    return convertConst(schema.const);
  }

  if (schema.allOf) {
    return unionTypes(
      schema.allOf.map((item) => convertType(item, context, classNameHint)),
    );
  }

  if (schema.anyOf) {
    return unionTypes(
      schema.anyOf.map((item) => convertType(item, context, classNameHint)),
    );
  }

  if (schema.oneOf) {
    return unionTypes(
      schema.oneOf.map((item) => convertType(item, context, classNameHint)),
    );
  }

  const types = normalizeTypes(schema.type);
  if (types.length > 1) {
    return unionTypes(
      types.map((type) =>
        convertTypedSchema({ ...schema, type }, context, classNameHint)
      ),
    );
  }

  return convertTypedSchema(schema, context, classNameHint);
}

function convertTypedSchema(
  schema: JsonSchema,
  context: ConverterContext,
  classNameHint: string,
): LuaType {
  const type = normalizeTypes(schema.type)[0];

  switch (type) {
    case "string":
      return { kind: "primitive", name: "string" };
    case "number":
      return { kind: "primitive", name: "number" };
    case "integer":
      return { kind: "primitive", name: "integer" };
    case "boolean":
      return { kind: "primitive", name: "boolean" };
    case "null":
      return { kind: "nil" };
    case "array":
      return convertArray(schema, context, classNameHint);
    case "object":
      return convertObject(schema, context, classNameHint);
    default:
      if (schema.properties || schema.additionalProperties !== undefined) {
        return convertObject(schema, context, classNameHint);
      }
      if (schema.items) {
        return convertArray(schema, context, classNameHint);
      }
      return { kind: "any" };
  }
}

function convertArray(
  schema: JsonSchema,
  context: ConverterContext,
  classNameHint: string,
): LuaType {
  const items = schema.items ?? {};
  const itemType = convertType(items, context, `${classNameHint}Item`);
  return { kind: "array", item: itemType };
}

function convertObject(
  schema: JsonSchema,
  context: ConverterContext,
  classNameHint: string,
): LuaType {
  if (schema.properties) {
    const fields = convertProperties(schema, classNameHint, context);
    return { kind: "class", name: classNameHint, fields };
  }

  if (
    schema.additionalProperties !== undefined &&
    schema.additionalProperties !== false
  ) {
    const valueSchema = schema.additionalProperties === true
      ? {}
      : schema.additionalProperties;
    const valueType = convertType(
      valueSchema,
      context,
      `${classNameHint}Value`,
    );
    return {
      kind: "map",
      key: { kind: "primitive", name: "string" },
      value: valueType,
    };
  }

  return { kind: "any" };
}

function convertProperties(
  schema: JsonSchema,
  classNameHint: string,
  context: ConverterContext,
): LuaField[] {
  const required = new Set(schema.required ?? []);
  const propertyNames = Object.keys(schema.properties ?? {}).sort();

  return propertyNames.map((propertyName) => {
    const propertySchema = schema.properties![propertyName];
    const nestedClassName = toNestedClassName(classNameHint, propertyName);
    const propertyType = convertPropertyType(
      propertySchema,
      context,
      nestedClassName,
    );

    return {
      name: propertyName,
      type: propertyType,
      optional: !required.has(propertyName),
      description: propertySchema.description,
    };
  });
}

function convertPropertyType(
  schema: JsonSchema,
  context: ConverterContext,
  nestedClassName: string,
): LuaType {
  if (schema.$ref) {
    return convertType(schema, context, nestedClassName);
  }

  if (isInlineObjectSchema(schema)) {
    const classType = convertObjectClass(schema, nestedClassName, context);
    return classType;
  }

  const converted = convertType(schema, context, nestedClassName);
  if (converted.kind === "class") {
    registerClass(context, {
      name: converted.name,
      fields: converted.fields,
      description: schema.description,
    });
    return { kind: "ref", name: converted.name };
  }

  return converted;
}

function isObjectSchema(schema: JsonSchema): boolean {
  if (schema.$ref) {
    return false;
  }
  return isInlineObjectSchema(schema);
}

function isInlineObjectSchema(schema: JsonSchema): boolean {
  const types = normalizeTypes(schema.type);
  return types.includes("object") && schema.properties !== undefined;
}

function convertEnum(values: unknown[]): LuaType {
  const literals = values.map((value) => convertConst(value));
  return unionTypes(literals);
}

function convertConst(value: unknown): LuaType {
  if (typeof value === "string") {
    return { kind: "literal", value };
  }
  if (typeof value === "number") {
    return { kind: "literal", value };
  }
  if (typeof value === "boolean") {
    return { kind: "literal", value };
  }
  if (value === null) {
    return { kind: "nil" };
  }
  return { kind: "any" };
}

function unionTypes(types: LuaType[]): LuaType {
  const flattened = types.flatMap((type) =>
    type.kind === "union" ? type.types : [type]
  );
  const unique = dedupeTypes(flattened);
  if (unique.length === 0) {
    return { kind: "any" };
  }
  if (unique.length === 1) {
    return unique[0];
  }
  return { kind: "union", types: unique };
}

function dedupeTypes(types: LuaType[]): LuaType[] {
  const seen = new Set<string>();
  const result: LuaType[] = [];
  for (const type of types) {
    const key = typeKey(type);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(type);
  }
  return result;
}

function typeKey(type: LuaType): string {
  switch (type.kind) {
    case "any":
      return "any";
    case "nil":
      return "nil";
    case "primitive":
      return `primitive:${type.name}`;
    case "literal":
      return `literal:${typeof type.value}:${String(type.value)}`;
    case "array":
      return `array:${typeKey(type.item)}`;
    case "map":
      return `map:${typeKey(type.key)}:${typeKey(type.value)}`;
    case "union":
      return `union:${type.types.map(typeKey).sort().join("|")}`;
    case "ref":
      return `ref:${type.name}`;
    case "class":
      return `class:${type.name}`;
  }
}

function normalizeTypes(type: string | string[] | undefined): string[] {
  if (type === undefined) {
    return [];
  }
  return Array.isArray(type) ? type : [type];
}

function refToClassName(ref: string, context: ConverterContext): string {
  const fragment = ref.split("#").pop() ?? ref;
  const segments = fragment.split("/").filter(Boolean);
  const name = segments.at(-1) ?? "Root";
  return qualifyClassName(context, sanitizeClassName(name));
}

function qualifyClassName(context: ConverterContext, name: string): string {
  if (context.classPrefix.length === 0) {
    return name;
  }
  return `${context.classPrefix}${name}`;
}

function toNestedClassName(parentName: string, fieldName: string): string {
  const suffix = fieldName.charAt(0).toUpperCase() + fieldName.slice(1);
  return `${parentName}${suffix}`;
}

function sanitizeClassName(name: string): string {
  return name.replace(/[^A-Za-z0-9_]/g, "_");
}

function assertSupported(schema: JsonSchema, strict: boolean): void {
  if (!strict) {
    return;
  }

  for (const keyword of UNSUPPORTED_KEYWORDS) {
    if (keyword in schema) {
      throw new Error(`Unsupported keyword in strict mode: ${keyword}`);
    }
  }
}
