# 编码与验证

## 实现与版本

编码器使用 [PlayCanvas SplatTransform](https://github.com/playcanvas/splat-transform) 3.10.0，对应提交 `b57ea7b4e7aebab9d0aabf7545db89ad1b292823`。其 MIT 许可证位于子模块 `LICENSE`。

主要源码：

- `vendor/splat-transform/src/lib/writers/write-sog.ts`：属性收集、Morton 排序、纹理编码与打包。
- `vendor/splat-transform/src/lib/spatial/quantize-1d*`：尺度与颜色码本量化。
- `vendor/splat-transform/src/lib/readers/read-sog.ts`、`read-sog-v2.ts`：SOG 读取与解码。
- `vendor/splat-transform/src/lib/utils/webp-codec.ts`：WebP 编解码。

## 压缩流程

SOG v2 对坐标进行有符号对数变换，量化后写入高低字节纹理；旋转采用最小三分量编码；尺度和 DC 颜色通过码本量化；透明度量化为 8 位。纹理经无损 WebP 编码后，与 `meta.json` 打包为 `.sog` ZIP 容器。

属性量化是有损的。Morton 排序改变记录顺序，高斯数量与坐标系保持一致。

批处理验证支持 SH0 高斯 PLY。这类输入主要由 CPU 和 WebP worker 处理。默认使用四个 worker，逐场景执行以控制内存占用。

## 完整性检查

1. 扫描 PLY 头，识别位置、颜色、透明度、尺度和旋转属性。
2. 按选择策略生成清单，写入数据根目录的 `sog/reports/inventory.json`。
3. 检查输入长度、高斯数量、全部属性有限性和非零旋转。
4. 编码前后计算输入文件 SHA-256，确认源数据保持一致。
5. 验证临时 SOG，通过后发布成品及同名 JSON 记录。
6. 将文件大小、哈希、数量、耗时、版本和解码统计写入运行报告。

源文件保持原样。已有成品仅在哈希与完整解码校验通过后复用。进程异常退出时，隐藏的 `.encoding-*` 临时目录可能残留，可检查后清理。

## SOG 校验

- 使用 Python `zipfile` 检查所有归档成员的 CRC。
- 检查格式版本、高斯数量、码本长度及有限值。
- 使用 Pillow 解码全部 WebP，检查纹理尺寸、容量及四元数编码模式。
- 使用官方 `readFile` 和 `computeStats` 解码所有高斯，保存逐属性统计，检查 NaN 与无穷值。
- 透明度量化为 0 或 1 时，官方解码器在 logit 空间产生的负或正无穷是合法端点，校验时单独允许。

这些检查覆盖容器、纹理、数量及属性的可解码性。视觉质量评估需要额外的渲染对比。

## 测试与复现

`npm test` 在隔离的数据目录中生成固定随机种子的高斯场景，覆盖中文及带空格路径、最新 epoch 选择、网格排除、PLY→SOG 完整转换、解码、源哈希保持、续跑、数量不符、目标篡改、截断输入和 NaN 输入。

依赖版本由 `package-lock.json` 固定，官方源码由子模块提交固定。批处理在运行前核对编码器版本与子模块提交。数据根目录通过 `PLY2SOG_DATA_ROOT` 配置，运行记录与转换结果一同保存。
