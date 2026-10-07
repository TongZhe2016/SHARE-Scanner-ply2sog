# PLY → SOG

输入一个赛尔扫描仪场景文件夹，自动选择 epoch 最高的高斯 PLY，使用 PlayCanvas SplatTransform 转换为 SOG。

## 安装

需要 Git 和 npm。在项目根目录执行：

```bash
git submodule update --init
npm ci
```

项目固定使用 SplatTransform 3.10.0 和 Node 22.22.0。npm 命令自动使用项目内的 Node。

## 转换

```bash
npm run convert -- "data/scene-folder"
```

程序递归查找 `*_epoch_<数字>.ply`，读取文件头识别高斯属性，并按 epoch 数值选择最高版本。例如：

```text
scene-folder/
└── 3DGS/
    ├── mesh/
    │   └── scene_fuse.ply
    └── ply/
        ├── scene_epoch_9.ply
        └── scene_epoch_30.ply
```

上述目录会选取 `scene_epoch_30.ply`，在同一目录生成 `scene_epoch_30.sog`。支持中文及带空格路径，参数使用引号包裹即可。

转换使用 CPU，进度显示在终端中，输出为一个 `.sog` 文件。原始 PLY 保持不变。目标 SOG 已存在时会报错；如有多个文件并列最高 epoch，请指定更具体的场景文件夹。

文件夹中需要有包含位置、颜色、透明度、尺度与旋转属性的高斯 PLY。没有匹配的文件时，程序会提示并退出。

SOG 使用有损量化压缩，保留高斯数量。编码采用固定版本的官方 npm 包，对应源码位于 `vendor/splat-transform/` 子模块。

## 测试

```bash
npm test
```

测试覆盖扫描仪目录发现、epoch 数值排序、高斯属性识别、实际转换与完整解码、源文件保持、已有输出保护和错误输入处理。
