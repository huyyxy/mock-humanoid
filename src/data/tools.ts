import type { ToolName } from '../types';

const metadata = { operation_mode: 'client_mode', execution_type: 'synchronous', result_handling: 'process_in_llm', code: '', language: 'python', platform: 'linux' } as const;
const objectSchema = (properties: Record<string, unknown>) => ({ type: 'object', properties, additionalProperties: false });

export const BUILTIN_TOOLS = [
  { type: 'function', name: 'navigate_to', description: '让模拟人形机器人导航到指定地点或世界坐标。地点名称与坐标必须二选一。', parameters: { type: 'object', properties: { location: { type: 'string', description: '当前页面可用地点的名称，例如内置地点“厨房”或用户创建的位置点；使用 location 时不得同时提供 x、y 或 theta。' }, x: { type: 'number', description: '目标世界坐标 X，单位为米。' }, y: { type: 'number', description: '目标世界坐标 Y，单位为米。' }, theta: { type: 'number', description: '仅用于 x/y 坐标形式的可选目标朝向，单位为弧度，逆时针为正；不得与 location 同时提供。' } }, oneOf: [{ required: ['location'], not: { anyOf: [{ required: ['x'] }, { required: ['y'] }, { required: ['theta'] }] } }, { required: ['x', 'y'], not: { required: ['location'] } }], additionalProperties: false }, required: [], ...metadata },
  { type: 'function', name: 'start_patrol', description: '让模拟人形机器人按当前页面中的指定路线循环巡逻。', parameters: objectSchema({ route: { type: 'string', description: '当前页面可用巡逻路线名称，例如内置路线“日常巡视”或用户创建的路线。' } }), required: ['route'], ...metadata },
  { type: 'function', name: 'follow_person', description: '让模拟人形机器人持续跟随场景中的指定人物。', parameters: objectSchema({ person: { type: 'string', description: '内置人物名称或别名，例如张三。' } }), required: ['person'], ...metadata },
  { type: 'function', name: 'search_object', description: '在模拟场景中搜索符合描述的物体并返回其位置。', parameters: objectSchema({ object: { type: 'string', description: '物体名称、别名、颜色或类别描述，例如红色杯子。' } }), required: ['object'], ...metadata },
  { type: 'function', name: 'pick_and_place', description: '抓取指定物体，搬运并放置到指定的内置可放置位置。', parameters: objectSchema({ object: { type: 'string', description: '要抓取的物体名称或别名。' }, target_location: { type: 'string', description: '内置可放置位置名称或别名，例如餐桌。' } }), required: ['object', 'target_location'], ...metadata },
  { type: 'function', name: 'hand_over', description: '把机器人手中指定物体递给场景中的人物，并等待页面上的人工接收确认；最长等待 60 秒。', parameters: objectSchema({ person: { type: 'string', description: '接收物体的人物名称或别名。' }, object: { type: 'string', description: '可选的手持物名称或别名；机器人持有多个物体时必须提供。' } }), required: ['person'], ...metadata },
  { type: 'function', name: 'execute_action', description: '让模拟人形机器人执行不接触人物或物体的内置身体动作。', parameters: objectSchema({ action: { type: 'string', enum: ['打招呼', '挥手', '招手', '问候', '点头', '同意', '轻点头', '摇头', '不同意', '摆头', '鞠躬', '致意', '弯腰致意', '指向左侧', '左指引', '指左边', '指向右侧', '右指引', '指右边'], description: '要执行的规范动作名称或场景契约中列出的别名。' } }), required: ['action'], ...metadata },
  { type: 'function', name: 'set_expression', description: '通过宇树 G1 脸部灯的颜色和闪烁方式设置机器人的内置表情，并保持到下次修改。', parameters: objectSchema({ expression: { type: 'string', enum: ['中性', '默认', '平静', '正常', '开心', '高兴', '微笑', '愉快', '难过', '悲伤', '伤心', '惊讶', '吃惊', '震惊', '思考', '思索', '疑惑', '抱歉', '歉意', '道歉'], description: '要设置的规范表情名称或场景契约中列出的别名。' } }), required: ['expression'], ...metadata },
] as const;

export const BUILTIN_TOOL_NAMES = new Set<ToolName>(BUILTIN_TOOLS.map((tool) => tool.name as ToolName));

export function mergeBuiltinTools(session: Record<string, unknown>, warning: (name: string) => void) {
  const runtime = structuredClone(session);
  if (runtime.model === undefined) runtime.model = {};
  if (!runtime.model || typeof runtime.model !== 'object' || Array.isArray(runtime.model)) throw new Error('session.model 必须是对象');
  const model = runtime.model as Record<string, unknown>;
  if (model.tools === undefined) model.tools = [];
  if (!Array.isArray(model.tools)) throw new Error('session.model.tools 必须是数组');
  const userTools = model.tools.filter((tool) => {
    const name = tool && typeof tool === 'object' ? (tool as { name?: unknown }).name : undefined;
    if (typeof name === 'string' && BUILTIN_TOOL_NAMES.has(name as ToolName)) { warning(name); return false; }
    return true;
  });
  model.tools = [...userTools, ...BUILTIN_TOOLS];
  if (model.tool_choice === undefined) model.tool_choice = 'auto';
  return runtime;
}
