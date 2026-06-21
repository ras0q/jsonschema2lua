import assert from "node:assert/strict";
import { join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { generateFromText } from "../mod.ts";
import { parseCliArgs, runCli } from "./cli.ts";

const projectRoot = join(fileURLToPath(new URL(".", import.meta.url)), "..");

Deno.test("parseCliArgs accepts optional input", () => {
  assert.equal(parseCliArgs([]).input, undefined);
  assert.equal(parseCliArgs(["-"]).input, "-");
  assert.equal(parseCliArgs(["schema.json"]).input, "schema.json");
});

Deno.test("loadSchemaFromText parses JSON Schema from a string", async () => {
  const output = await generateFromText(
    JSON.stringify({
      title: "Config",
      type: "object",
      properties: {
        enabled: { type: "boolean" },
      },
    }),
    {},
    { banner: false },
  );

  assert.match(output, /---@class Config/);
  assert.match(output, /---@field enabled\? boolean/);
});

Deno.test("runCli reads schema from stdin when input is omitted", async () => {
  const schema = JSON.stringify({
    title: "StdinUser",
    type: "object",
    required: ["id"],
    properties: {
      id: { type: "integer" },
    },
  });

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "--no-banner"],
    cwd: projectRoot,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(schema));
  await writer.close();

  const { code, stdout, stderr } = await child.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  assert.equal(code, 0, error);
  assert.match(output, /---@class StdinUser/);
  assert.match(output, /---@field id integer/);
});

Deno.test("runCli reads schema from stdin when input is '-'", async () => {
  const schema = JSON.stringify({
    type: "object",
    properties: {
      name: { type: "string" },
    },
  });

  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "-", "--no-banner"],
    cwd: projectRoot,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  const writer = child.stdin.getWriter();
  await writer.write(new TextEncoder().encode(schema));
  await writer.close();

  const { code, stdout, stderr } = await child.output();
  const output = new TextDecoder().decode(stdout);
  const error = new TextDecoder().decode(stderr);

  assert.equal(code, 0, error);
  assert.match(output, /---@class Root/);
  assert.match(output, /---@field name\? string/);
});

Deno.test("runCli fails on empty stdin", async () => {
  const command = new Deno.Command(Deno.execPath(), {
    args: ["run", "-A", "src/cli.ts", "-"],
    cwd: projectRoot,
    stdin: "piped",
    stdout: "piped",
    stderr: "piped",
  });
  const child = command.spawn();
  await child.stdin.getWriter().close();

  const { code, stderr } = await child.output();
  const error = new TextDecoder().decode(stderr);

  assert.equal(code, 1);
  assert.match(error, /empty input from stdin/);
});

Deno.test({
  name: "runCli fails when no input is provided on a TTY",
  ignore: !process.stdin.isTTY,
  async fn() {
    const code = await runCli(["--no-banner"]);
    assert.equal(code, 1);
  },
});
