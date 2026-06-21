import packageConfig from "../deno.json" with { type: "json" };

/** Package version sourced from deno.json. */
export const VERSION = packageConfig.version;
