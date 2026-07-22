import { ACTIONS, EXPRESSIONS, PLACEMENTS, SEARCH_REGIONS, createInitialWorld, matchName, matchObject } from '../data/scene';
import { isVisible, planPath, PlanningTimeoutError, pointBlocked } from './geometry';
import type { AppEvent, JobState, LocationPoint, Pose2D, ResourceName, RouteDefinition, ToolName, ToolOutput, WorldState } from '../types';

type EventSink = (event: Omit<AppEvent, 'id' | 'timestamp'>) => void;
type TaskEventSink = (event: { type: 'mock_humanoid.task_event'; job_id: string; tool: ToolName; status: 'failed' | 'cancelled'; error_code: string; message: string }) => void;
type Cancellation = { code: string; message: string };
type PathPlanner = (start: Pose2D, goal: Pose2D) => Pose2D[];

const sleep = (ms: number, signal?: AbortSignal) => new Promise<void>((resolve, reject) => {
  const timer = window.setTimeout(resolve, ms);
  if (signal) signal.addEventListener('abort', () => { clearTimeout(timer); reject(signal.reason || new DOMException('Aborted', 'AbortError')); }, { once: true });
});

function failure(tool: ToolName, jobId: string, code: string, message: string, status: 'failed' | 'cancelled' = 'failed'): ToolOutput {
  return { ok: false, status, tool, job_id: jobId, error_code: code, message, data: {} };
}

export class SimulationEngine {
  private state: WorldState = createInitialWorld();
  private listeners = new Set<() => void>();
  private resourceOwners = new Map<ResourceName, string>();
  private controllers = new Map<string, AbortController>();
  private continuous = new Set<string>();
  private handoverDecisions = new Map<string, (accepted: boolean) => void>();
  private counter = 0;
  private sceneCounter = 0;
  private clockMs = 0;
  private interval: number;

  constructor(private onEvent: EventSink, private onTaskEvent: TaskEventSink, private planner: PathPlanner = planPath) {
    this.interval = window.setInterval(() => this.tick(50), 50);
  }

  destroy() { clearInterval(this.interval); for (const id of this.controllers.keys()) this.cancelJob(id, 'user_cancelled', '页面已关闭'); }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => this.listeners.delete(listener); };
  getSnapshot = () => this.state;
  private emit() { this.state = { ...this.state, simulationTimeMs: this.clockMs, revision: this.state.revision + 1 }; for (const listener of this.listeners) listener(); }

  reset() {
    for (const id of [...this.controllers.keys()]) this.cancelJob(id, 'world_reset', '模拟世界已重置');
    this.state = createInitialWorld();
    this.clockMs = 0;
    this.sceneCounter = 0;
    this.resourceOwners.clear();
    this.controllers.clear();
    this.continuous.clear();
    this.handoverDecisions.clear();
    this.onEvent({ level: 'info', type: 'world_reset', summary: '模拟世界已恢复初始状态' });
    this.emit();
  }

  stopCurrent() {
    const jobs = this.state.jobs.filter((job) => job.status === 'running' || job.status === 'awaiting_confirmation');
    for (const job of jobs) if (job.resources.includes('locomotion') || job.resources.includes('manipulator')) this.cancelJob(job.id, 'user_cancelled', `${job.label} 已由用户停止`);
  }

  confirmHandover(jobId: string, accepted: boolean) { this.handoverDecisions.get(jobId)?.(accepted); }

  addLocation(input: { name: string; x: number; y: number; theta: number }) {
    const name = input.name.trim();
    if (!name) throw new Error('位置点名称不能为空');
    if (![input.x, input.y, input.theta].every(Number.isFinite)) throw new Error('位置点坐标和朝向必须是有限数');
    if (matchName(this.state.locations, name)) throw new Error(`位置点名称“${name}”已存在`);
    if (pointBlocked(input.x, input.y)) throw new Error('位置点位于地图外、障碍物内或安全膨胀区');
    const location: LocationPoint = { id: `custom-location-${++this.sceneCounter}`, name, aliases: [], x: input.x, y: input.y, theta: input.theta, builtin: false };
    this.state.locations = [...this.state.locations, location]; this.emit(); this.onEvent({ level: 'success', type: 'location_created', summary: `已新增位置点：${name}`, detail: location }); return location;
  }

  removeLocation(id: string) {
    const location = this.state.locations.find((item) => item.id === id); if (!location) throw new Error('位置点不存在'); if (location.builtin) throw new Error('内置位置点不可删除');
    const route = this.state.routes.find((item) => item.waypointIds.includes(id)); if (route) throw new Error(`位置点正被路线“${route.name}”引用`);
    this.state.locations = this.state.locations.filter((item) => item.id !== id); this.emit(); this.onEvent({ level: 'info', type: 'location_deleted', summary: `已删除位置点：${location.name}` });
  }

  addRoute(input: { name: string; waypointIds: string[] }) {
    const name = input.name.trim(); if (!name) throw new Error('路线名称不能为空'); if (matchName(this.state.routes, name)) throw new Error(`路线名称“${name}”已存在`); if (input.waypointIds.length < 2) throw new Error('路线至少需要两个位置点');
    if (input.waypointIds.some((id) => !this.state.locations.some((item) => item.id === id))) throw new Error('路线包含不存在的位置点');
    const route: RouteDefinition = { id: `custom-route-${++this.sceneCounter}`, name, aliases: [], waypointIds: [...input.waypointIds], builtin: false };
    this.state.routes = [...this.state.routes, route]; this.emit(); this.onEvent({ level: 'success', type: 'route_created', summary: `已保存路线：${name}`, detail: route }); return route;
  }

  removeRoute(id: string) { const route = this.state.routes.find((item) => item.id === id); if (!route) throw new Error('路线不存在'); if (route.builtin) throw new Error('内置路线不可删除'); this.state.routes = this.state.routes.filter((item) => item.id !== id); this.emit(); this.onEvent({ level: 'info', type: 'route_deleted', summary: `已删除路线：${route.name}` }); }

  navigateToLocation(id: string) { const location = this.state.locations.find((item) => item.id === id); if (!location) return Promise.resolve(failure('navigate_to', this.nextId(), 'not_found', '位置点不存在')); return this.invokeTool('navigate_to', { location: location.name }); }
  executeRoute(id: string) { const route = this.state.routes.find((item) => item.id === id); if (!route) return Promise.resolve(failure('start_patrol', this.nextId(), 'not_found', '路线不存在')); return this.invokeTool('start_patrol', { route: route.name }); }

  async invokeTool(tool: ToolName, args: unknown, callId?: string): Promise<ToolOutput> {
    this.onEvent({ level: 'info', type: 'tool_received', summary: `收到 ${tool}`, detail: args, callId });
    if (!args || typeof args !== 'object' || Array.isArray(args)) return failure(tool, this.nextId(), 'invalid_arguments', '参数必须是 JSON 对象');
    try {
      switch (tool) {
        case 'navigate_to': return await this.navigate(args as Record<string, unknown>, callId);
        case 'start_patrol': return this.startPatrol(args as Record<string, unknown>, callId);
        case 'follow_person': return this.followPerson(args as Record<string, unknown>, callId);
        case 'search_object': return await this.searchObject(args as Record<string, unknown>, callId);
        case 'pick_and_place': return await this.pickAndPlace(args as Record<string, unknown>, callId);
        case 'hand_over': return await this.handOver(args as Record<string, unknown>, callId);
        case 'execute_action': return await this.executeAction(args as Record<string, unknown>, callId);
        case 'set_expression': return this.setExpression(args as Record<string, unknown>, callId);
      }
    } catch (error) {
      const cancellation = error as Cancellation;
      const code = typeof cancellation?.code === 'string' ? cancellation.code : 'execution_failed';
      const message = cancellation?.message || (error instanceof Error ? error.message : '本地执行失败');
      return failure(tool, this.nextId(), code, message, code === 'user_cancelled' || code === 'superseded' || code === 'world_reset' ? 'cancelled' : 'failed');
    }
  }

  private nextId() { return `job_${Date.now().toString(36)}_${(++this.counter).toString(36)}`; }

  private createJob(tool: ToolName, label: string, resources: ResourceName[], callId?: string, preemptLocomotion = false) {
    if (preemptLocomotion) {
      const owner = this.resourceOwners.get('locomotion');
      const old = this.state.jobs.find((job) => job.id === owner);
      if (old && ['navigate_to', 'start_patrol', 'follow_person'].includes(old.tool)) this.cancelJob(old.id, 'superseded', `${old.label} 已被新的移动命令替代`);
    }
    for (const resource of resources) {
      const owner = this.resourceOwners.get(resource);
      if (owner) throw { code: 'robot_busy', message: `${resource} 正由其他任务占用` } satisfies Cancellation;
    }
    const id = this.nextId();
    const job: JobState = { id, tool, label, status: 'running', stage: '准备中', progress: 0, resources, path: [], trace: [{ ...this.state.robot.pose }], createdAt: Date.now(), callId };
    const controller = new AbortController();
    for (const resource of resources) this.resourceOwners.set(resource, id);
    this.controllers.set(id, controller);
    this.state.jobs = [...this.state.jobs.filter((item) => item.status === 'running' || item.status === 'awaiting_confirmation').slice(-3), job];
    this.emit();
    return { job, controller };
  }

  private updateJob(id: string, patch: Partial<JobState>) {
    this.state.jobs = this.state.jobs.map((job) => job.id === id ? { ...job, ...patch } : job);
    this.emit();
  }

  private finishJob(id: string, status: JobState['status'], stage: string, errorCode?: string) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job) return;
    this.updateJob(id, { status, stage, progress: status === 'succeeded' ? 1 : job.progress, errorCode, path: [] });
    for (const resource of job.resources) if (this.resourceOwners.get(resource) === id) this.resourceOwners.delete(resource);
    this.controllers.delete(id);
    this.handoverDecisions.delete(id);
    window.setTimeout(() => { this.state.jobs = this.state.jobs.filter((item) => item.id !== id); this.emit(); }, 4000);
  }

  private cancelJob(id: string, code: string, message: string) {
    const job = this.state.jobs.find((item) => item.id === id);
    if (!job || !this.controllers.has(id)) return;
    this.controllers.get(id)!.abort({ code, message });
    this.handoverDecisions.get(id)?.(false);
    if (this.continuous.has(id)) {
      this.continuous.delete(id);
      this.onTaskEvent({ type: 'mock_humanoid.task_event', job_id: id, tool: job.tool, status: code === 'person_lost' || code === 'unreachable' || code === 'planning_timeout' ? 'failed' : 'cancelled', error_code: code, message });
    }
    this.finishJob(id, code === 'person_lost' || code === 'unreachable' ? 'failed' : 'cancelled', message, code);
    this.onEvent({ level: 'warning', type: 'task_cancelled', summary: message, jobId: id });
  }

  private async navigate(args: Record<string, unknown>, callId?: string) {
    const hasLocation = Object.hasOwn(args, 'location');
    const hasCoords = Object.hasOwn(args, 'x') || Object.hasOwn(args, 'y') || Object.hasOwn(args, 'theta');
    if (hasLocation === hasCoords || Object.keys(args).some((key) => !['location', 'x', 'y', 'theta'].includes(key))) return failure('navigate_to', this.nextId(), 'invalid_arguments', 'location 与 x/y/theta 必须二选一');
    let target: Pose2D; let label: string;
    if (hasLocation) {
      if (typeof args.location !== 'string' || !args.location.trim()) return failure('navigate_to', this.nextId(), 'invalid_arguments', 'location 必须是非空字符串');
      const location = matchName(this.state.locations, args.location);
      if (!location) return failure('navigate_to', this.nextId(), 'not_found', `未找到导航地点「${args.location}」`);
      target = { x: location.x, y: location.y, theta: location.theta }; label = `前往${location.name}`;
    } else {
      if (typeof args.x !== 'number' || !Number.isFinite(args.x) || typeof args.y !== 'number' || !Number.isFinite(args.y) || (args.theta !== undefined && (typeof args.theta !== 'number' || !Number.isFinite(args.theta)))) return failure('navigate_to', this.nextId(), 'invalid_arguments', '坐标形式必须提供有限数值 x/y，theta 可选');
      target = { x: args.x, y: args.y, theta: typeof args.theta === 'number' ? args.theta : this.state.robot.pose.theta }; label = `前往 (${target.x.toFixed(2)}, ${target.y.toFixed(2)})`;
    }
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('navigate_to', label, ['locomotion'], callId, true); } catch (error) { const e = error as Cancellation; return failure('navigate_to', this.nextId(), e.code, e.message); }
    try {
      await this.moveTo(created.job, target, created.controller.signal);
      this.finishJob(created.job.id, 'succeeded', '已到达目标');
      return { ok: true, status: 'succeeded', tool: 'navigate_to', job_id: created.job.id, error_code: null, message: `${label}完成`, data: { pose: { ...this.state.robot.pose } } } satisfies ToolOutput;
    } catch (error) { return this.handleJobError(created.job, error); }
  }

  private startPatrol(args: Record<string, unknown>, callId?: string): ToolOutput {
    if (typeof args.route !== 'string' || !args.route.trim() || Object.keys(args).some((key) => key !== 'route')) return failure('start_patrol', this.nextId(), 'invalid_arguments', 'route 必须是非空路线名称');
    const route = matchName(this.state.routes, args.route); if (!route) return failure('start_patrol', this.nextId(), 'not_found', `未找到路线「${args.route}」`);
    const waypoints = route.waypointIds.map((id) => this.state.locations.find((item) => item.id === id)).filter((item): item is LocationPoint => !!item).map((item) => ({ ...item, aliases: [...item.aliases] }));
    if (waypoints.length !== route.waypointIds.length || waypoints.length < 2) return failure('start_patrol', this.nextId(), 'execution_failed', `路线「${route.name}」定义无效`);
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('start_patrol', route.name, ['locomotion'], callId, true); } catch (error) { const e = error as Cancellation; return failure('start_patrol', this.nextId(), e.code, e.message); }
    this.continuous.add(created.job.id);
    void this.patrolLoop(created.job, route.name, waypoints, created.controller.signal);
    return { ok: true, status: 'running', tool: 'start_patrol', job_id: created.job.id, error_code: null, message: `${route.name}已开始`, data: { route: route.name, waypoint_count: waypoints.length } };
  }

  private async patrolLoop(job: JobState, routeName: string, waypoints: LocationPoint[], signal: AbortSignal) {
    let index = 0, lap = 0;
    try {
      while (!signal.aborted) {
        const location = waypoints[index];
        this.updateJob(job.id, { label: `巡视 · ${location.name}`, stage: `前往 ${location.name}`, progress: null });
        await this.moveTo(job, location, signal);
        this.onEvent({ level: 'success', type: 'patrol_waypoint', summary: `已到达巡逻点：${location.name}`, jobId: job.id });
        this.updateJob(job.id, { stage: `${location.name}停留 3 秒` });
        await sleep(3000, signal);
        index = (index + 1) % waypoints.length; if (!index) lap++;
        this.updateJob(job.id, { label: `${routeName} · 第 ${lap + 1} 圈` });
      }
    } catch (error) { if (!signal.aborted) this.failContinuous(job, error); }
  }

  private followPerson(args: Record<string, unknown>, callId?: string): ToolOutput {
    const person = matchName(this.state.people, args.person);
    if (typeof args.person !== 'string' || Object.keys(args).some((key) => key !== 'person')) return failure('follow_person', this.nextId(), 'invalid_arguments', 'person 必须是人物名称');
    if (!person) return failure('follow_person', this.nextId(), 'not_found', `未找到人物「${args.person}」`);
    if (!isVisible(this.state.robot.pose, person.pose)) return failure('follow_person', this.nextId(), 'person_lost', `${person.name} 当前不可见`);
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('follow_person', `跟随 ${person.name}`, ['locomotion'], callId, true); } catch (error) { const e = error as Cancellation; return failure('follow_person', this.nextId(), e.code, e.message); }
    this.continuous.add(created.job.id); void this.followLoop(created.job, person.id, created.controller.signal);
    return { ok: true, status: 'running', tool: 'follow_person', job_id: created.job.id, error_code: null, message: `已开始跟随${person.name}`, data: { person_id: person.id, distance_m: 1 } };
  }

  private async followLoop(job: JobState, personId: string, signal: AbortSignal) {
    let invisibleMs = 0;
    try {
      while (!signal.aborted) {
        const person = this.state.people.find((item) => item.id === personId)!;
        if (!isVisible(this.state.robot.pose, person.pose)) { invisibleMs += 500; if (invisibleMs >= 5000) throw { code: 'person_lost', message: `${person.name} 已不可见超过 5 秒` }; await sleep(500, signal); continue; }
        invisibleMs = 0;
        const dx = this.state.robot.pose.x - person.pose.x, dy = this.state.robot.pose.y - person.pose.y, distance = Math.hypot(dx, dy);
        this.updateJob(job.id, { stage: `距离 ${distance.toFixed(2)}m`, progress: null });
        if (distance > 1.25) {
          const scale = 1 / Math.max(distance, 0.001);
          await this.moveTo(job, { x: person.pose.x + dx * scale, y: person.pose.y + dy * scale, theta: Math.atan2(person.pose.y - this.state.robot.pose.y, person.pose.x - this.state.robot.pose.x) }, signal, 10_000);
        }
        await sleep(500, signal);
      }
    } catch (error) { if (!signal.aborted) this.failContinuous(job, error); }
  }

  private async searchObject(args: Record<string, unknown>, callId?: string) {
    if (typeof args.object !== 'string' || !args.object.trim() || Object.keys(args).some((key) => key !== 'object')) return failure('search_object', this.nextId(), 'invalid_arguments', 'object 必须是非空字符串');
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('search_object', `搜索 ${args.object}`, ['body_action'], callId); } catch (error) { const e = error as Cancellation; return failure('search_object', this.nextId(), e.code, e.message); }
    const candidate = matchObject(this.state.objects, args.object);
    try {
      this.state.robot.action = '扫描'; this.emit();
      for (let index = 0; index < SEARCH_REGIONS.length; index++) {
        const region = SEARCH_REGIONS[index]; this.updateJob(created.job.id, { stage: `检查${region.name}`, progress: index / SEARCH_REGIONS.length });
        await sleep(350, created.controller.signal);
        if (candidate?.owner === 'world' && candidate.searchRegion === region.id) {
          candidate.highlightedUntil = Date.now() + 5000; this.state.robot.action = null; this.emit(); this.finishJob(created.job.id, 'succeeded', '已找到物体');
          return { ok: true, status: 'succeeded', tool: 'search_object', job_id: created.job.id, error_code: null, message: `已找到${candidate.name}`, data: { object_id: candidate.id, name: candidate.name, ...candidate.pose, region: region.name } } satisfies ToolOutput;
        }
      }
      this.state.robot.action = null; this.emit(); this.finishJob(created.job.id, 'failed', '未找到物体', 'not_found');
      return failure('search_object', created.job.id, 'not_found', `环境中未找到「${args.object}」`);
    } catch (error) { this.state.robot.action = null; return this.handleJobError(created.job, error); }
  }

  private async pickAndPlace(args: Record<string, unknown>, callId?: string) {
    if (typeof args.object !== 'string' || typeof args.target_location !== 'string' || Object.keys(args).some((key) => !['object', 'target_location'].includes(key))) return failure('pick_and_place', this.nextId(), 'invalid_arguments', 'object 与 target_location 必填');
    const object = matchObject(this.state.objects, args.object);
    if (!object || object.owner !== 'world') return failure('pick_and_place', this.nextId(), 'not_found', `未找到可操作物体「${args.object}」`);
    if (!object.graspable) return failure('pick_and_place', this.nextId(), 'object_not_graspable', `${object.name}不可抓取`);
    const placement = matchName(PLACEMENTS.map((item) => ({ ...item, aliases: item.aliases })), args.target_location);
    if (!placement) {
      const ordinary = matchName(this.state.locations, args.target_location);
      return failure('pick_and_place', this.nextId(), ordinary ? 'target_not_placeable' : 'not_found', ordinary ? `${ordinary.name}不是可放置表面` : `未找到放置位置「${args.target_location}」`);
    }
    const hand = !this.state.robot.leftHand ? 'left' : !this.state.robot.rightHand ? 'right' : null;
    if (!hand) return failure('pick_and_place', this.nextId(), 'no_free_hand', '机器人没有空闲手');
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('pick_and_place', `${object.name} → ${placement.name}`, ['locomotion', 'manipulator', 'body_action'], callId); } catch (error) { const e = error as Cancellation; return failure('pick_and_place', this.nextId(), e.code, e.message); }
    try {
      this.state.robot.action = '扫描'; this.updateJob(created.job.id, { stage: '定位物体', progress: 0.05 }); await sleep(600, created.controller.signal);
      const approach = { x: object.pose.x, y: Math.min(7.5, object.pose.y + 0.7), theta: -Math.PI / 2 };
      this.updateJob(created.job.id, { stage: `前往${object.name}`, progress: 0.1 }); await this.moveTo(created.job, approach, created.controller.signal, 60_000, [0.1, 0.35]);
      this.state.robot.action = '抓取'; this.updateJob(created.job.id, { stage: `抓取${object.name}`, progress: 0.38 }); await sleep(900, created.controller.signal);
      object.owner = `robot:${hand}`; object.searchRegion = null; if (hand === 'left') this.state.robot.leftHand = object.id; else this.state.robot.rightHand = object.id; this.emit();
      this.updateJob(created.job.id, { stage: `搬运到${placement.name}`, progress: 0.5 }); await this.moveTo(created.job, placement.navPose, created.controller.signal, 60_000, [0.5, 0.85]);
      this.state.robot.action = '放置'; this.updateJob(created.job.id, { stage: `放置到${placement.name}`, progress: 0.9 }); await sleep(900, created.controller.signal);
      object.owner = 'world'; object.pose = { ...placement.objectPose }; object.searchRegion = this.regionFor(object.pose.x, object.pose.y); if (hand === 'left') this.state.robot.leftHand = null; else this.state.robot.rightHand = null;
      this.state.robot.action = null; this.emit(); this.finishJob(created.job.id, 'succeeded', '抓放完成');
      return { ok: true, status: 'succeeded', tool: 'pick_and_place', job_id: created.job.id, error_code: null, message: `已将${object.name}放到${placement.name}`, data: { object_id: object.id, target_id: placement.id, pose: object.pose } } satisfies ToolOutput;
    } catch (error) { this.state.robot.action = null; return this.handleJobError(created.job, error, { holding_object: object.owner.startsWith('robot:') }); }
  }

  private async handOver(args: Record<string, unknown>, callId?: string) {
    if (typeof args.person !== 'string' || (args.object !== undefined && typeof args.object !== 'string') || Object.keys(args).some((key) => !['person', 'object'].includes(key))) return failure('hand_over', this.nextId(), 'invalid_arguments', 'person 必填，object 必须是字符串');
    const person = matchName(this.state.people, args.person); if (!person) return failure('hand_over', this.nextId(), 'not_found', `未找到人物「${args.person}」`);
    const heldIds = [this.state.robot.leftHand, this.state.robot.rightHand].filter(Boolean) as string[];
    if (!heldIds.length) return failure('hand_over', this.nextId(), 'not_holding_object', '机器人当前没有手持物');
    let object = args.object ? matchObject(this.state.objects.filter((item) => heldIds.includes(item.id)), args.object) : heldIds.length === 1 ? this.state.objects.find((item) => item.id === heldIds[0]) : undefined;
    if (!object) return failure('hand_over', this.nextId(), args.object ? 'not_holding_object' : 'invalid_arguments', args.object ? `机器人未持有「${args.object}」` : '持有多个物体时必须指定 object');
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('hand_over', `向${person.name}递交${object.name}`, ['locomotion', 'manipulator', 'body_action'], callId); } catch (error) { const e = error as Cancellation; return failure('hand_over', this.nextId(), e.code, e.message); }
    try {
      const robot = this.state.robot.pose, dx = robot.x - person.pose.x, dy = robot.y - person.pose.y, distance = Math.max(Math.hypot(dx, dy), 0.001);
      const target = { x: person.pose.x + dx / distance, y: person.pose.y + dy / distance, theta: Math.atan2(person.pose.y - robot.y, person.pose.x - robot.x) };
      await this.moveTo(created.job, target, created.controller.signal, 60_000, [0, 0.6]);
      if (!isVisible(this.state.robot.pose, person.pose)) throw { code: 'person_lost', message: `${person.name} 当前不可见` };
      this.state.robot.action = '递交'; this.updateJob(created.job.id, { status: 'awaiting_confirmation', stage: '等待接收确认', progress: 0.9 }); await sleep(700, created.controller.signal);
      const decision = await new Promise<boolean>((resolve, reject) => {
        const timer = window.setTimeout(() => { this.handoverDecisions.delete(created.job.id); reject({ code: 'confirmation_timeout', message: '等待接收确认超过 60 秒' }); }, 60_000);
        const monitor = window.setInterval(() => { if (!isVisible(this.state.robot.pose, person.pose)) { clearTimeout(timer); clearInterval(monitor); this.handoverDecisions.delete(created.job.id); reject({ code: 'person_lost', message: `${person.name} 已离开或不可见` }); } }, 250);
        this.handoverDecisions.set(created.job.id, (accepted) => { clearTimeout(timer); clearInterval(monitor); this.handoverDecisions.delete(created.job.id); resolve(accepted); });
        created.controller.signal.addEventListener('abort', () => { clearTimeout(timer); clearInterval(monitor); reject(created.controller.signal.reason); }, { once: true });
      });
      if (!decision) throw { code: 'user_cancelled', message: '用户取消交接' };
      object.owner = `person:${person.id}`; person.heldObjects.push(object.id); if (this.state.robot.leftHand === object.id) this.state.robot.leftHand = null; if (this.state.robot.rightHand === object.id) this.state.robot.rightHand = null;
      this.state.robot.action = null; this.emit(); this.finishJob(created.job.id, 'succeeded', '交接完成');
      return { ok: true, status: 'succeeded', tool: 'hand_over', job_id: created.job.id, error_code: null, message: `${person.name}已接收${object.name}`, data: { person_id: person.id, object_id: object.id } } satisfies ToolOutput;
    } catch (error) { this.state.robot.action = null; return this.handleJobError(created.job, error, { holding_object: object.owner.startsWith('robot:') }); }
  }

  private async executeAction(args: Record<string, unknown>, callId?: string) {
    if (typeof args.action !== 'string' || Object.keys(args).some((key) => key !== 'action')) return failure('execute_action', this.nextId(), 'invalid_arguments', 'action 必须是字符串');
    const action = ACTIONS[args.action.trim()]; if (!action) return failure('execute_action', this.nextId(), 'not_found', `不支持动作「${args.action}」`);
    let created: ReturnType<SimulationEngine['createJob']>;
    try { created = this.createJob('execute_action', action.canonical, ['body_action'], callId); } catch (error) { const e = error as Cancellation; return failure('execute_action', this.nextId(), e.code, e.message); }
    try {
      this.state.robot.action = action.canonical; this.emit(); const started = Date.now();
      while (Date.now() - started < action.durationMs) { this.updateJob(created.job.id, { stage: action.canonical, progress: Math.min(1, (Date.now() - started) / action.durationMs) }); await sleep(100, created.controller.signal); }
      this.state.robot.action = null; this.emit(); this.finishJob(created.job.id, 'succeeded', '动作完成');
      return { ok: true, status: 'succeeded', tool: 'execute_action', job_id: created.job.id, error_code: null, message: `已完成${action.canonical}`, data: { action: action.canonical } } satisfies ToolOutput;
    } catch (error) { this.state.robot.action = null; return this.handleJobError(created.job, error); }
  }

  private setExpression(args: Record<string, unknown>, callId?: string): ToolOutput {
    const jobId = this.nextId(); if (typeof args.expression !== 'string' || Object.keys(args).some((key) => key !== 'expression')) return failure('set_expression', jobId, 'invalid_arguments', 'expression 必须是字符串');
    const expression = EXPRESSIONS[args.expression.trim()]; if (!expression) return failure('set_expression', jobId, 'not_found', `不支持表情「${args.expression}」`);
    this.state.robot.expression = expression.canonical; this.state.robot.faceLight = { ...expression.state }; this.emit();
    this.onEvent({ level: 'success', type: 'expression_changed', summary: `表情已设为${expression.canonical}`, callId });
    return { ok: true, status: 'succeeded', tool: 'set_expression', job_id: jobId, error_code: null, message: `表情已设为${expression.canonical}`, data: { expression: expression.canonical, face_light: { ...this.state.robot.faceLight } } };
  }

  private async moveTo(job: JobState, target: Pose2D, signal: AbortSignal, timeoutMs = 60_000, progressRange: [number, number] = [0, 1]) {
    let path: Pose2D[];
    try { path = this.planner(this.state.robot.pose, target); } catch (error) { if (error instanceof PlanningTimeoutError) throw { code: 'planning_timeout', message: error.message }; throw { code: 'unreachable', message: '目标不可达' }; }
    const lengths = path.slice(1).map((point, index) => Math.hypot(point.x - path[index].x, point.y - path[index].y));
    const total = lengths.reduce((sum, length) => sum + length, 0); let travelled = 0; const started = this.clockMs;
    this.updateJob(job.id, { path, trace: [{ ...this.state.robot.pose }], stage: '导航中' });
    let traceStep = 0;
    for (let i = 1; i < path.length; i++) {
      const from = { ...this.state.robot.pose }, to = path[i], length = Math.hypot(to.x - from.x, to.y - from.y); let segment = 0;
      while (segment < length) {
        if (signal.aborted) throw signal.reason;
        if (this.clockMs - started > timeoutMs) throw { code: 'navigation_timeout', message: '移动超过时间上限' };
        const step = Math.min(0.6 * 0.05, length - segment); segment += step; travelled += step;
        const ratio = length ? segment / length : 1;
        this.state.robot.pose = { x: from.x + (to.x - from.x) * ratio, y: from.y + (to.y - from.y) * ratio, theta: Math.atan2(to.y - from.y, to.x - from.x) };
        const trace = this.state.jobs.find((item) => item.id === job.id)?.trace || []; traceStep++;
        const progress = progressRange[0] + (progressRange[1] - progressRange[0]) * (total ? travelled / total : 1);
        this.updateJob(job.id, { progress, trace: traceStep % 4 === 0 ? [...trace, { ...this.state.robot.pose }] : trace });
        await sleep(50, signal);
      }
    }
    this.state.robot.pose = { ...target }; this.emit();
  }

  private handleJobError(job: JobState, error: unknown, data: Record<string, unknown> = {}) {
    const cancellation = error as Cancellation; const code = cancellation?.code || 'execution_failed'; const message = cancellation?.message || (error instanceof Error ? error.message : '任务执行失败');
    const status = ['user_cancelled', 'superseded', 'world_reset', 'confirmation_timeout'].includes(code) ? 'cancelled' : 'failed';
    this.finishJob(job.id, status, message, code); this.onEvent({ level: status === 'failed' ? 'error' : 'warning', type: `task_${status}`, summary: message, jobId: job.id });
    return { ...failure(job.tool, job.id, code, message, status), data };
  }

  private failContinuous(job: JobState, error: unknown) {
    const e = error as Cancellation; const code = e.code || 'execution_failed', message = e.message || '持续任务执行失败'; this.continuous.delete(job.id);
    this.onTaskEvent({ type: 'mock_humanoid.task_event', job_id: job.id, tool: job.tool, status: 'failed', error_code: code, message }); this.finishJob(job.id, 'failed', message, code);
  }

  private regionFor(x: number, y: number) { return SEARCH_REGIONS.find((region) => x >= region.minX && x <= region.maxX && y >= region.minY && y <= region.maxY)?.id || null; }

  private tick(dt: number) {
    this.clockMs += dt; let changed = false;
    for (const person of this.state.people) changed = this.tickPerson(person, dt) || changed;
    const light = this.state.robot.faceLight; const nextPhase = light.period_ms ? (light.phase_elapsed_ms + dt) % light.period_ms : 0;
    if (nextPhase !== light.phase_elapsed_ms) { light.phase_elapsed_ms = nextPhase; changed = true; }
    const nextIntensity = this.lightIntensity(light); if (nextIntensity !== light.current_intensity) { light.current_intensity = nextIntensity; changed = true; }
    const robotPose = this.state.robot.pose;
    for (const object of this.state.objects) {
      if (object.highlightedUntil > 0 && object.highlightedUntil <= Date.now()) { object.highlightedUntil = 0; changed = true; }
      let nextPose: typeof object.pose | undefined;
      if (object.owner === 'robot:left') nextPose = { x: robotPose.x - Math.sin(robotPose.theta) * 0.28, y: robotPose.y + Math.cos(robotPose.theta) * 0.28, z: 1.05 };
      if (object.owner === 'robot:right') nextPose = { x: robotPose.x + Math.sin(robotPose.theta) * 0.28, y: robotPose.y - Math.cos(robotPose.theta) * 0.28, z: 1.05 };
      if (object.owner.startsWith('person:')) { const person = this.state.people.find((item) => `person:${item.id}` === object.owner); if (person) { const index = person.heldObjects.indexOf(object.id); nextPose = { x: person.pose.x, y: person.pose.y, z: 1 + Math.max(0, index) * 0.04 }; } }
      if (nextPose && (nextPose.x !== object.pose.x || nextPose.y !== object.pose.y || nextPose.z !== object.pose.z)) { object.pose = nextPose; changed = true; }
    }
    if (changed) this.emit();
  }

  private tickPerson(person: WorldState['people'][number], dt: number) {
    if (!person.route.length || person.speed <= 0) return false;
    if (person.routeWaitMs > 0) { person.routeWaitMs = Math.max(0, person.routeWaitMs - dt); return true; }
    const target = person.route[(person.routeIndex + 1) % person.route.length]; const dx = target.x - person.pose.x, dy = target.y - person.pose.y, distance = Math.hypot(dx, dy), step = person.speed * dt / 1000;
    if (distance <= step) { person.pose.x = target.x; person.pose.y = target.y; person.routeIndex = (person.routeIndex + 1) % person.route.length; person.routeWaitMs = 1000; }
    else { person.pose.x += dx / distance * step; person.pose.y += dy / distance * step; person.pose.theta = Math.atan2(dy, dx); }
    return true;
  }

  private lightIntensity(light: WorldState['robot']['faceLight']) {
    if (light.light_mode === 'steady' || !light.period_ms) return light.intensity_max;
    const t = light.phase_elapsed_ms;
    if (light.light_mode === 'breathe') return light.intensity_min + (light.intensity_max - light.intensity_min) * (1 - Math.cos(2 * Math.PI * t / light.period_ms)) / 2;
    if (light.light_mode === 'blink') return t < 420 ? light.intensity_max : light.intensity_min;
    return (t < 120 || (t >= 240 && t < 360)) ? light.intensity_max : light.intensity_min;
  }
}
