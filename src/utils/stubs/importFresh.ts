// Browser stub for import-fresh. c64jasm only uses this on the Node.js plugin
// path, which Petsciishop does not execute in the browser build.
export default function importFresh(): never {
  throw new Error('import-fresh is not available in the browser build.');
}
