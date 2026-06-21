import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { text } from "node:stream/consumers";
import { parseArgs } from "node:util";
import { convertSchema } from "./convert.ts";
import { emitLua } from "./emit_lua.ts";
import { loadSchema, loadSchemaFromText } from "./load_schema.ts";

const VERSION = "0.1.0";

const HELP_TEXT =
  `jsonschema2lua - Generate LuaLS type annotations from JSON Schema

Usage:
  jsonschema2lua [<input>]
  jsonschema2lua -                         Read schema from stdin
  cat schema.json | jsonschema2lua

Arguments:
  <input>          JSON Schema file path, or "-" for stdin

Options:
  --out <path>     Write generated annotations to a file
  --name <name>    Override the root Lua class name
  --strict         Fail on unsupported schema features
  --banner         Add a generated-file banner (default: enabled)
  --no-banner      Disable the generated-file banner
  --version        Print the CLI version
  --help           Print help text
`;

/** Parsed CLI flags shared by the entrypoint and tests. */
export type CliOptions = {
  input?: string;
  out?: string;
  name?: string;
  strict: boolean;
  banner: boolean;
  help: boolean;
  version: boolean;
};

/** Parse command-line arguments into structured options. */
export function parseCliArgs(args: string[]): CliOptions {
  const { values, positionals } = parseArgs({
    args,
    options: {
      out: { type: "string" },
      name: { type: "string" },
      strict: { type: "boolean", default: false },
      banner: { type: "boolean", default: true },
      help: { type: "boolean", default: false, short: "h" },
      version: { type: "boolean", default: false, short: "V" },
      "no-banner": { type: "boolean", default: false },
    },
    allowPositionals: true,
  });

  const input = positionals.length > 0 ? positionals[0] : undefined;

  return {
    input,
    out: values.out,
    name: values.name,
    strict: values.strict === true,
    banner: values.banner !== false && values["no-banner"] !== true,
    help: values.help === true,
    version: values.version === true,
  };
}

/** Read all bytes from standard input. */
export async function readStdin(): Promise<string> {
  return await text(process.stdin);
}

/** Resolve schema input from a file path, "-", or piped stdin. */
export async function loadSchemaInput(input?: string): Promise<
  Awaited<ReturnType<typeof loadSchema>>
> {
  if (input && input !== "-") {
    return await loadSchema(input);
  }

  if (!input && process.stdin.isTTY) {
    throw new Error(
      'missing input: provide a file path, use "-", or pipe JSON Schema to stdin',
    );
  }

  const schemaText = await readStdin();
  if (schemaText.trim().length === 0) {
    throw new Error("empty input from stdin");
  }

  return await loadSchemaFromText(schemaText);
}

/** Run the jsonschema2lua CLI with the given argument list. */
export async function runCli(args: string[]): Promise<number> {
  const options = parseCliArgs(args);

  if (options.help) {
    console.log(HELP_TEXT);
    return 0;
  }

  if (options.version) {
    console.log(VERSION);
    return 0;
  }

  try {
    const { schema } = await loadSchemaInput(options.input);
    const converted = convertSchema(schema, {
      rootName: options.name,
      strict: options.strict,
    });
    const output = emitLua(converted, {
      banner: options.banner,
      version: VERSION,
    });

    if (options.out) {
      await mkdir(dirname(options.out), { recursive: true });
      await writeFile(options.out, output, "utf8");
    } else {
      process.stdout.write(output);
    }

    return 0;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`error: ${message}`);
    return 1;
  }
}

if (import.meta.main) {
  process.exit(await runCli(process.argv.slice(2)));
}
