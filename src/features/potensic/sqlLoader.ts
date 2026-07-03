// Browser sql.js loader. Resolves the wasm asset via Vite's ?url import.
import initSqlJs, { type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm.wasm?url";

let cached: Promise<SqlJsStatic> | null = null;

export function loadSql(): Promise<SqlJsStatic> {
  if (!cached) {
    cached = initSqlJs({ locateFile: () => wasmUrl });
  }
  return cached;
}
