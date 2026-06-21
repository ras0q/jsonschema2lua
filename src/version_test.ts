import assert from "node:assert/strict";
import packageConfig from "../deno.json" with { type: "json" };
import { VERSION } from "./version.ts";

Deno.test("VERSION matches deno.json", () => {
  assert.equal(VERSION, packageConfig.version);
});
