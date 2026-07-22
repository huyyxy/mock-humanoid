# mock-humanoid 内置 Realtime tools 契约

状态：Draft  
版本：0.6  
日期：2026-07-21

## 1. 目的与边界

本文档是 `mock-humanoid` 8 个本地 Stardust function tools 定义的唯一事实来源。工具的执行语义、输出、错误码、生命周期和资源冲突规则见 [需求文档](./requirements.md#8-本地机器人技能契约)。

这些 tools 通过 `RealtimeClient.addTool(definition, handler)` 或行为等价的客户端注册方式执行。它们不是 Stardust 服务端工具，也不包含可由服务端运行的脚本。

## 2. 公共定义规则

- `operation_mode` 固定为 `client_mode`。
- `execution_type` 固定为 `synchronous`：有限任务等待本地最终结果；持续任务在本地成功启动后立即返回 `running`。
- `result_handling` 固定为 `process_in_llm`。
- `code` 固定为空字符串；`language` 和 `platform` 仅用于满足当前 Stardust tool 类型，不代表服务端执行代码。
- tool 参数不接受未声明字段。
- 每个 tool 根级的 `required` 是当前 `ticos-realtime-api` SDK 使用的 Stardust 定义格式。除 `navigate_to` 的 `oneOf` 分支外，本契约不在 `parameters` 内重复该字段；本地 handler 仍必须按根级 `required` 和第 5 节规则完整校验。
- 参数名称是稳定协议；人物、物体、地点、路线、动作和表情的可用名称见 [内置演示场景契约](./demo-scene.md)。

## 3. 最终 session 中的完整 tools 定义

最终发送到 Stardust 的 session 中，8 个内置 tool 定义必须与下列 JSON 等价。应用通过 `addTool` 注册 handler 后由 SDK 自动合并这些定义，不直接把它们手工追加到用户 JSON。

```json
[
  {
    "type": "function",
    "name": "navigate_to",
    "description": "让模拟人形机器人导航到指定地点或世界坐标。地点名称与坐标必须二选一。",
    "parameters": {
      "type": "object",
      "properties": {
        "location": {
          "type": "string",
          "description": "内置地点的名称或别名，例如厨房；使用 location 时不得同时提供 x、y 或 theta。"
        },
        "x": {
          "type": "number",
          "description": "目标世界坐标 X，单位为米。"
        },
        "y": {
          "type": "number",
          "description": "目标世界坐标 Y，单位为米。"
        },
        "theta": {
          "type": "number",
          "description": "仅用于 x/y 坐标形式的可选目标朝向，单位为弧度，逆时针为正；不得与 location 同时提供。"
        }
      },
      "oneOf": [
        {
          "required": ["location"],
          "not": {
            "anyOf": [
              { "required": ["x"] },
              { "required": ["y"] },
              { "required": ["theta"] }
            ]
          }
        },
        {
          "required": ["x", "y"],
          "not": { "required": ["location"] }
        }
      ],
      "additionalProperties": false
    },
    "required": [],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "start_patrol",
    "description": "让模拟人形机器人按指定的内置预设路线循环巡逻。",
    "parameters": {
      "type": "object",
      "properties": {
        "route": {
          "type": "string",
          "description": "内置巡逻路线名称或别名，例如日常巡视。"
        }
      },
      "additionalProperties": false
    },
    "required": ["route"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "follow_person",
    "description": "让模拟人形机器人持续跟随场景中的指定人物。",
    "parameters": {
      "type": "object",
      "properties": {
        "person": {
          "type": "string",
          "description": "内置人物名称或别名，例如张三。"
        }
      },
      "additionalProperties": false
    },
    "required": ["person"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "search_object",
    "description": "在模拟场景中搜索符合描述的物体并返回其位置。",
    "parameters": {
      "type": "object",
      "properties": {
        "object": {
          "type": "string",
          "description": "物体名称、别名、颜色或类别描述，例如红色杯子。"
        }
      },
      "additionalProperties": false
    },
    "required": ["object"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "pick_and_place",
    "description": "抓取指定物体，搬运并放置到指定的内置可放置位置。",
    "parameters": {
      "type": "object",
      "properties": {
        "object": {
          "type": "string",
          "description": "要抓取的物体名称或别名。"
        },
        "target_location": {
          "type": "string",
          "description": "内置可放置位置名称或别名，例如餐桌。"
        }
      },
      "additionalProperties": false
    },
    "required": ["object", "target_location"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "hand_over",
    "description": "把机器人手中指定物体递给场景中的人物，并等待页面上的人工接收确认；最长等待 60 秒。",
    "parameters": {
      "type": "object",
      "properties": {
        "person": {
          "type": "string",
          "description": "接收物体的人物名称或别名。"
        },
        "object": {
          "type": "string",
          "description": "可选的手持物名称或别名；机器人持有多个物体时必须提供。"
        }
      },
      "additionalProperties": false
    },
    "required": ["person"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "execute_action",
    "description": "让模拟人形机器人执行不接触人物或物体的内置身体动作。",
    "parameters": {
      "type": "object",
      "properties": {
        "action": {
          "type": "string",
          "enum": ["打招呼", "挥手", "招手", "问候", "点头", "同意", "轻点头", "摇头", "不同意", "摆头", "鞠躬", "致意", "弯腰致意", "指向左侧", "左指引", "指左边", "指向右侧", "右指引", "指右边"],
          "description": "要执行的规范动作名称或场景契约中列出的别名。"
        }
      },
      "additionalProperties": false
    },
    "required": ["action"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  },
  {
    "type": "function",
    "name": "set_expression",
    "description": "通过宇树 G1 脸部灯的颜色和闪烁方式设置机器人的内置表情，并保持到下次修改。",
    "parameters": {
      "type": "object",
      "properties": {
        "expression": {
          "type": "string",
          "enum": ["中性", "默认", "平静", "正常", "开心", "高兴", "微笑", "愉快", "难过", "悲伤", "伤心", "惊讶", "吃惊", "震惊", "思考", "思索", "疑惑", "抱歉", "歉意", "道歉"],
          "description": "要设置的规范表情名称或场景契约中列出的别名。"
        }
      },
      "additionalProperties": false
    },
    "required": ["expression"],
    "operation_mode": "client_mode",
    "execution_type": "synchronous",
    "result_handling": "process_in_llm",
    "code": "",
    "language": "python",
    "platform": "linux"
  }
]
```

## 4. 合并与注册

每次连接或应用 session JSON 时按以下顺序处理：

1. 深拷贝用户 session JSON，保持编辑器内容不变。
2. 用户 session 未提供 `model` 时创建运行时 `model` 对象；未提供 `model.tools` 时在运行时副本中创建空数组，避免 SDK 增量合并时遗留上一版用户 tools。`model` 存在但不是对象，或 `model.tools` 存在但不是数组时，不静默替换用户值，由本次应用/连接流程显示工具注入失败并保持上一份已生效配置。这仍属于运行时错误，不增加编辑器字段校验。
3. 从 `model.tools` 中移除与上述 8 个名称冲突的项，并为每个冲突记录 `builtin_tool_replaced` warning。
4. 保留其他用户 tools 的原始顺序。
5. 在新建的 `RealtimeClient` 连接前，通过 `addTool` 注册上述 8 个定义及对应本地 handler。当前 SDK 会在构建 Stardust session 时自动追加这些客户端 tools，因此应用层不得再把它们手工追加到 `model.tools`。
6. 对同一个 `RealtimeClient` 重复应用 session JSON 时不得再次注册已存在的内置 tools；只有创建新 client 时才重新注册一次。
7. 最终发送的 session 中每个内置 tool 恰好出现一次，其他非冲突用户 tools 及 `tool_choice` 等用户配置保持不变。
8. 任一步骤失败时不得调用 `updateSession` 发送半成品；保留上一份已生效 session，并在任务与事件面板记录具体失败原因。

不允许依赖 SDK 抛出的 “tool already defined” 错误处理同名冲突，因为需求约定是内置定义稳定覆盖用户同名项。

## 5. 参数校验

- tool 参数校验与 session JSON 编辑器校验是两个边界。编辑器仍只校验 JSON 和顶层对象；模型实际调用本地 tool 时必须按本文 schema 校验参数。
- tools JSON Schema 主要用于向模型描述参数，不假设 Stardust 或模型侧校验器完整支持 `oneOf`、`not` 等 draft 特性；是否执行始终以本地运行时校验结果为准。
- `navigate_to` 同时含 `location` 与任一坐标字段时失败；只提供 `x` 或只提供 `y` 时失败；坐标形式允许省略 `theta`。
- `location` 与 `theta` 不得组合；地点的朝向固定取场景契约中的地点 pose。需要覆盖朝向时必须改用 `x`、`y`、`theta` 坐标形式。
- 字符串在匹配前去除首尾空白；空字符串按缺失参数处理。
- 数值必须是有限数；`NaN`、`Infinity` 和字符串数字不接受隐式转换。
- 参数失败使用需求文档定义的 `status: failed, error_code: invalid_arguments`。
- `navigate_to` 的必测非法组合至少包含：`location+x/y`、`location+theta`、仅 `x`、仅 `y`；模型侧即使放行，本地 handler 也必须拒绝且不得创建任务。

### 5.1 handler 与 SDK 错误边界

- 本地适配层必须掌控参数 JSON 解析、schema 校验和 handler 执行的完整边界，并保证这些异常不会直接抛给 SDK。
- 参数 JSON 无法解析或 schema 校验失败时，必须返回需求文档规定的结构化失败输出，`error_code` 为 `invalid_arguments`。
- handler 的其他已知业务失败同样必须归一化为需求文档规定的完整结构，至少包含 `ok`、`status`、`tool`、`job_id`、`error_code`、`message` 和 `data`。
- 当前 SDK 的默认异常兜底只会发送 `{ "error": "..." }`，不满足本项目输出契约。实现必须在进入该兜底前捕获并归一化异常，或采用受控的 SDK 适配/补丁；不得把 SDK 默认错误对象当作本地 tool 的合法输出。
- 归一化输出仍由 SDK 作为 `function_call_output` 发送，并继续触发后续 response 创建。

## 6. 别名同步规则

修改地点、路线、人物、物体、动作或表情别名时，必须在同一次变更中同步更新 [内置演示场景契约](./demo-scene.md)、本文件中的相关 enum/description 和 `tests/contracts/aliases/` 下的别名契约测试，不允许只改运行时代码。
