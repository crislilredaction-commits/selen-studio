import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";

// Execute the real source with an explicit dependency allowlist. No live transport.
export function isolatedTsModule(file, modules = {}, globals = {}) {
  const source = fs.readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
    fileName: file,
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(output, {
    module, exports: module.exports, Error, Date, URL, URLSearchParams, Response, Request, ReadableStream,
    fetch: () => { throw new Error("Live fetch forbidden in tests"); },
    require: (id) => {
      if (!Object.hasOwn(modules, id)) throw new Error(`Unexpected dependency: ${id}`);
      return modules[id];
    },
    ...globals,
  }, { filename: file });
  return module.exports;
}
