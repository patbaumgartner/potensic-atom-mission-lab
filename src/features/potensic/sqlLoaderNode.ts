// Node sql.js loader for tests. Loads the wasm binary from node_modules.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import initSqlJs, { type SqlJsStatic } from "sql.js";

const require = createRequire(import.meta.url);

let cached: Promise<SqlJsStatic> | null = null;

export function loadSqlNode(): Promise<SqlJsStatic> {
  if (!cached) {
    const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
    const buf = readFileSync(wasmPath);
    const wasmBinary = buf.buffer.slice(
      buf.byteOffset,
      buf.byteOffset + buf.byteLength,
    );
    cached = initSqlJs({ wasmBinary });
  }
  return cached;
}
