# mock-humanoid 语音输入布局与行为

状态：Draft
版本：0.1
日期：2026-07-22

## 1. 设计原则

语音输入对齐 Hetu Playground：自动连续对话使用 Stardust `server_vad`；客户端模式使用 Push to Talk，按住录音、松开提交。浏览器 3A 属于媒体采集约束，与对话模式相互独立。

## 2. 页面结构

```text
┌ Realtime 设置 ────────────────────────────┐
│ 语音输入                                  │
│ [● Server VAD] [○ Client / Push to Talk]  │
│ [✓] 回声消除 [✓] 噪声抑制 [✓] 自动增益    │
│ 连接期间以上选项锁定，修改后重新连接生效   │
├───────────────────────────────────────────┤
│ session.update JSON                       │
└───────────────────────────────────────────┘

对话输入区：
Server VAD              Push to Talk
[麦克风开关][电平]       [ 按住说话 ][电平]
```

## 3. 模式契约

| UI 模式 | Session 运行时覆盖 | 录音行为 | 响应触发 |
|---|---|---|---|
| Server VAD | `hearing.turn_detection.type = "server_vad"` | 连接后持续上送；麦克风按钮可暂停/恢复 | Stardust VAD 自动触发，客户端不 commit |
| Client VAD / Push to Talk | `hearing.turn_detection = null` | 按下开始、松开/取消结束；非按压期间不上送 | 松开后客户端依次发送 `input_audio_buffer.commit`、`response.create` |

UI 使用“Client VAD / Push to Talk”名称，但 Realtime 协议按 Hetu Playground 发送 `turn_detection: null`，不发送 `type: "client_vad"`。

## 4. 浏览器 3A

`getUserMedia` 的音频约束分别使用以下三个布尔值：

- `echoCancellation`
- `noiseSuppression`
- `autoGainControl`

默认全部开启。获得音轨后读取 `MediaStreamTrack.getSettings()`；请求值与浏览器实际值不一致时写入 `audio_constraint_mismatch` warning。拒绝权限、没有 live audio track 或采集初始化失败时显示明确错误，文本输入保持可用。

## 5. 输入行为

| 输入 | 模式 | 行为 |
|---|---|---|
| 点击麦克风 | Server VAD | 在持续收音和暂停之间切换 |
| Pointer down / `Space` / `Enter` | Push to Talk | 中断当前播放、清空输入缓存、开始上送音频 |
| Pointer up / cancel / `Space` 或 `Enter` keyup | Push to Talk | 停止上送并提交一次语音响应 |
| 断开连接 | 两种模式 | 停止轨道、关闭 AudioContext、清空录音状态 |

## 6. 状态与错误

- Server VAD：显示“持续聆听”或“麦克风已暂停”。
- Push to Talk：空闲显示“按住说话”，按压显示“松开发送”。
- 音量条来自采集 PCM 的 RMS，不作为客户端自动断句依据。
- Push to Talk 没有采集到任何 PCM 时松开不提交，并显示 warning。

## 7. 入口

- 页面与交互：`src/App.tsx`
- PCM 和媒体轨道：`src/realtime/audio.ts`
- AudioWorklet：`public/audio-capture-worklet.js`
- Realtime 提交：`src/realtime/client.ts`
