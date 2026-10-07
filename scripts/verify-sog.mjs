// Fully decode the SOG with the official, pinned SplatTransform reader.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { readFile, MemoryReadFileSystem, computeStats } from '@playcanvas/splat-transform';
const fileSystem = new MemoryReadFileSystem();
fileSystem.set('scene.sog', fs.readFileSync(process.argv[2]));
const sources = await readFile({filename: 'scene.sog', inputFormat: 'sog', fileSystem});
assert.equal(sources.length, 1);
const source = sources[0];
try {
    const { lods } = await computeStats(source);
    assert.equal(lods.length, 1);
    const stats = lods[0];
    assert.equal(stats.numGaussians, Number(process.argv[3]));
    assert.ok(stats.data.nanCount.every(v => v === 0), 'NaN in decoded scene');
    // The official decoder maps quantized opacity endpoints to +/-Infinity logits.
    for (let i = 0; i < stats.columns.length; ++i) {
        if (stats.columns[i] !== 'opacity') assert.equal(stats.data.infCount[i], 0, `${stats.columns[i]} Infinity`);
    }
    console.log(JSON.stringify({ verifiedGaussians: stats.numGaussians,
        decoder: '@playcanvas/splat-transform readFile + computeStats', stats }));
} finally { await source.close(); }
