import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readFile, MemoryReadFileSystem, computeStats } from '@playcanvas/splat-transform';

const script = fileURLToPath(new URL('../scripts/convert.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

test('PLY to SOG conversion, decoding and existing-output protection', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ply-to-sog-'));
    try {
        const input = join(dir, '测试 场景.ply');
        const outDir = join(dir, 'converted');
        const output = join(outDir, 'scene.sog');
        const columns = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
            'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
        const count = 1024;
        const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n` +
            columns.map(name => `property float ${name}\n`).join('') + 'end_header\n';
        const values = Buffer.alloc(count * columns.length * 4);
        for (let i = 0; i < count; i++) {
            const row = [i / count, Math.sin(i), Math.cos(i), .1, .2, .3, 1, -3, -3, -3, 1, 0, 0, 0];
            row.forEach((v, j) => values.writeFloatLE(v, (i * columns.length + j) * 4));
        }
        const original = Buffer.concat([Buffer.from(header), values]);
        writeFileSync(input, original);
        const converted = run(input, output);
        assert.equal(converted.status, 0, converted.stderr);
        assert.deepEqual(readdirSync(outDir), ['scene.sog']);
        assert.deepEqual(readFileSync(input), original);
        const encoded = readFileSync(output);
        const fs = new MemoryReadFileSystem();
        fs.set('scene.sog', encoded);
        const [source] = await readFile({ filename: 'scene.sog', inputFormat: 'sog', fileSystem: fs });
        try {
            const { lods } = await computeStats(source);
            assert.equal(lods[0].numGaussians, count);
            assert.ok(lods[0].data.nanCount.every(n => n === 0));
        } finally { await source.close(); }
        assert.notEqual(run(input, output).status, 0);
        assert.deepEqual(readFileSync(output), encoded);
        assert.notEqual(run(join(dir, 'missing.ply'), join(outDir, 'missing.sog')).status, 0);
        assert.deepEqual(readdirSync(outDir), ['scene.sog']);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('requires a PLY input and SOG output', () => {
    for (const args of [[], ['scene.ply'], ['scene.obj', 'scene.sog'], ['scene.ply', 'scene.json']]) {
        assert.notEqual(run(...args).status, 0);
    }
});
