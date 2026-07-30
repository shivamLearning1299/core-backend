// Node 20.19+'s entry-point module-format detection rejects a `.ts` file
// passed directly on the command line (even with a require-hook registered
// via `-r`), so this plain `.cjs` file is the actual entry point instead —
// it requires ts-node's register hook, then requires the real seed script,
// which Node treats as a normal `require()` of an unrecognized extension
// from within an already-running CommonJS process (that path is unaffected).
require('ts-node/register');
require('./seed.ts');
