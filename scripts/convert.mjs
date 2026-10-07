import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const [input, output, ...extra] = process.argv.slice(2);
if (!input || !output || extra.length ||
    extname(input).toLowerCase() !== '.ply' || extname(output).toLowerCase() !== '.sog') {
    console.error('Usage: npm run convert -- input.ply output.sog');
    process.exit(1);
}

mkdirSync(dirname(resolve(output)), { recursive: true });
const cli = fileURLToPath(new URL('../node_modules/@playcanvas/splat-transform/bin/cli.mjs', import.meta.url));
const result = spawnSync(process.execPath, [cli, '--gpu', 'cpu', resolve(input), resolve(output)], {
    stdio: 'inherit'
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
