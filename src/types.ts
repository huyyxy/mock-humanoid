export type ToolName =
  | 'navigate_to'
  | 'start_patrol'
  | 'follow_person'
  | 'search_object'
  | 'pick_and_place'
  | 'hand_over'
  | 'execute_action'
  | 'set_expression';

export type ResourceName = 'locomotion' | 'manipulator' | 'body_action' | 'face';
export type JobStatus = 'running' | 'awaiting_confirmation' | 'succeeded' | 'failed' | 'cancelled';

export interface Pose2D { x: number; y: number; theta: number }
export interface Point3D { x: number; y: number; z: number }
export interface LocationPoint extends Pose2D { id: string; name: string; aliases: string[]; builtin: boolean }
export interface RouteDefinition { id: string; name: string; aliases: string[]; waypointIds: string[]; builtin: boolean }

export interface FaceLightState {
  color: string;
  light_mode: 'steady' | 'breathe' | 'blink' | 'double_blink';
  intensity_min: number;
  intensity_max: number;
  current_intensity: number;
  period_ms: number | null;
  phase_elapsed_ms: number;
}

export interface RobotState {
  pose: Pose2D;
  expression: string;
  faceLight: FaceLightState;
  action: string | null;
  leftHand: string | null;
  rightHand: string | null;
}

export interface PersonState {
  id: string;
  name: string;
  aliases: string[];
  pose: Pose2D;
  route: Point3D[];
  routeIndex: number;
  routeWaitMs: number;
  speed: number;
  heldObjects: string[];
}

export type ObjectOwner = 'world' | 'robot:left' | 'robot:right' | `person:${string}`;
export interface ObjectState {
  id: string;
  name: string;
  aliases: string[];
  category: string;
  graspable: boolean;
  pose: Point3D;
  owner: ObjectOwner;
  searchRegion: string | null;
  highlightedUntil: number;
}

export interface JobState {
  id: string;
  tool: ToolName;
  label: string;
  status: JobStatus;
  stage: string;
  progress: number | null;
  resources: ResourceName[];
  path: Pose2D[];
  trace: Pose2D[];
  createdAt: number;
  callId?: string;
  errorCode?: string;
}

export interface WorldState {
  robot: RobotState;
  people: PersonState[];
  objects: ObjectState[];
  locations: LocationPoint[];
  routes: RouteDefinition[];
  jobs: JobState[];
  simulationTimeMs: number;
  revision: number;
}

export interface ToolOutput {
  ok: boolean;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
  tool: ToolName;
  job_id: string;
  error_code: string | null;
  message: string;
  data: Record<string, unknown>;
}

export interface AppEvent {
  id: string;
  timestamp: number;
  level: 'info' | 'success' | 'warning' | 'error';
  type: string;
  summary: string;
  detail?: unknown;
  jobId?: string;
  callId?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tool' | 'system';
  text: string;
  timestamp: number;
  streaming?: boolean;
}

export interface RuntimeConfig {
  baseUrl: string;
  groupId: string;
  robotId: string;
  missingRequired: string[];
}

export type ConnectionStatus = 'idle' | 'validating' | 'connecting' | 'connected' | 'error';
