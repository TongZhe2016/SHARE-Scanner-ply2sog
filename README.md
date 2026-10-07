# 上海 3DGS：PLY → SOG

把扫描训练输出的 3D Gaussian Splatting PLY 转为 PlayCanvas SOG v2 单文件场景。保留所有高斯，不做抽稀、裁剪、去浮点或坐标变换；SOG 属性量化本身是**有损压缩**。

## 目录

代码仓库独立位于 `/mnt/data1/上海/ply2sog/`；资产根目录为其父目录 `/mnt/data1/上海/`。

```text
上海/
├── ply2sog/             # Git 仓库：代码、子模块、依赖、文档、报告
├── output/              # 原有训练结果，包括输入 PLY
├── sog/                 # 新导出的完整场景 SOG 与运行日志
└── 各扫描工程及照片视频    # 原样保留
```

以下未加 `../` 的代码路径均相对于 `ply2sog/`：

- 原有照片、视频、扫描工程文件夹以及 `../output/`：原地保留，不加入 Git。
- `vendor/splat-transform/`：唯一 Git 子模块，官方 SplatTransform 源码。
- `scripts/`：场景发现、批量编码、验证。
- `tests/`：端到端测试和损坏输入测试。
- `../sog/`：完整场景 `.sog`、同名 `.json` 校验记录、`.log` 编码日志；大文件不入 Git。
- `reports/`：纳入版本管理的源场景清单和逐场景校验记录。
- `docs/`：算法、完整性及验证说明。

## 安装

需要 Linux、Git、npm 和 Python 3。项目锁定 Node 22.22.0；不修改系统 Node。首次 `npm ci` 若系统 Node 较旧，可能显示 engine 警告，实际执行使用项目内 Node 22。

```bash
cd /mnt/data1/上海/ply2sog
git submodule update --init --recursive
npm ci
python3 -m venv .venv
. .venv/bin/activate
pip install -r scripts/requirements.txt
```

SplatTransform npm 包固定 `3.10.0`，对应子模块提交 `b57ea7b4e7aebab9d0aabf7545db89ad1b292823`。运行官方预编译包；子模块保留对应源码供审计和修改。无需编译 Engine，也无需单独的 Engine 子模块。npm 会自动安装工具自身需要的 `playcanvas` 库依赖。

## 运行

```bash
npm run inventory  # 扫描 output/ 下高斯 PLY，排除网格
npm test           # 生成小场景，实际编码、解码、验证续跑和篡改拒绝
npm run convert    # 每个目录选择最大 epoch；默认 GPU 0
npm run verify     # 重算源/目标 SHA-256，完整解码每个场景
```

单场景、CPU 回退、全部训练快照：

```bash
npm run convert -- --scene '楼群3DGS_epoch_30'
npm run convert -- --gpu cpu
npm run convert -- --all-epochs
npm run verify -- --all-epochs
node_modules/node/bin/node node_modules/@playcanvas/splat-transform/bin/cli.mjs --list-gpus
```

默认每场景取最新训练快照，epoch 10/15/20/25 是同一场景的中间版本。`--all-epochs` 才会额外压缩全部中间版本。当前自动验证适配已发现的 **SH0、binary_little_endian、14 个 float 属性** PLY；其他格式会明确拒绝，避免静默损失属性。仅有照片或工程数据、没有高斯 PLY 的目录无法直接进行这一步压缩。

## 输出与续跑

默认使用代码仓库的父目录作为资产根目录。仓库放在其他位置时，设置环境变量即可，无需搬动素材：

```bash
PLY2SOG_DATA_ROOT='/实际的资产目录' npm run convert
```

`reports/` 内记录的 `source`、`output` 路径均相对于资产根目录。

每个输入 `../output/<场景>/3DGS/ply/<名称>.ply` 输出 `../sog/<名称>.sog`。同名 JSON 记录 SHA-256、字节数、高斯数、耗时和解码统计。

再次运行会检查已有文件的源/目标哈希，并重新完整解码后跳过编码。没有配套记录的旧输出或哈希不符的文件不会被覆盖。转换先写临时目录，校验成功后才发布最终文件；进程异常退出不会把不完整文件当成成功结果。多实例使用文件锁互斥。发生强制断电时，隐藏的 `.encoding-*` 目录可能残留，可人工检查后清理。

单文件场景最多包含数千万个高斯，导入浏览器时仍需要足够显存。已有 `output/**/_lod` 分块结果保持原样，适合另行开展流式加载；本项目交付独立 `.sog` 文件。

## 本次结果（2026-10-07）

已完成 9 个可用场景的 epoch 30：共 156,545,013 个高斯，PLY 合计 8.77 GB，SOG 合计 1.61 GB，约 5.44 倍压缩，减少 81.62%。全部通过独立复验命令的完整解码与源/目标 SHA-256 校验。结果清单见 `reports/run-summary.json`。

“功夫 电线杆”“街景02_3DGS”“街景3 3DGS”“高手 点云2”尚未发现高斯 PLY，未记作转换成功；补充训练输出后再次运行即可发现和转换。其他已有场景会验证后跳过。

## Git 与推送

代码、依赖锁文件、子模块指针和校验报告按阶段提交；原始素材与 SOG 大文件留在本机，**Git Push 不会备份这些大文件**。使用方应另行备份素材和 `sog/`。

本项目远程仓库为 [TongZhe2016/SHARE-Scanner-ply2sog](https://github.com/TongZhe2016/SHARE-Scanner-ply2sog)。本机使用已认证的 SSH 连接推送：

```bash
git push -u origin main
```

本次自动化提交使用仓库本地身份 `Codex <codex@localhost>`，不影响全局 Git 配置。

更多细节：[算法与验证](docs/conversion.md)。
