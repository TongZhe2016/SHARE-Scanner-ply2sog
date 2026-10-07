import { spawnSync } from 'node:child_process';
import { closeSync, openSync, readSync, readdirSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const properties = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
    'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];

function isGaussianPly(filename) {
    const fd = openSync(filename, 'r');
    try {
        const buffer = Buffer.alloc(65536);
        const text = buffer.subarray(0, readSync(fd, buffer)).toString('utf8');
        const end = /\r?\nend_header\r?\n/.exec(text);
        if (!text.startsWith('ply\n') && !text.startsWith('ply\r\n')) return false;
        if (!end) return false;
        const vertex = text.slice(0, end.index).match(/(?:^|\n)element vertex ([1-9]\d*)\r?\n([\s\S]*?)(?=\nelement |$)/);
        const names = new Set([...((vertex?.[2]) ?? '').matchAll(/^property\s+\S+\s+(\S+)\s*$/gm)].map(m => m[1]));
        return properties.every(name => names.has(name));
    } finally { closeSync(fd); }
}

function findCandidates(folder) {
    const candidates = [];
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
        const filename = join(folder, entry.name);
        if (entry.isDirectory()) candidates.push(...findCandidates(filename));
        const match = !entry.name.startsWith('._') && entry.name.match(/_epoch_(\d+)\.ply$/i);
        if (entry.isFile() && match && isGaussianPly(filename)) {
            candidates.push({ filename, epoch: BigInt(match[1]) });
        }
    }
    return candidates;
}

try {
    const [folder, ...extra] = process.argv.slice(2);
    if (!folder || extra.length) throw new Error('Usage: npm run convert -- "scene-folder"');
    const root = resolve(folder);
    if (!statSync(root).isDirectory()) throw new Error('Input must be a scene folder.');
    const candidates = findCandidates(root);
    if (!candidates.length) throw new Error('No Gaussian PLY named *_epoch_<number>.ply found in this folder.');
    candidates.sort((a, b) => a.epoch > b.epoch ? -1 : a.epoch < b.epoch ? 1 : 0);
    if (candidates.length > 1 && candidates[0].epoch === candidates[1].epoch) {
        throw new Error('Multiple PLY files have the highest epoch. Specify a single scene folder.');
    }
    const { filename: input, epoch } = candidates[0];
    const output = input.replace(/\.ply$/i, '.sog');
    console.log(`Selected epoch ${epoch}: ${input}\nOutput: ${output}`);
    const cli = fileURLToPath(new URL('../node_modules/@playcanvas/splat-transform/bin/cli.mjs', import.meta.url));
    const result = spawnSync(process.execPath, [cli, '--gpu', 'cpu', input, output], { stdio: 'inherit' });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
} catch (error) {
    console.error(error.message);
    process.exitCode = 1;
}
