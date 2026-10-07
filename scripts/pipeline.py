#!/usr/bin/env python3
"""Preserve source assets; discover, compress and independently verify SH0 PLY scenes."""
import argparse
import hashlib
import io
import json
import os
from pathlib import Path
from datetime import datetime, timezone, timedelta
import re
import subprocess
import tempfile
import time
import zipfile

PROJECT_ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = Path(os.environ.get('PLY2SOG_DATA_ROOT', PROJECT_ROOT.parent)).resolve()
NODE = PROJECT_ROOT / 'node_modules/node/bin/node'
CLI = PROJECT_ROOT / 'node_modules/@playcanvas/splat-transform/bin/cli.mjs'
REQUIRED = ['x', 'y', 'z', 'f_dc_0', 'f_dc_1', 'f_dc_2', 'opacity',
            'scale_0', 'scale_1', 'scale_2', 'rot_0', 'rot_1', 'rot_2', 'rot_3']


def sha256(path):
    h = hashlib.sha256()
    with Path(path).open('rb') as stream:
        for block in iter(lambda: stream.read(8 * 1024 * 1024), b''):
            h.update(block)
    return h.hexdigest()


def write_json(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + '.tmp')
    tmp.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    os.replace(tmp, path)


def header(path):
    props, count, fmt, element = [], None, None, None
    with Path(path).open('rb') as f:
        if f.readline().strip() != b'ply':
            raise ValueError(f'Not a PLY: {path}')
        for _ in range(1024):
            line = f.readline().decode('ascii').strip()
            if line == 'end_header':
                return dict(count=count, properties=props, format=fmt, offset=f.tell())
            parts = line.split()
            if parts[:1] == ['format']: fmt = parts[1]
            if parts[:1] == ['element']:
                element = parts[1]
                if element == 'vertex': count = int(parts[2])
            if parts[:1] == ['property'] and element == 'vertex': props.append(parts[1:])
        raise ValueError(f'Unterminated PLY header: {path}')


def discover(base=DATA_ROOT / 'output', all_epochs=False):
    groups, skipped = {}, []
    for path in sorted(base.rglob('*')):
        if path.suffix.lower() != '.ply' or path.name.startswith('._'): continue
        h = header(path)
        names = [p[-1] for p in h['properties']]
        if not set(REQUIRED).issubset(names):
            skipped.append(str(path.relative_to(DATA_ROOT))); continue
        match = re.search(r'_epoch_(\d+)$', path.stem)
        epoch = int(match[1]) if match else 0
        scene = str(path.parent.relative_to(base))
        groups.setdefault(scene, []).append(dict(path=str(path.relative_to(DATA_ROOT)), epoch=epoch,
            gaussians=h['count'], bytes=path.stat().st_size))
    selected = []
    for items in groups.values():
        selected.extend(items if all_epochs else [max(items, key=lambda x: (x['epoch'], x['path']))])
    stems = [Path(i['path']).stem for i in selected]
    if len(stems) != len(set(stems)):
        raise ValueError('Duplicate scene filenames would collide in sog/; rename inputs or separate runs')
    return dict(policy='all-epochs' if all_epochs else 'highest-epoch-per-directory',
                scenes=selected, candidates=sum(map(len, groups.values())), skippedMeshPly=skipped,
                scannedAt=datetime.now(timezone(timedelta(hours=8))).isoformat(),
                captureDirectoriesWithoutGaussianPly=[p.name for p in sorted(DATA_ROOT.iterdir())
                    if p.is_dir() and any(p.glob('*.bag'))
                    and not any(Path(i['path']).parts[1] == p.name for i in selected)])


def validate_source(path):
    import numpy as np
    h = header(path)
    if h['format'] != 'binary_little_endian' or any(p[0] != 'float' for p in h['properties']):
        raise ValueError('Expected binary little-endian float32 PLY')
    names = [p[-1] for p in h['properties']]
    if set(names) != set(REQUIRED) or len(names) != len(REQUIRED):
        raise ValueError('This pipeline explicitly supports SH0 Gaussian PLY only')
    if h['count'] <= 0 or path.stat().st_size != h['offset'] + h['count'] * len(names) * 4:
        raise ValueError('Empty or truncated PLY')
    data = np.memmap(path, dtype='<f4', mode='r', offset=h['offset'], shape=(h['count'], len(names)))
    qids = [names.index(f'rot_{i}') for i in range(4)]
    for start in range(0, h['count'], 250000):
        chunk = data[start:start+250000]
        if not np.isfinite(chunk).all(): raise ValueError(f'Non-finite source values near {start}')
        if (np.linalg.norm(chunk[:, qids], axis=1) == 0).any(): raise ValueError('Zero quaternion')
    del data
    return h


def verify_sog(path, count):
    from PIL import Image
    import numpy as np
    with zipfile.ZipFile(path) as z:
        if z.testzip() is not None: raise ValueError('SOG archive CRC failure')
        meta = json.loads(z.read('meta.json'))
        if meta.get('version') != 2 or meta.get('count') != count: raise ValueError('SOG version/count mismatch')
        if meta.get('shN'): raise ValueError('Unexpected higher-order SH')
        for key in ['scales', 'sh0']:
            book = meta[key]['codebook']
            if len(book) != 256 or not all(isinstance(v, (int, float)) and np.isfinite(v) for v in book):
                raise ValueError(f'Invalid {key} codebook')
        mapping = {'means_l': meta['means']['files'][0], 'means_u': meta['means']['files'][1],
                   'quats': meta['quats']['files'][0], 'scales': meta['scales']['files'][0], 'sh0': meta['sh0']['files'][0]}
        sizes = []
        for name, filename in mapping.items():
            with Image.open(io.BytesIO(z.read(filename))) as img:
                img.load(); sizes.append(img.size)
                if img.width * img.height < count: raise ValueError('Texture capacity smaller than count')
                pixels = img.convert('RGBA').tobytes()
                if name == 'quats':
                    modes = np.frombuffer(pixels, dtype=np.uint8).reshape(-1, 4)[:count, 3]
                    if (modes < 252).any(): raise ValueError('Invalid quaternion encoding')
        if len(set(sizes)) != 1: raise ValueError('Inconsistent texture dimensions')
        run = subprocess.run([str(NODE), str(PROJECT_ROOT/'scripts/verify-sog.mjs'), str(path), str(count)], check=True, capture_output=True, text=True)
        result = json.loads(run.stdout)
        result.update(textureSize=list(sizes[0]), archiveCRC='passed', webpDecode='passed')
        return result


def convert_one(item, gpu='0', target_dir=DATA_ROOT/'sog'):
    source = DATA_ROOT / item['path']
    target = target_dir / (source.stem + '.sog')
    record = target.with_suffix('.json')
    target_dir.mkdir(parents=True, exist_ok=True)
    started = time.monotonic()
    source_hash = sha256(source)
    if target.exists():
        if not record.exists(): raise ValueError(f'Refusing to overwrite untracked output: {target}')
        previous = json.loads(record.read_text())
        if previous['sourceSha256'] != source_hash or previous['outputSha256'] != sha256(target):
            raise ValueError(f'Changed source/output: {target}; preserve it and choose another output directory')
        verify_sog(target, item['gaussians'])
        print(f'VERIFIED (reuse) {target.name}', flush=True)
        return previous
    h = validate_source(source)
    with tempfile.TemporaryDirectory(prefix='.encoding-', dir=target_dir) as tmp:
        partial = Path(tmp) / target.name
        command = [str(NODE), '--max-old-space-size=24576', str(CLI), '--gpu', gpu,
                   '--max-workers', '4', '--no-tty', str(source), str(partial)]
        log = target.with_suffix('.log')
        print(f'ENCODING {source.name} ({h["count"]:,} Gaussians)', flush=True)
        with log.open('w') as out:
            subprocess.run(command, stdout=out, stderr=subprocess.STDOUT, check=True, cwd=PROJECT_ROOT)
        validation = verify_sog(partial, h['count'])
        if sha256(source) != source_hash: raise ValueError('Source changed during encoding')
        result = dict(source=item['path'], sourceBytes=source.stat().st_size, sourceSha256=source_hash,
            output=str(target.relative_to(DATA_ROOT)), outputBytes=partial.stat().st_size, outputSha256=sha256(partial),
            gaussians=h['count'], ratio=source.stat().st_size/partial.stat().st_size,
            seconds=round(time.monotonic()-started, 2), validation=validation,
            encoder='@playcanvas/splat-transform@3.10.0', gpu=gpu,
            splatTransformCommit=subprocess.check_output(['git','-C',str(PROJECT_ROOT/'vendor/splat-transform'),'rev-parse','HEAD'], text=True).strip())
        os.replace(partial, target)
        write_json(record, result)
        print(f'COMPLETE {target.name}: {result["ratio"]:.2f}x, {result["outputBytes"]:,} bytes', flush=True)
        return result


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['inventory', 'convert', 'verify'])
    p.add_argument('--all-epochs', action='store_true', help='Include all training checkpoints instead of the latest per scene')
    p.add_argument('--scene', action='append', help='Exact PLY stem; may be repeated')
    p.add_argument('--gpu', default='0', help='Official encoder GPU index or cpu')
    args = p.parse_args()
    inventory = discover(all_epochs=args.all_epochs)
    items = inventory['scenes']
    if args.scene:
        items = [i for i in items if Path(i['path']).stem in args.scene]
        if len(items) != len(set(args.scene)): p.error('Scene not found; see inventory')
    if args.action == 'inventory':
        write_json(PROJECT_ROOT/'reports/inventory.json', inventory)
        print(json.dumps(inventory, ensure_ascii=False, indent=2)); return
    if not items: p.error('No Gaussian scenes found')
    version = subprocess.check_output([str(NODE), str(CLI), '--version'], text=True, stderr=subprocess.STDOUT).strip()
    commit = subprocess.check_output(['git', '-C', str(PROJECT_ROOT/'vendor/splat-transform'), 'rev-parse', 'HEAD'], text=True).strip()
    if '3.10.0' not in version or commit[:7] not in version:
        raise ValueError('Encoder package and submodule revision differ')
    (DATA_ROOT/'sog').mkdir(parents=True, exist_ok=True)
    # Prevent concurrent writers using the same output directory.
    import fcntl
    with (DATA_ROOT/'sog/.pipeline.lock').open('w') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        for item in items:
            if args.action == 'convert':
                result = convert_one(item, args.gpu)
            else:
                target = DATA_ROOT/'sog'/ (Path(item['path']).stem + '.sog')
                result = json.loads(target.with_suffix('.json').read_text())
                if result['sourceSha256'] != sha256(DATA_ROOT/item['path']) or result['outputSha256'] != sha256(target):
                    raise ValueError(f'Hash mismatch: {target}')
                verify_sog(target, item['gaussians'])
                print(f'VERIFIED {target.name}', flush=True)
            write_json(PROJECT_ROOT/'reports'/ (Path(item['path']).stem + '.json'), result)


if __name__ == '__main__': main()
