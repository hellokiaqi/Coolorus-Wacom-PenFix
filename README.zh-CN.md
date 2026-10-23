# Coolorus Wacom 数位笔修复

> 让 Photoshop 2026 上 Coolorus 取色面板的**数位笔拖动**恢复正常。

Coolorus 2.7.1 是一个 CEP 扩展，它的色环、SV 色块和 HSV 滑条都基于鼠标事件驱动。在 Windows Ink
模式下，CEP 的内嵌浏览器只把数位笔作为 pointer 事件投递，拖动过程中需要的鼠标事件一个都不会发出——
所以单击仍然可以取色，拖动却毫无反应。

本仓库提供一个独立的小脚本，把笔的 pointer 事件流接到插件自己的 createjs 舞台上。改动仅限于在面板里
增加一行 `<script>`，既不修改 Coolorus 的任何代码，也不重新分发它的任何内容。

**English: [README.md](README.md)** · **技术分析：[docs/diagnosis.zh-CN.md](docs/diagnosis.zh-CN.md)**

---

## 一览

| 操作 | 修复前 | 修复后 |
| --- | --- | --- |
| 笔单击取色 | 正常 | 正常 |
| 笔拖动——色环、SV 色块、HSV 滑条 | 无反应 | 正常 |
| 鼠标拖动 | 正常 | 不受影响 |
| 笔接触面板时的光标 | 消失 | 不变（由 Photoshop 隐藏） |

## 现象

- 数位笔单击能取色，但色环、中间色块和三条 HSV 滑条都拖不动。
- 往往刚开始还能拖一下，之后彻底失效，必须重开面板或重启 Photoshop 才恢复。
- 笔按下时，系统光标在面板内消失，抬笔后又出现。
- 同一时间鼠标一切正常，数位笔在其他软件里也一切正常。

## 根因

面板运行在 CEP 12.0.0（Chromium 99.0.4844.84）中。对面板注入事件记录后可以确认：数位笔**只以
pointer 事件的形式**进入页面（`pointerType === "pen"`），配套的鼠标事件缺失：

- 笔落下时没有 `mousedown`；
- 笔移动时没有 `mousemove`；
- 只在一次点击结束时才补齐鼠标序列——这正是"单击能用"的原因。

Coolorus 的所有交互都监听鼠标事件，于是 createjs 的坐标停在最后一次鼠标位置上，拖动自然无法跟踪。
此外笔的 `mouseup` 也经常丢失，拖拽状态因此卡住，这就是"拖过一次之后就再也不灵"的来源。

光标消失与插件无关，是 Photoshop 在笔接触时隐藏了系统光标。

单次会话中的实测数据（原始片段见 [docs/evidence-log-excerpt.txt](docs/evidence-log-excerpt.txt)）：

| 观测项 | 结果 |
| --- | --- |
| 笔按下时产生原生 `mousedown` 的次数 | 0 |
| 未收到 `mouseup` 的笔操作 | 49 次中有 30 次 |
| 笔拖动期间的 `stage.mouseX` / `stage.mouseY` | 冻结在最后一次鼠标位置 |

## 补丁做了什么

1. **跟踪按下。** 用 `pointerdown` 建立一次按压记录，并记下笔下的那个 canvas。
2. **补 `mousedown`。** 若 60 ms 内没有真实 `mousedown`，就在该 canvas 上合成一个，让插件在正确位置
   启动自己的拖拽逻辑。
3. **喂坐标。** 按压期间每 15 ms 把最新笔坐标送进对应 createjs 舞台，调用的是
   `Stage._handleMouseMove()`——EaselJS 处理真实鼠标事件的同一个入口，坐标换算、命中检测和
   `stagemousemove` 派发都由它完成，插件代码无需改动。
4. **补 `mouseup`。** 抬笔时若真实 `mouseup` 没来，就补一个，用于提交颜色并解除卡住的拖拽状态。
5. **阻止原生拖拽。** 拦截 `dragstart`，并中和 `touch-action` / `-webkit-user-drag`，避免内嵌浏览器
   进入会吞掉后续移动的原生拖拽。

鼠标事件正常时，第 3 步是空操作（舞台坐标已经就位），因此鼠标路径完全不受影响。

## 已验证环境

| 组件 | 版本 / 型号 |
| --- | --- |
| 操作系统 | Windows 11 专业版 10.0.26300 |
| Photoshop | Adobe Photoshop 2026 **27.10**（build 20260824.r.26） |
| CEP 运行时 | CEP **12.0.0**，Chromium **99.0.4844.84** |
| Coolorus | **2.7.1**（CEP 扩展） |
| 数位笔 | **Wacom Art Pen 2** |
| 数位板 | Wacom（USB `VID_056A`，`PID_03F7`） |
| Wacom 驱动 | **6.4.15-1** |
| 输入模式 | Windows Ink（默认，未使用 `PSUserConfig.txt` 覆盖） |

测试时未修改 Wacom 驱动设置，也没有改动 Photoshop 的 `UseSystemStylus` 选项。

## 安装

1. 找到扩展目录，通常为：

   ```
   C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\Coolorus 2.7.1
   ```

2. 把 [`src/penfix.js`](src/penfix.js) 复制到该目录下的 `js\penfix.js`。
3. 在 `index.html` 的 `</body>` 之前、现有脚本之后加一行：

   ```html
   <script src="js/penfix.js"></script>
   ```

4. 重新加载面板：**完全退出 Photoshop 再打开**，或在面板上右键选择 **重新加载 / Reload**。
   仅把面板收起再展开不会重新载入页面。

修改 `Program Files` 下的文件需要管理员权限，建议先备份 `index.html`。

## 卸载

删掉新增的那行 `<script>` 和 `js\penfix.js` 即可，其余文件未做任何改动。

## 验证

- 色环、SV 色块、三条 HSV 滑条上的笔拖动、鼠标拖动与单击取色均已验证。
- 额外用 Chromium 156 做了合成事件回归测试（完全无鼠标事件流的 pointer 手势）：笔手势可以正常拖动，
  鼠标路径从未被介入（鼠标操作时 `presses: 0`、`driven: 0`）。

## 兼容性与限制

- 针对 Coolorus 2.7.1 自带的 createjs 构建。脚本调用了 `Stage._handleMouseMove()` 这一 EaselJS
  内部方法；若 Coolorus 或 createjs 版本不同可能需要调整，简单场景会退回
  `stage.mouseX` + `stagemousemove` 的备用路径。
- 如果将来的 CEP/CEF 重新为笔产生兼容鼠标事件，坐标喂入会自动变成空操作，面板表现与未安装补丁一致。
- 仅 Windows。macOS 不走这条输入路径，不受该问题影响。
- 调试日志默认关闭：在脚本加载前设置 `window.COOLORUS_PENFIX_DEBUG = true` 才会输出。

## 常见问题

| 现象 | 排查方向 |
| --- | --- |
| 安装后没有变化 | 页面没有重新加载。彻底退出 Photoshop，或用面板右键 → 重新加载。 |
| 面板变空白 | `<script>` 加到了 `<body>` 之外，或文件不在 `js\penfix.js`。 |
| 拖一次之后又失效 | 不应再出现；若复现，请附上 Photoshop、CEP 与 Wacom 驱动版本开 issue。 |

## 许可与声明

本仓库的代码以 [MIT 许可](LICENSE) 发布。

它是一个独立的互操作性补丁：不包含 Coolorus 的任何源码、素材或二进制文件，与 Coolorus 作者无隶属或
背书关系。"Coolorus" 是其权利人的商标，此处仅用于说明补丁的适配对象。使用本补丁仍需你自行持有合法的
Coolorus 授权。详见 [NOTICE.md](NOTICE.md)。

---

如果它帮你省下了几个小时，欢迎点个 star；如果你遇到的是另一套 Photoshop / CEP / Wacom 驱动组合，
附带完整版本信息的 issue 会很有价值。
