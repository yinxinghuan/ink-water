# Ink & Water 技术文档

## 1. 技术栈

- Vite 7，构建 `base: './'`
- Vanilla JavaScript
- Three.js 0.156.1 / WebGL
- GLSL 顶点与片元 shader
- CSS 响应式界面与动效

## 2. 目录结构

- `index.html`：页面结构、游戏 UUID、启动层、HUD、幽灵手指、结算与错误状态。
- `src/main.js`：状态机、动态加载、国际化、进度、音效和演示编排。
- `src/InkExperience.js`：Three.js 场景、原作 shader、双 FBO 模拟、输入和渲染生命周期。
- `src/style.css`：视觉系统、移动端安全区、封面、HUD 与结算样式。
- `public/noise_1.jpg`：原作模拟使用的 256×256 噪声数据纹理。
- `NOTICE.md`：原作者、原作链接、许可入口与改造范围。

## 3. 核心模块

- `BufferSim` 创建两个浮点 `WebGLRenderTarget`，逐帧交换 input/output，将上帧墨迹经噪声定向 blur 写入下一帧。
- `InkExperience.update()` 保留原作时间、颜色、压力、笔尖姿态、持久度和重力计算。
- Pointer Events 统一鼠标与触摸；单指 raycast 水面 UV，双指距离映射到 `waterQuantity` 和 `waterDiffusion`。
- `main.js` 在用户点击前不加载 Three.js 和模拟纹理，避免列表预加载占用 GPU。
- RAF 同时受 Page Visibility 与 IntersectionObserver 控制，离屏时停止。
- 用户可见文案根据 `game_locale` 或浏览器语言在中英文间切换。

## 4. 扩展点

- 调整完成路径、结算规则和音效：修改 `src/main.js`。
- 调整扩散、笔触或颜色：修改 `src/InkExperience.js` 中 uniforms、原作 shader 或 `update()`。
- 更换界面与标题构图：修改 `index.html` 和 `src/style.css`。
- 更换模拟噪声：替换 `public/noise_1.jpg`；它是 shader 数据，不应接入用户头像。
- 添加后端排行榜或存档：在 `main.js` 完成事件处接入共享 runtime，并继续使用现有永久 UUID。

