// Run the pinned Engine's real SOG CPU iterator over every Gaussian.
// Texture bytes are decoded by Pillow, without requiring a browser/GPU context.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { GSplatSogData } from '../vendor/playcanvas-engine/src/scene/gsplat/gsplat-sog-data.js';
import { Vec3 } from '../vendor/playcanvas-engine/src/core/math/vec3.js';
import { Vec4 } from '../vendor/playcanvas-engine/src/core/math/vec4.js';
import { Quat } from '../vendor/playcanvas-engine/src/core/math/quat.js';
const dir = process.argv[2];
const data = new GSplatSogData();
data.meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
data.numSplats = data.meta.count;
assert.equal(data.meta.version, 2);
assert.ok(!data.meta.shN, 'This verifier currently supports SH0 scenes only');
for (const name of ['means_l', 'means_u', 'quats', 'scales', 'sh0']) {
    data[name] = { _levels: [fs.readFileSync(path.join(dir, `${name}.rgba`))] };
}
const p = new Vec3(), r = new Quat(), s = new Vec3(), c = new Vec4();
const iter = data.createIter(p, r, s, c);
const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
for (let i = 0; i < data.numSplats; ++i) {
    iter.read(i);
    if (![p.x,p.y,p.z,r.x,r.y,r.z,r.w,s.x,s.y,s.z,c.x,c.y,c.z,c.w].every(Number.isFinite)) {
        throw new Error(`Non-finite decoded Gaussian ${i}`);
    }
    assert.ok(c.w >= 0 && c.w <= 1);
    assert.ok(Math.abs(r.lengthSq() - 1) < 0.00001);
    for (const [j, value] of [p.x,p.y,p.z].entries()) {
        min[j] = Math.min(min[j], value); max[j] = Math.max(max[j], value);
    }
}
console.log(JSON.stringify({ verifiedGaussians: data.numSplats, decoder: 'PlayCanvas GSplatSogData.createIter', positionMin: min, positionMax: max }));
