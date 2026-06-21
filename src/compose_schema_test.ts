import assert from "node:assert/strict";
import {
  discriminatorSuffix,
  findDiscriminatorConst,
  mergeAllOfSchema,
  tryPureRefBranch,
  variantNameFromSchema,
} from "./compose_schema.ts";

Deno.test("mergeAllOfSchema merges discriminator properties with $ref object", () => {
  const defs = {
    ContentChunk: {
      type: "object",
      properties: {
        content: { type: "string" },
        messageId: { type: "string" },
      },
      required: ["content"],
    },
  };

  const merged = mergeAllOfSchema(
    {
      type: "object",
      properties: {
        sessionUpdate: { type: "string", const: "user_message_chunk" },
      },
      required: ["sessionUpdate"],
      allOf: [{ $ref: "#/$defs/ContentChunk" }],
    },
    defs,
  );

  assert.equal(merged.type, "object");
  assert.equal(merged.properties?.sessionUpdate.const, "user_message_chunk");
  assert.equal(merged.properties?.content.type, "string");
  assert.deepEqual(merged.required, ["content", "sessionUpdate"]);
});

Deno.test("tryPureRefBranch detects allOf ref wrappers", () => {
  const ref = tryPureRefBranch(
    {
      allOf: [{ $ref: "#/$defs/AuthMethodAgent" }],
    },
    (name) => `Cfg${name}`,
  );

  assert.equal(ref, "CfgAuthMethodAgent");
});

Deno.test("variantNameFromSchema uses discriminator const values", () => {
  const schema = {
    type: "object",
    properties: {
      sessionUpdate: { const: "user_message_chunk" },
    },
  };

  assert.equal(
    variantNameFromSchema("StageAcpSessionUpdate", schema, 0),
    "StageAcpSessionUpdateUserMessageChunk",
  );
  assert.equal(discriminatorSuffix("user_message_chunk"), "UserMessageChunk");
  assert.equal(findDiscriminatorConst(schema), "user_message_chunk");
});
