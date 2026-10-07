# PLY → SOG：3D 高斯场景转换工具

基于 PlayCanvas SplatTransform，将 3D Gaussian Splatting PLY 转换为 SOG v2 压缩场景。支持批量发现、训练快照选择、断点续跑和完整解码校验。

转换保留高斯数量与坐标系。SOG 使用有损属性量化及无损 WebP 纹理编码，适用于场景存储和分发。

## 支持的输入

批处理流程支持 **SH0、binary_little_endian、14 个 float32 属性**的高斯 PLY：

```text
x y z
f_dc_0 f_dc_1 f_dc_2
opacity
scale_0 scale_1 scale_2
rot_0 rot_1 rot_2 rot_3
```

输入必须包含完整的高斯属性，数值有限且旋转四元数非零。普通网格会在发现阶段跳过；其他属性布局会在编码前报告错误。

## 安装

环境要求：Linux、Git、npm、Python 3。执行以下命令时，工作目录为项目根目录。

```bash
git submodule update --init --recursive
npm ci
python3 -m venv .venv
. .venv/bin/activate
pip install -r scripts/requirements.txt
```

项目使用固定版本的 Node 22.22.0 和 SplatTransform 3.10.0。批处理自动调用项目依赖中的 Node；使用较旧的系统 Node 安装依赖时，npm 可能显示 engine 提示。

`vendor/splat-transform/` 固定到提交 `b57ea7b4e7aebab9d0aabf7545db89ad1b292823`。编码执行对应版本的官方 npm 发布包，并在运行前核对源码提交与编码器版本。

## 数据目录

通过 `PLY2SOG_DATA_ROOT` 指定数据根目录。例如，在项目根目录创建 `data/`，按以下结构组织输入：

```text
data/
├── output/
│   ├── scene-a/
│   │   ├── scene-a_epoch_10.ply
│   │   └── scene-a_epoch_30.ply
│   └── scene-b/
│       └── scene-b.ply
└── sog/
    ├── scene-a_epoch_30.sog
    ├── scene-a_epoch_30.json
    ├── scene-a_epoch_30.log
    └── reports/
```

```bash
export PLY2SOG_DATA_ROOT="$PWD/data"
```

输入从数据根目录的 `output/` 递归发现；成品写入同级 `sog/`。未设置环境变量时，数据根目录默认为项目根目录的父目录。

每个输入目录代表一个场景。默认选择 `_epoch_<数字>` 最大的文件；未带 epoch 的文件按 epoch 0 处理，同 epoch 时按路径排序取最后一个。因此，独立场景应放在不同目录中。输出文件名沿用输入名称，同名冲突会报告错误。

## 使用

```bash
npm run inventory  # 生成输入清单
npm run convert    # 批量转换每个场景的最新快照
npm run verify     # 检查源/目标哈希并完整解码
npm test           # 运行隔离的端到端测试
```

选择单个场景、使用 CPU 或处理所有训练快照：

```bash
npm run convert -- --scene scene-a_epoch_30
npm run convert -- --gpu cpu
npm run convert -- --all-epochs
npm run verify -- --all-epochs
```

默认设备索引为 `0`。可用设备通过官方 CLI 查询：

```bash
node_modules/node/bin/node node_modules/@playcanvas/splat-transform/bin/cli.mjs --list-gpus
```

## 输出与验证

每个 `.sog` 配套同名 JSON 校验记录及编码日志。记录包含源/目标 SHA-256、文件大小、高斯数量、压缩比、耗时、编码器版本和解码统计。运行清单及逐场景报告存放在数据根目录的 `sog/reports/`，记录中的文件路径均相对于数据根目录。

转换先写临时目录，校验成功后发布成品。重复运行会核对源/目标哈希并完整解码已有结果，然后跳过编码。缺少配套记录或哈希不符时会报告错误，保留文件供检查。文件锁保证同一输出目录内的批处理互斥。

SOG 是有损格式，完整解码校验用于确认数据可读性和结构完整性。视觉质量可通过代表性视角的渲染对比进一步评估。大型单文件场景的加载仍需要与高斯数量相匹配的内存和显存。

## 项目结构

- `scripts/`：场景发现、编码、解码验证。
- `tests/`：输入检查、场景选择、端到端转换和续跑测试。
- `docs/`：压缩算法与校验说明。
- `vendor/splat-transform/`：固定版本的官方源码子模块。

详细说明见[编码与验证](docs/conversion.md)。
