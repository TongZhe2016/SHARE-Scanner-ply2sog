import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { readFile, MemoryReadFileSystem, computeStats } from '@playcanvas/splat-transform';

const script = fileURLToPath(new URL('../scripts/convert.mjs', import.meta.url));
const run = (...args) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' });

function fixture(filename, count = 1024) {
    const columns = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
        'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3'];
    const header = `ply\nformat binary_little_endian 1.0\nelement vertex ${count}\n` +
        columns.map(name => `property float ${name}\n`).join('') + 'end_header\n';
    const values = Buffer.alloc(count * columns.length * 4);
    for (let i = 0; i < count; i++) {
        const row = [i / count, Math.sin(i), Math.cos(i), .1, .2, .3, 1, -3, -3, -3, 1, 0, 0, 0];
        row.forEach((v, j) => values.writeFloatLE(v, (i * columns.length + j) * 4));
    }
    const data = Buffer.concat([Buffer.from(header), values]);
    writeFileSync(filename, data);
    return data;
}

test('scanner folder: select highest Gaussian epoch, decode SOG, preserve inputs', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'ply-to-sog-'));
    try {
        const plyDir = join(dir, '测试 场景', '3DGS', 'ply');
        const meshDir = join(dir, '测试 场景', '3DGS', 'mesh');
        mkdirSync(plyDir, { recursive: true });
        mkdirSync(meshDir);
        const low = join(plyDir, '场景_epoch_9.ply');
        const high = join(plyDir, '场景_epoch_30.ply');
        const originalLow = fixture(low, 256), originalHigh = fixture(high);
        writeFileSync(join(meshDir, 'mesh_epoch_99.ply'), 'ply\nformat ascii 1.0\nelement vertex 1\nproperty float x\nend_header\n0\n');
        writeFileSync(join(plyDir, '._场景_epoch_100.ply'), originalHigh);
        writeFileSync(join(plyDir, 'project_info.json'), '{}');
        const before = readdirSync(plyDir);
        const converted = run(dir);
        assert.equal(converted.status, 0, converted.stderr);
        assert.match(converted.stdout, /Selected epoch 30:/);
        assert.deepEqual(readdirSync(plyDir).sort(), [...before, '场景_epoch_30.sog'].sort());
        assert.deepEqual(readFileSync(low), originalLow);
        assert.deepEqual(readFileSync(high), originalHigh);
        const output = join(plyDir, '场景_epoch_30.sog');
        const encoded = readFileSync(output);
        const fs = new MemoryReadFileSystem();
        fs.set('scene.sog', encoded);
        const [source] = await readFile({ filename: 'scene.sog', inputFormat: 'sog', fileSystem: fs });
        try {
            const { lods } = await computeStats(source);
            assert.equal(lods[0].numGaussians, 1024);
            assert.ok(lods[0].data.nanCount.every(n => n === 0));
        } finally { await source.close(); }
        assert.notEqual(run(dir).status, 0);
        assert.deepEqual(readFileSync(output), encoded);
    } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('reject missing inputs, empty folders, files and ambiguous highest epochs', () => {
    const dir = mkdtempSync(join(tmpdir(), 'ply-to-sog-'));
    try {
        for (const args of [[], [dir, dir], [join(dir, 'missing')], [dir]]) {
            assert.notEqual(run(...args).status, 0);
        }
        const first = join(dir, 'a_epoch_30.ply');
        fixture(first);
        assert.notEqual(run(first).status, 0);
        fixture(join(dir, 'b_epoch_30.ply'));
        const ambiguous = run(dir);
        assert.notEqual(ambiguous.status, 0);
        assert.match(ambiguous.stderr, /Multiple PLY files/);
        assert.ok(readdirSync(dir).every(name => name.endsWith('.ply')));
    } finally { rmSync(dir, { recursive: true, force: true }); }
});
