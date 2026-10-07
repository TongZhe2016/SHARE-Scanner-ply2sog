# PLY → SOG

使用 PlayCanvas SplatTransform 将 3D 高斯 PLY 文件转换为压缩的 SOG 场景。

## 安装

需要 Git 和 npm。在项目根目录执行：

```bash
git submodule update --init
npm ci
```

项目固定使用 SplatTransform 3.10.0 和 Node 22.22.0。npm 命令自动使用项目内的 Node。

## 转换

```bash
npm run convert -- input.ply output.sog
```

文件名包含空格时使用引号：

```bash
npm run convert -- "scenes/my scene.ply" "converted/my scene.sog"
```

转换使用 CPU，自动创建输出目录，生成指定的 `.sog` 文件。进度显示在终端中。输入需要是包含高斯属性的 PLY；目标文件已存在时会报错。

SOG 使用有损量化压缩，保留高斯数量。编码采用固定版本的官方 npm 包，对应源码位于 `vendor/splat-transform/` 子模块。

## 测试

```bash
npm test
```

测试覆盖实际转换、完整解码、输出文件、源文件保持以及错误输入处理。
