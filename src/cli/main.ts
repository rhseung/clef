const USAGE = 'usage: clef <file> [--emit stage] [-O0] [-o out.mid]';

const path = process.argv[2];
if (path === undefined) {
  console.error(USAGE);
  process.exit(2);
}

console.error(`clef: compiler is not implemented yet (${path})`);
process.exit(1);
