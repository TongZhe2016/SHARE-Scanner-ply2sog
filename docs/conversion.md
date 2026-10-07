# 编码与验证说明

## 官方实现

源代码：[playcanvas/splat-transform](https://github.com/playcanvas/splat-transform)，MIT 许可证见子模块 `LICENSE`。

固定版本 3.10.0 / b57ea7b4e7aebab9d0aabf7545db89ad1b292823。编码调用 npm 发布包内同一提交的 CLI；子模块源码完整保留，未修改上游算法。

相关代码：

- `vendor/splat-transform/src/lib/writers/write-sog.ts`：收集高斯属性、Morton 排序、纹理编码、打包。
- `vendor/splat-transform/src/lib/spatial/quantize-1d*`：尺度与颜色码本量化。
- `vendor/splat-transform/src/lib/readers/read-sog.ts` 和 `read-sog-v2.ts`：官方读取/解码。
- `vendor/splat-transform/src/lib/utils/webp-codec.ts`：WebP 编解码。

SOG v2 将坐标经过有符号对数变换后编码到高低字节纹理，旋转采用最小三分量编码，尺度和 DC 颜色采用码本，透明度量化到 8 位。纹理经 lossless WebP 编码后，与 meta.json 打包成 ZIP 容器 `.sog`。WebP 是无损的，之前的属性量化仍然有损。Morton 排序改变记录顺序，不改变高斯数量。

这些场景没有高阶球谐函数（SH0）。因此不涉及高阶 SH 的 GPU k-means；即便选择 GPU 0，当前主要工作仍在 CPU/WebP worker 完成。默认四个 worker，逐场景处理，避免多个数千万高斯场景同时占用内存。

## 数据完整性

1. 扫描 PLY 头，确认有位置、颜色、透明度、尺度和旋转属性；普通网格 PLY 被排除。
2. 默认从每个输入目录选择 epoch 最大的 PLY，清单保存到 `reports/inventory.json`。
3. 编码前验证字节长度、正数高斯数量、全部属性有限值、旋转非零。
4. 记录整个输入文件的 SHA-256，编码后再次重算，确认输入未变。
5. 临时结果通过全部验证后才改名发布；源目录不移动、不覆盖、不清理。
6. 输出大小、SHA-256、高斯数、源码提交、编码器版本与验证结果写入报告。

## 验证覆盖

- Python zipfile 读取所有成员并验证 CRC。
- meta.json 的格式版本、高斯数量、码本长度与有限性。
- Pillow 独立解码全部 WebP，验证纹理尺寸一致且容量足够，以及四元数模式合法。
- 官方 SplatTransform `readFile` + `computeStats` 读取所有高斯，检查 NaN 和无穷值，保存逐属性统计。
- 透明度量化为 0/1 时，官方解码到 logit 空间可产生负/正无穷；这属于合法的透明/不透明端点，单独允许。
- 再次执行会比对输入输出 SHA-256，并完整复验已有结果。

这证明容器和纹理可读、高斯数量不变、属性可解码；不等价于视觉无损或每个视角的渲染一致。本次不将未执行的人工视觉验收或 PSNR 测量记作通过。

## 测试

`npm test` 使用固定随机种子生成 1024 个高斯，测试实际 PLY→SOG→完整解码、源哈希保持、续跑、不符计数拒绝、目标篡改拒绝、截断输入拒绝和 NaN 输入拒绝。

项目不会修改子模块代码，因而上游 lint/build 不作为本项目代码的检查方式；版本对应关系在批处理前检查。大型真实场景的逐一报告位于 `reports/`。
