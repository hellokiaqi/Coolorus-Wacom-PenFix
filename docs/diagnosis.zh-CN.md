# 故障分析：数位笔为什么拖不动 Coolorus 的 CEP 面板

本文记录问题的定位过程、面板从数位笔那里实际收到了什么，以及
[`src/penfix.js`](../src/penfix.js) 为什么采用现在的写法。

## 1. 结论摘要

Coolorus 面板是一个 CEP 扩展，交互层是绑定在 `<canvas>` 上的 `createjs` 舞台，一切都以鼠标
事件表达：`mousedown` 开始拖拽，`stagemousemove` 更新位置，`stagemouseup` 提交结果。

在 Windows Ink 模式下，CEP 的内嵌浏览器**只把数位笔作为 pointer 事件投递**。拖动所需要的兼容
鼠标事件在笔移动期间不会发出，整套鼠标序列只在一次点击结束时补齐。于是：单击能取色，拖动永远
拿不到位置更新。

## 2. 环境

| 组件 | 版本 / 型号 |
| --- | --- |
| 操作系统 | Windows 11 专业版 10.0.26300 |
| Photoshop | 2026，27.10（build 20260824.r.26） |
| CEP | 12.0.0 |
| Chromium（面板 UA） | 99.0.4844.84（`AdobeCEP/12.0.0`） |
| Coolorus | 2.7.1 |
| 数位笔 | Wacom Art Pen 2 |
| Wacom 驱动 | 6.4.15-1 |
| 输入模式 | Windows Ink（默认） |

## 3. 方法

在面板中追加一个诊断脚本（与插件脚本并列加载），它：

- 在 `document` 捕获阶段监听 `pointerdown/move/up/cancel`、`mousedown/move/up`、
  `touchstart/move/end`、`dragstart`、`selectstart`、`contextmenu`；
- 记录每个事件的 `pointerType`、按键状态、坐标与目标元素；
- 在每次手势开始时建立"按压"记录，统计松手前收到多少次 mouse 移动、多少次 pointer 移动，
  以及真实 `mouseup` 是否出现；
- 按压期间采样 `stage.mouseX` / `stage.mouseY` 和插件当前颜色；
- 通过 CEP 的 Node 能力把结果写入日志文件。

测量期间没有修改插件本身的任何代码。

## 4. 观测结果

### 4.1 数位笔只产生 pointer 事件

一次典型按压（面板空闲状态）：

```
t+0        pointerdown   pen   @128,162   target=CANVAS#picker_canvas
t+0        —— 没有跟随的 mousedown ——
t+16..250  pointermove   pen   @130,164 …（多次）
t+250      —— 没有任何 mousemove 到达 canvas ——
t+294      pointerup     pen   @151,181
```

整场会话共 49 次笔按压：

| 观测项 | 数值 |
| --- | --- |
| 产生原生 `mousedown` 的按压 | 0 |
| 未收到 `mouseup` 的按压 | 30 / 49 |
| 收到 `pointermove` 的按压 | 49 / 49 |

### 4.2 舞台坐标冻结

笔拖动期间，`stage.mouseX` / `stage.mouseY` 一直停在最后一次**鼠标**交互的位置（例如连续几分钟
都停在 `168,146`）。`createjs` 因此从未派发 `stagemousemove`，插件的拖拽处理函数根本没有任何
可跟随的数据。

这是决定性证据：插件逻辑根本没有被调用，问题出在插件上游。

### 4.3 单击仍然可用

较短的一次按压（点击）能在按压窗口内收到 `mouseup`（例如 `pointerdown` 之后 76 ms）。说明内嵌
浏览器会在一次点击结束时补齐鼠标序列——这正好解释了"单击能取色、拖动不行"的不对称现象。

### 4.4 失效会"粘住"

一旦某次按压的 `mouseup` 丢失，后续按压会一直处于降级状态，直到页面重新加载。原因有两个：

- 插件的拖拽处理器是在 `handleMouseUp` 中移除的，`mouseup` 不来，它就一直在；
- 浏览器侧的指针/按键状态与面板自身状态会逐渐不一致，下一次手势不再被当作一次全新的按压。

### 4.5 光标消失

Photoshop 在笔接触时隐藏系统光标。面板没有拖拽反馈，于是看起来就是"光标没了、什么都没发生"。
这一点与插件无关。

## 5. 为什么没有采用更"常见"的解法

把 Photoshop 从 Windows Ink 切到 WinTab（`PSUserConfig.txt` 写入 `UseSystemStylus 0`）同样能消除
症状，因为笔会重新产生普通鼠标移动。

但这是对 Photoshop 输入栈的全局改动，可能影响其他工具里的压感与旋转行为，而且超出了"只修插件"的
范围。本补丁选择修复面板自身的输入链路，把改动限制在扩展内部。

## 6. 修复设计

补丁刻意保持保守：

1. **绝不介入鼠标路径。** 所有桥接都以 `pointerType !== "mouse"` 为前提。独立的鼠标回归测试中，
   统计为 `presses: 0`、`driven: 0`，即代码完全没有动作。
2. **只补缺失的部分。** 只有 60 ms 内没有真实 `mousedown` 才合成一个；只有松手后确实没有鼠标
   事件才补 `mouseup`。
3. **用舞台自己的入口喂坐标。** 调用 `Stage._handleMouseMove()`，坐标换算、命中检测与
   `stagemousemove` 派发都和真实鼠标事件一致，插件走的是原本的代码路径，而不是另起一套。
4. **天然幂等。** 喂坐标前先比较舞台当前坐标，已就位就跳过，因此正常的鼠标事件流不会被重复处理。
5. **自动失效。** 若将来的 CEP 重新为笔生成鼠标事件，舞台坐标已经就位，喂坐标变成空操作。

已知限制：依赖 `_handleMouseMove` 这一 EaselJS 内部方法（Coolorus 2.7.1 自带的 createjs 中存在）；
若只能拿到公开派发接口，会退回 `stage.mouseX` + `stagemousemove` 的备用路径。

## 7. 如何复现测量

安装补丁后，在脚本加载前打开追踪开关：

```js
window.COOLORUS_PENFIX_DEBUG = true;
```

追踪会输出到控制台；若 CEP 启用了 Node 能力，还会写入 `<临时目录>/coolorus-penfix.log`。

## 8. 附录

修复生效后的一段原始日志见 [`evidence-log-excerpt.txt`](evidence-log-excerpt.txt)。
