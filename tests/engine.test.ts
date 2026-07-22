import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SimulationEngine } from '../src/world/engine';
import { PlanningTimeoutError } from '../src/world/geometry';

describe('simulation engine contract', () => {
  let engine: SimulationEngine;
  let taskEvent: ReturnType<typeof vi.fn>;
  beforeEach(() => { vi.useFakeTimers(); (globalThis as any).window = globalThis; taskEvent = vi.fn(); engine = new SimulationEngine(() => undefined, taskEvent); });
  afterEach(() => { engine.destroy(); vi.useRealTimers(); });

  it('rejects forbidden navigate_to argument combinations locally', async () => {
    const result = await engine.invokeTool('navigate_to', { location: '厨房', theta: 1 });
    expect(result.status).toBe('failed'); expect(result.error_code).toBe('invalid_arguments'); expect(engine.getSnapshot().jobs).toHaveLength(0);
  });

  it('keeps navigation and placement name domains separate', async () => {
    const result = await engine.invokeTool('navigate_to', { location: '餐桌' });
    expect(result.error_code).toBe('not_found');
  });

  it('updates the complete FaceLightState', async () => {
    const result = await engine.invokeTool('set_expression', { expression: '开心' });
    expect(result.status).toBe('succeeded'); expect((result.data.face_light as any).light_mode).toBe('breathe'); expect(engine.getSnapshot().robot.expression).toBe('开心');
  });

  it('returns target_not_placeable for an ordinary location', async () => {
    const result = await engine.invokeTool('pick_and_place', { object: '红色杯子', target_location: '厨房' });
    expect(result.error_code).toBe('target_not_placeable');
  });

  it('starts and cancels patrol and follow continuous jobs with task events', async () => {
    const patrol = await engine.invokeTool('start_patrol', { route: '日常巡视' });
    expect(patrol.status).toBe('running'); engine.stopCurrent();
    expect(taskEvent).toHaveBeenCalledWith(expect.objectContaining({ tool: 'start_patrol', status: 'cancelled', error_code: 'user_cancelled' }));

    const follow = await engine.invokeTool('follow_person', { person: '张三' });
    expect(follow.status).toBe('running'); engine.stopCurrent();
    expect(taskEvent).toHaveBeenCalledWith(expect.objectContaining({ tool: 'follow_person', status: 'cancelled', error_code: 'user_cancelled' }));
  });

  it('completes hand_over only after page confirmation and transfers ownership', async () => {
    const resultPromise = engine.invokeTool('hand_over', { person: '李女士', object: '欢迎卡' });
    await vi.advanceTimersByTimeAsync(2500);
    const job = engine.getSnapshot().jobs.find((item) => item.tool === 'hand_over');
    expect(job?.status).toBe('awaiting_confirmation');
    engine.confirmHandover(job!.id, true);
    const result = await resultPromise;
    expect(result.status).toBe('succeeded');
    expect(engine.getSnapshot().robot.leftHand).toBeNull();
    expect(engine.getSnapshot().people.find((person) => person.name === '李女士')?.heldObjects).toContain('welcome-card');
    expect(engine.getSnapshot().objects.find((object) => object.id === 'welcome-card')?.owner).toBe('person:person-li');
  });

  it('does not publish revisions for a visually unchanged idle tick', async () => {
    for (const person of engine.getSnapshot().people) person.speed = 0;
    const listener = vi.fn(); const unsubscribe = engine.subscribe(listener);
    await vi.advanceTimersByTimeAsync(50); listener.mockClear();
    await vi.advanceTimersByTimeAsync(50);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('publishes once when a search highlight expires so the 2D canvas redraws', async () => {
    for (const person of engine.getSnapshot().people) person.speed = 0;
    await vi.advanceTimersByTimeAsync(50);
    const object = engine.getSnapshot().objects.find((item) => item.id === 'red-cup')!; object.highlightedUntil = Date.now() + 100;
    const listener = vi.fn(); const unsubscribe = engine.subscribe(listener);
    await vi.advanceTimersByTimeAsync(150);
    expect(object.highlightedUntil).toBe(0); expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it('completes a coordinate navigation through the real planner and movement loop', async () => {
    const resultPromise = engine.invokeTool('navigate_to', { x: 2, y: 2, theta: 0 });
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await resultPromise;
    expect(result.status).toBe('succeeded');
    expect(engine.getSnapshot().robot.pose).toEqual({ x: 2, y: 2, theta: 0 });
  });

  it('maps a planner deadline failure to planning_timeout and stops the job', async () => {
    engine.destroy(); engine = new SimulationEngine(() => undefined, taskEvent, () => { throw new PlanningTimeoutError(); });
    const result = await engine.invokeTool('navigate_to', { x: 2, y: 2 });
    expect(result).toEqual(expect.objectContaining({ status: 'failed', error_code: 'planning_timeout' }));
    expect(engine.getSnapshot().jobs[0]).toEqual(expect.objectContaining({ status: 'failed', errorCode: 'planning_timeout' }));
  });

  it('creates in-memory locations and makes them available to navigate_to', async () => {
    const location = engine.addLocation({ name: '讲解点', x: 2, y: 2, theta: 0 });
    expect(engine.getSnapshot().locations).toContainEqual(location);
    const resultPromise = engine.invokeTool('navigate_to', { location: '讲解点' });
    await vi.advanceTimersByTimeAsync(2_000);
    expect((await resultPromise).status).toBe('succeeded');
    expect(engine.getSnapshot().robot.pose).toEqual({ x: 2, y: 2, theta: 0 });
  });

  it('validates custom locations and protects built-in locations', () => {
    expect(() => engine.addLocation({ name: '前台', x: 3, y: 3, theta: 0 })).toThrow('已存在');
    expect(() => engine.addLocation({ name: '障碍点', x: 6, y: 3, theta: 0 })).toThrow('障碍物');
    expect(() => engine.addLocation({ name: '坏坐标', x: Number.NaN, y: 3, theta: 0 })).toThrow('有限数');
    expect(() => engine.removeLocation('front-desk')).toThrow('内置位置点不可删除');
  });

  it('creates ordered routes, executes them through start_patrol, and enforces references', async () => {
    const location = engine.addLocation({ name: '讲解点', x: 2, y: 2, theta: 0 });
    const route = engine.addRoute({ name: '讲解路线', waypointIds: ['front-desk', location.id] });
    const result = await engine.invokeTool('start_patrol', { route: '讲解路线' });
    expect(result).toEqual(expect.objectContaining({ status: 'running', data: { route: '讲解路线', waypoint_count: 2 } }));
    expect(() => engine.removeLocation(location.id)).toThrow('路线“讲解路线”引用');
    engine.removeRoute(route.id); engine.removeLocation(location.id);
    expect(engine.getSnapshot().locations.some((item) => item.id === location.id)).toBe(false);
    engine.stopCurrent();
  });

  it('clears all custom locations and routes on world reset', () => {
    const location = engine.addLocation({ name: '临时点', x: 2, y: 2, theta: 0 }); engine.addRoute({ name: '临时路线', waypointIds: ['front-desk', location.id] });
    engine.reset();
    expect(engine.getSnapshot().locations.every((item) => item.builtin)).toBe(true);
    expect(engine.getSnapshot().routes.every((item) => item.builtin)).toBe(true);
  });
});
