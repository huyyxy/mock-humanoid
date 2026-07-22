import type { FaceLightState, LocationPoint, ObjectState, PersonState, Point3D, Pose2D, RouteDefinition, WorldState } from '../types';

export const MAP = { width: 12, height: 8, resolution: 0.05, inflation: 0.4 } as const;

export interface Obstacle { id: string; name: string; minX: number; maxX: number; minY: number; maxY: number; height: number }
export const OBSTACLES: Obstacle[] = [
  { id: 'partition', name: '中央隔断', minX: 5.7, maxX: 6.5, minY: 2, maxY: 5.4, height: 2.4 },
  { id: 'front-desk-body', name: '前台台体', minX: 0.8, maxX: 2.6, minY: 0.6, maxY: 1, height: 0.95 },
  { id: 'kitchen-counter-body', name: '厨房操作台', minX: 9, maxX: 11.3, minY: 0.5, maxY: 1, height: 0.9 },
  { id: 'dining-table-body', name: '餐桌', minX: 7.4, maxX: 8.4, minY: 1.9, maxY: 2.8, height: 0.78 },
  { id: 'display-shelf-body', name: '展示架', minX: 4.1, maxX: 5.4, minY: 6.3, maxY: 6.7, height: 1.35 },
  { id: 'meeting-table-body', name: '会议桌', minX: 8.2, maxX: 10.4, minY: 5.7, maxY: 6.4, height: 0.78 },
];

export const LOCATIONS: LocationPoint[] = [
  { id: 'front-desk', name: '前台', aliases: ['接待台', '前台区域'], x: 1.5, y: 2, theta: -1.5708, builtin: true },
  { id: 'kitchen', name: '厨房', aliases: ['茶水间', '餐饮区'], x: 9.8, y: 1.45, theta: -1.5708, builtin: true },
  { id: 'meeting-room', name: '会议室', aliases: ['会议区'], x: 9.3, y: 6.9, theta: -1.5708, builtin: true },
  { id: 'meeting-room-entrance', name: '会议室入口', aliases: ['会议室外', '会议室门口'], x: 7.7, y: 5.2, theta: 0, builtin: true },
  { id: 'showcase', name: '展示区', aliases: ['展厅', '产品展示区'], x: 4.75, y: 5.75, theta: 1.5708, builtin: true },
  { id: 'charging-dock', name: '充电位', aliases: ['充电桩', '回充点'], x: 1, y: 6.5, theta: 3.1416, builtin: true },
];

export interface Placement { id: string; name: string; aliases: string[]; navPose: Pose2D; objectPose: Point3D }
export const PLACEMENTS: Placement[] = [
  { id: 'front-counter', name: '前台台面', aliases: ['前台桌面', '接待台台面'], navPose: { x: 1.5, y: 1.5, theta: -1.5708 }, objectPose: { x: 1.5, y: 0.9, z: 0.95 } },
  { id: 'kitchen-counter', name: '厨房台面', aliases: ['操作台', '茶水台'], navPose: { x: 9.8, y: 1.5, theta: -1.5708 }, objectPose: { x: 9.8, y: 0.85, z: 0.9 } },
  { id: 'dining-table', name: '餐桌', aliases: ['小餐桌'], navPose: { x: 6.9, y: 2.35, theta: 0 }, objectPose: { x: 7.9, y: 2.35, z: 0.78 } },
  { id: 'meeting-table', name: '会议桌', aliases: ['大会议桌'], navPose: { x: 7.65, y: 6.05, theta: 0 }, objectPose: { x: 8.5, y: 6.05, z: 0.78 } },
  { id: 'display-shelf', name: '展示架', aliases: ['展示台', '产品架'], navPose: { x: 4.75, y: 5.75, theta: 1.5708 }, objectPose: { x: 4.75, y: 6.45, z: 1.1 } },
];

export const SEARCH_REGIONS = [
  { id: 'front-desk-area', name: '前台区域', minX: 0.4, maxX: 3.2, minY: 0.4, maxY: 3 },
  { id: 'showcase-area', name: '展示区域', minX: 3.2, maxX: 5.6, minY: 5.4, maxY: 7.6 },
  { id: 'meeting-area', name: '会议区域', minX: 7.2, maxX: 11, minY: 4.8, maxY: 7.6 },
  { id: 'kitchen-area', name: '厨房区域', minX: 8.6, maxX: 11.6, minY: 0.4, maxY: 2 },
  { id: 'dining-area', name: '餐桌区域', minX: 6.8, maxX: 8.8, minY: 1.4, maxY: 3.4 },
] as const;

export const PATROL_ROUTE = ['front-desk', 'showcase', 'meeting-room-entrance', 'kitchen'] as const;
export const ROUTES: RouteDefinition[] = [{ id: 'daily-patrol', name: '日常巡视', aliases: ['日常巡逻', '例行巡视'], waypointIds: [...PATROL_ROUTE], builtin: true }];

export const ACTIONS: Record<string, { canonical: string; durationMs: number }> = Object.fromEntries(
  [
    ['打招呼', ['打招呼', 2500]], ['挥手', ['打招呼', 2500]], ['招手', ['打招呼', 2500]], ['问候', ['打招呼', 2500]],
    ['点头', ['点头', 1500]], ['同意', ['点头', 1500]], ['轻点头', ['点头', 1500]],
    ['摇头', ['摇头', 1800]], ['不同意', ['摇头', 1800]], ['摆头', ['摇头', 1800]],
    ['鞠躬', ['鞠躬', 2200]], ['致意', ['鞠躬', 2200]], ['弯腰致意', ['鞠躬', 2200]],
    ['指向左侧', ['指向左侧', 2000]], ['左指引', ['指向左侧', 2000]], ['指左边', ['指向左侧', 2000]],
    ['指向右侧', ['指向右侧', 2000]], ['右指引', ['指向右侧', 2000]], ['指右边', ['指向右侧', 2000]],
  ].map(([alias, value]) => [alias as string, { canonical: (value as [string, number])[0], durationMs: (value as [string, number])[1] }]),
);

const face = (color: string, light_mode: FaceLightState['light_mode'], min: number, max: number, period_ms: number | null): FaceLightState => ({
  color, light_mode, intensity_min: min, intensity_max: max, current_intensity: light_mode === 'breathe' ? min : max, period_ms, phase_elapsed_ms: 0,
});
const EXPRESSION_CANONICAL: Record<string, FaceLightState> = {
  中性: face('#E5E7EB', 'steady', 0.55, 0.55, null),
  开心: face('#22C55E', 'breathe', 0.35, 1, 1600),
  难过: face('#3B82F6', 'breathe', 0.2, 0.6, 2400),
  惊讶: face('#FACC15', 'double_blink', 0, 1, 900),
  思考: face('#06B6D4', 'blink', 0, 0.85, 1200),
  抱歉: face('#A855F7', 'breathe', 0.25, 0.7, 2200),
};
export const EXPRESSIONS: Record<string, { canonical: string; state: FaceLightState }> = {};
for (const [canonical, aliases] of Object.entries({ 中性: ['中性', '默认', '平静', '正常'], 开心: ['开心', '高兴', '微笑', '愉快'], 难过: ['难过', '悲伤', '伤心'], 惊讶: ['惊讶', '吃惊', '震惊'], 思考: ['思考', '思索', '疑惑'], 抱歉: ['抱歉', '歉意', '道歉'] })) {
  for (const alias of aliases) EXPRESSIONS[alias] = { canonical, state: EXPRESSION_CANONICAL[canonical] };
}

const person = (id: string, name: string, aliases: string[], pose: Pose2D, route: Point3D[], speed: number): PersonState => ({
  id, name, aliases, pose: { ...pose }, route, routeIndex: 0, routeWaitMs: 0, speed, heldObjects: [],
});

export function createInitialWorld(): WorldState {
  const people = [
    person('person-zhang', '张三', ['小张', '张先生'], { x: 4.2, y: 3.3, theta: 0 }, [
      { x: 4.2, y: 3.3, z: 0 }, { x: 4.5, y: 5.4, z: 0 }, { x: 3, y: 5.4, z: 0 }, { x: 3, y: 3.3, z: 0 },
    ], 0.35),
    person('person-li', '李女士', ['李小姐', '李姐'], { x: 2.7, y: 2, theta: 3.1416 }, [], 0),
  ];
  const objects: ObjectState[] = [
    { id: 'welcome-card', name: '欢迎卡', aliases: ['卡片', '迎宾卡'], category: 'card', graspable: true, pose: { x: 1.35, y: 2, z: 1.05 }, owner: 'robot:left', searchRegion: null, highlightedUntil: 0 },
    { id: 'red-cup', name: '红色杯子', aliases: ['红杯', '杯子', '红色马克杯', 'red cup'], category: 'cup', graspable: true, pose: { x: 9.6, y: 0.85, z: 0.98 }, owner: 'world', searchRegion: 'kitchen-area', highlightedUntil: 0 },
    { id: 'water-bottle', name: '矿泉水', aliases: ['水瓶', '瓶装水'], category: 'bottle', graspable: true, pose: { x: 8.9, y: 6.05, z: 0.9 }, owner: 'world', searchRegion: 'meeting-area', highlightedUntil: 0 },
    { id: 'brochure', name: '产品手册', aliases: ['宣传册', '手册'], category: 'booklet', graspable: true, pose: { x: 4.6, y: 6.45, z: 1.16 }, owner: 'world', searchRegion: 'showcase-area', highlightedUntil: 0 },
    { id: 'printer', name: '打印机', aliases: ['办公打印机'], category: 'appliance', graspable: false, pose: { x: 2.1, y: 0.9, z: 1.08 }, owner: 'world', searchRegion: 'front-desk-area', highlightedUntil: 0 },
    { id: 'green-plant', name: '绿植', aliases: ['植物', '盆栽'], category: 'decoration', graspable: false, pose: { x: 3.7, y: 6, z: 0 }, owner: 'world', searchRegion: 'showcase-area', highlightedUntil: 0 },
  ];
  return {
    robot: { pose: { x: 1.5, y: 2, theta: -1.5708 }, expression: '中性', faceLight: { ...EXPRESSION_CANONICAL.中性 }, action: null, leftHand: 'welcome-card', rightHand: null },
    people, objects, locations: LOCATIONS.map((item) => ({ ...item, aliases: [...item.aliases] })), routes: ROUTES.map((item) => ({ ...item, aliases: [...item.aliases], waypointIds: [...item.waypointIds] })), jobs: [], simulationTimeMs: 0, revision: 0,
  };
}

export function matchName<T extends { name: string; aliases: string[] }>(items: T[], input: unknown): T | undefined {
  if (typeof input !== 'string') return undefined;
  const normalized = input.trim().toLowerCase();
  return items.find((item) => [item.name, ...item.aliases].some((name) => name.toLowerCase() === normalized));
}

export function matchObject(objects: ObjectState[], input: unknown): ObjectState | undefined {
  if (typeof input !== 'string') return undefined;
  const normalized = input.trim().toLowerCase();
  return objects.find((item) => [item.name, ...item.aliases, item.category].some((name) => name.toLowerCase().includes(normalized) || normalized.includes(name.toLowerCase())));
}
