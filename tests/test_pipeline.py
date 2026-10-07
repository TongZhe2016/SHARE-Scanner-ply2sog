import importlib.util
from pathlib import Path
import tempfile
import unittest
import numpy as np

spec = importlib.util.spec_from_file_location('pipeline', Path(__file__).resolve().parents[1]/'scripts/pipeline.py')
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


def make_ply(path, count=1024):
    rng = np.random.default_rng(2026)
    data = rng.normal(size=(count, 14)).astype('<f4')
    data[:, 7:10] -= 3
    data[:, 10:14] /= np.linalg.norm(data[:, 10:14], axis=1, keepdims=True)
    text = 'ply\nformat binary_little_endian 1.0\nelement vertex %d\n' % count
    text += ''.join(f'property float {name}\n' for name in pipeline.REQUIRED) + 'end_header\n'
    path.write_bytes(text.encode() + data.tobytes())


class PipelineTests(unittest.TestCase):
    def test_truncated_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'test.ply'; make_ply(p)
            p.write_bytes(p.read_bytes()[:-1])
            with self.assertRaises(ValueError): pipeline.validate_source(p)

    def test_nan_source_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            p = Path(tmp)/'test.ply'; make_ply(p)
            h = pipeline.header(p)
            with p.open('r+b') as f:
                f.seek(h['offset']); f.write(np.float32('nan').tobytes())
            with self.assertRaises(ValueError): pipeline.validate_source(p)

    def test_roundtrip_resume_and_tampering(self):
        with tempfile.TemporaryDirectory(dir=pipeline.ROOT/'sog', prefix='.test-') as tmp:
            tmp = Path(tmp); p = tmp/'fixture.ply'; make_ply(p)
            item = {'path': str(p.relative_to(pipeline.ROOT)), 'gaussians': 1024}
            before = pipeline.sha256(p)
            result = pipeline.convert_one(item, gpu='cpu', target_dir=tmp/'out')
            self.assertEqual(result['validation']['verifiedGaussians'], 1024)
            self.assertEqual(before, pipeline.sha256(p))
            self.assertEqual(result, pipeline.convert_one(item, gpu='cpu', target_dir=tmp/'out'))
            target = pipeline.ROOT/result['output']
            with self.assertRaises(ValueError): pipeline.verify_sog(target, 1025)
            with target.open('ab') as f: f.write(b'changed')
            with self.assertRaises(ValueError): pipeline.convert_one(item, gpu='cpu', target_dir=tmp/'out')
