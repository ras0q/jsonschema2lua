# @ras0q/jsonschema2lua Specification

## Overview

`@ras0q/jsonschema2lua` is a Deno 2 CLI tool that generates LuaLS-compatible Lua type annotations from JSON Schema.

The initial implementation only targets JSON input using JSON Schema Draft 2020-12.

## Goals

- Generate readable Lua type annotations from JSON Schema.
- Support JSON Schema Draft 2020-12.
- Support `$ref` resolution for local schema definitions.
- Provide a Deno-first CLI.
- Use existing npm or JSR packages where appropriate.
- Produce deterministic output suitable for version control.

## Non-goals

- Runtime JSON validation.
- Full OpenAPI support.
- YAML input support in the initial version.
- Lua code generation beyond type annotations.
- Complete support for every JSON Schema validation keyword.
- Bidirectional conversion from Lua annotations back to JSON Schema.

## Package

Package name:

```txt
@ras0q/jsonschema2lua
```

Primary command:

```sh
jsonschema2lua
```

Expected usage:

```sh
deno run -A jsr:@ras0q/jsonschema2lua schema.json
```

or, after installation:

```sh
jsonschema2lua schema.json --name Config --out types.lua
```

## Runtime and Language

- Runtime: Deno 2
- Language: TypeScript
- Module format: ESM
- Distribution target: JSR
- Dependencies may be loaded from JSR or npm.

## Input

The initial version accepts one JSON file.

```sh
jsonschema2lua schema.json
```

The input file must be a JSON Schema document.

The default supported schema dialect is:

```txt
https://json-schema.org/draft/2020-12/schema
```

If `$schema` is omitted, the tool treats the input as Draft 2020-12.

## Output

The tool emits LuaLS-compatible annotations.

Example input:

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "User",
  "type": "object",
  "required": ["id", "name"],
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" },
    "email": { "type": "string" },
    "roles": {
      "type": "array",
      "items": { "type": "string" }
    }
  }
}
```

Expected output:

```lua
---@class User
---@field id integer
---@field name string
---@field email? string
---@field roles? string[]
```

## CLI Options

```txt
jsonschema2lua <input>
```

### `--out <path>`

Write generated annotations to a file.

If omitted, output is written to stdout.

### `--name <name>`

Override the root Lua class name.

If omitted, the tool uses the schema `title`.

If neither `--name` nor `title` is available, the root class name is `Root`.

### `--strict`

Fail on unsupported schema features.

Without `--strict`, unsupported validation-only keywords are ignored or emitted as comments when useful.

### `--banner`

Add a generated-file banner.

Default: enabled.

### `--no-banner`

Disable the generated-file banner.

### `--version`

Print the CLI version.

### `--help`

Print help text.

## Type Mapping

| JSON Schema | Lua annotation |
|---|---|
| `string` | `string` |
| `number` | `number` |
| `integer` | `integer` |
| `boolean` | `boolean` |
| `null` | `nil` |
| `array` | `T[]` |
| `object` | `---@class` |
| `enum` | literal union |
| `const` | literal |
| `anyOf` | union |
| `oneOf` | union |
| `$ref` | referenced class name |

## Object Mapping

A JSON Schema object becomes a Lua class.

Required properties become non-optional fields.

Optional properties use the LuaLS optional field marker `?`.

Example:

```json
{
  "type": "object",
  "required": ["id"],
  "properties": {
    "id": { "type": "integer" },
    "name": { "type": "string" }
  }
}
```

Output:

```lua
---@class Root
---@field id integer
---@field name? string
```

## Array Mapping

A homogeneous array becomes `T[]`.

Example:

```json
{
  "type": "array",
  "items": { "type": "string" }
}
```

Output type:

```lua
string[]
```

Tuple validation with `prefixItems` is not required for the initial version.

## Map Mapping

An object with `additionalProperties` becomes a Lua table map.

Example:

```json
{
  "type": "object",
  "additionalProperties": {
    "type": "string"
  }
}
```

Output type:

```lua
table<string, string>
```

## Enum and Const Mapping

String enums become literal unions.

Example:

```json
{
  "enum": ["draft", "published", "archived"]
}
```

Output type:

```lua
"draft"|"published"|"archived"
```

`const` becomes a single literal.

## Nullable Values

Draft 2020-12 represents nullable values using union types.

Example:

```json
{
  "type": ["string", "null"]
}
```

Output type:

```lua
string|nil
```

For optional nullable fields:

```lua
---@field name? string|nil
```

## References

The tool should resolve `$ref` before generation.

Initial support:

- Internal references such as `#/$defs/User`
- Local file references, if supported by the selected dependency

External HTTP references are optional for the initial version.

Recommended dependency:

```ts
import $RefParser from "npm:@apidevtools/json-schema-ref-parser";
```

## Definitions

Schemas under `$defs` should generate named Lua classes when they are object schemas.

Example:

```json
{
  "$defs": {
    "User": {
      "type": "object",
      "properties": {
        "id": { "type": "integer" }
      }
    }
  }
}
```

Output:

```lua
---@class User
---@field id? integer
```

## Descriptions

Schema `description` values should be preserved as comments when practical.

Example:

```json
{
  "type": "object",
  "properties": {
    "id": {
      "type": "integer",
      "description": "Stable user identifier."
    }
  }
}
```

Output:

```lua
---@class Root
---@field id? integer # Stable user identifier.
```

## Unsupported Keywords

The following validation keywords do not directly affect Lua type annotations and may be ignored in the initial version:

- `minimum`
- `maximum`
- `exclusiveMinimum`
- `exclusiveMaximum`
- `minLength`
- `maxLength`
- `pattern`
- `format`
- `minItems`
- `maxItems`
- `uniqueItems`
- `multipleOf`

In `--strict` mode, unsupported keywords should produce an error.

Without `--strict`, they may be ignored.

## Project Structure

```txt
.
├── deno.json
├── mod.ts
├── src
│   ├── cli.ts
│   ├── load_schema.ts
│   ├── resolve_refs.ts
│   ├── convert.ts
│   ├── emit_lua.ts
│   └── types.ts
└── tests
    ├── fixtures
    └── convert_test.ts
```

## Suggested Internal Model

```ts
type LuaType =
  | { kind: "any" }
  | { kind: "nil" }
  | { kind: "primitive"; name: "string" | "number" | "integer" | "boolean" }
  | { kind: "literal"; value: string | number | boolean }
  | { kind: "array"; item: LuaType }
  | { kind: "map"; key: LuaType; value: LuaType }
  | { kind: "union"; types: LuaType[] }
  | { kind: "ref"; name: string }
  | { kind: "class"; name: string; fields: LuaField[] };

type LuaField = {
  name: string;
  type: LuaType;
  optional: boolean;
  description?: string;
};
```

## Initial Milestone

Version `0.1.0` should support:

- JSON input
- Draft 2020-12 as the default dialect
- `type`
- `properties`
- `required`
- `items`
- `additionalProperties`
- `enum`
- `const`
- `$defs`
- internal `$ref`
- `anyOf`
- `oneOf`
- nullable unions
- stdout output
- `--out`
- `--name`
- basic tests

## Example Commands

```sh
deno task dev examples/user.schema.json
```

```sh
deno task dev examples/user.schema.json --name User --out user.lua
```

## Example `deno.json`

```json
{
  "name": "@ras0q/jsonschema2lua",
  "version": "0.1.0",
  "exports": {
    ".": "./mod.ts"
  },
  "tasks": {
    "dev": "deno run -A src/cli.ts",
    "test": "deno test -A",
    "check": "deno check mod.ts src/**/*.ts",
    "fmt": "deno fmt",
    "lint": "deno lint"
  },
  "imports": {
    "@std/path": "jsr:@std/path",
    "@std/fs": "jsr:@std/fs",
    "json-schema-ref-parser": "npm:@apidevtools/json-schema-ref-parser"
  }
}
```

## Release Criteria for 0.1.0

- CLI runs with Deno 2.
- JSON Schema Draft 2020-12 object schemas generate valid LuaLS annotations.
- Internal `$ref` under `$defs` works.
- Output is deterministic.
- Tests cover primitives, objects, arrays, maps, enums, refs, and nullable fierds.
- Unsupported keywords do not crash the generator unless `--strict` is enabled.
