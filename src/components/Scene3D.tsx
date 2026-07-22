import { useEffect, useRef, useState } from 'react';
import { BoxGeometry, BufferGeometry, Color, CylinderGeometry, DirectionalLight, Float32BufferAttribute, GridHelper, Group, HemisphereLight, Mesh, MeshStandardMaterial, PerspectiveCamera, Points, PointsMaterial, Scene, SphereGeometry, TorusGeometry, WebGLRenderer } from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import URDFLoader from 'urdf-loader';
import { OBSTACLES } from '../data/scene';
import type { WorldState } from '../types';
import { worldThetaToSceneYaw, worldToScene, worldYBoundsToSceneZ } from '../world/coordinates';
import { rebuildNavigationOverlay } from './navigationOverlay3d';

interface G1SemanticMap {
  left_hand_link: string;
  right_hand_link: string;
  head_joints: string[];
  torso_joints: string[];
  leg_joints: string[];
  arm_joints: { left: string[]; right: string[] };
  face_light_target: { link: string; strategy: 'emissive_overlay' };
}

function seededPoints() {
  let seed = 0x71c0ffee; const random = () => ((seed = Math.imul(seed ^ (seed >>> 15), 1 | seed)) >>> 0) / 4294967296; const values: number[] = [];
  const addBox = (minX: number, maxX: number, minZ: number, maxZ: number, height: number) => { for (let i = 0; i < 220; i++) { const side = i % 5; const x = side === 1 ? minX : side === 2 ? maxX : minX + random() * (maxX - minX); const z = side === 3 ? minZ : side === 4 ? maxZ : minZ + random() * (maxZ - minZ); const y = side === 0 ? height : random() * height; values.push(x, y, z); } };
  addBox(0, 12, 0, .04, 2.5); addBox(0, 12, 7.96, 8, 2.5); addBox(0, .04, 0, 8, 2.5); addBox(11.96, 12, 0, 8, 2.5); for (const o of OBSTACLES) { const z = worldYBoundsToSceneZ(o.minY, o.maxY); addBox(o.minX, o.maxX, z.minZ, z.maxZ, o.height); } return values;
}

export function Scene3D({ world }: { world: WorldState }) {
  const hostRef = useRef<HTMLDivElement>(null); const worldRef = useRef(world); worldRef.current = world;
  const [modelStatus, setModelStatus] = useState('加载 G1 URDF…');
  useEffect(() => {
    const host = hostRef.current!; let frame = 0; const scene = new Scene(); scene.background = new Color('#06101b');
    const camera = new PerspectiveCamera(45, 1, .05, 100); camera.position.set(10, 9, 11); const renderer = new WebGLRenderer({ antialias: true }); renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.shadowMap.enabled = true; host.appendChild(renderer.domElement);
    const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(6, .7, 4); controls.enableDamping = true; controls.maxPolarAngle = Math.PI * .49;
    scene.add(new GridHelper(12, 24, '#2f5b72', '#173041').translateX(6).translateZ(4));
    const ambient = new HemisphereLight('#b8e5ff', '#07101a', 2.2); scene.add(ambient); const key = new DirectionalLight('#d8f3ff', 3); key.position.set(4, 10, 5); key.castShadow = true; scene.add(key);
    for (const o of OBSTACLES) { const mesh = new Mesh(new BoxGeometry(o.maxX - o.minX, o.height, o.maxY - o.minY), new MeshStandardMaterial({ color: '#203548', roughness: .8, metalness: .15 })); const position = worldToScene((o.minX + o.maxX) / 2, (o.minY + o.maxY) / 2, o.height / 2); mesh.position.set(position.x, position.y, position.z); mesh.receiveShadow = true; scene.add(mesh); }
    const pointGeometry = new BufferGeometry(); pointGeometry.setAttribute('position', new Float32BufferAttribute(seededPoints(), 3)); const pointCloud = new Points(pointGeometry, new PointsMaterial({ color: '#3b82a0', size: .025, transparent: true, opacity: .48 })); scene.add(pointCloud);
    const navigationOverlay = new Group(); navigationOverlay.name = 'navigation-overlay'; scene.add(navigationOverlay); let overlayRevision = -1;
    const robotRoot = new Group(); scene.add(robotRoot); let robot: any; let semantics: G1SemanticMap | undefined; let faceMaterial: MeshStandardMaterial | undefined;
    fetch('/assets/robots/unitree-g1/semantic-map.json').then((response) => {
      if (!response.ok) throw new Error(`semantic-map.json: HTTP ${response.status}`);
      return response.json() as Promise<G1SemanticMap>;
    }).then((semanticMap) => {
      semantics = semanticMap;
      const loader = new URDFLoader(); loader.load('/assets/robots/unitree-g1/g1.urdf', (loaded) => {
        robot = loaded; robot.rotation.x = -Math.PI / 2; robot.position.y = .79; robot.traverse((child: any) => { if (child.isMesh) { child.castShadow = true; child.receiveShadow = true; } }); robotRoot.add(robot);
        const head = robot.links?.[semanticMap.face_light_target.link]; if (head) { faceMaterial = new MeshStandardMaterial({ color: '#111827', emissive: '#E5E7EB', emissiveIntensity: .55, roughness: .35, metalness: .5 }); const ring = new Mesh(new TorusGeometry(.065, .014, 12, 40), faceMaterial); ring.position.set(.11, 0, 0); ring.rotation.y = Math.PI / 2; head.add(ring); }
        setModelStatus('UNITREE G1 · 29 DOF');
      }, undefined, (error) => { setModelStatus(`G1 模型加载失败：${String(error)}`); });
    }).catch((error) => setModelStatus(`G1 模型加载失败：${String(error)}`));
    const people = new Map<string, Group>(); const objects = new Map<string, Mesh>();
    const personMaterial = new MeshStandardMaterial({ color: '#8b5cf6', roughness: .7 });
    for (const person of world.people) { const group = new Group(); const body = new Mesh(new SphereGeometry(.18, 20, 16), personMaterial); body.scale.y = 2.6; body.position.y = .85; const head = new Mesh(new SphereGeometry(.13, 20, 16), new MeshStandardMaterial({ color: '#d8b7a2' })); head.position.y = 1.48; group.add(body, head); scene.add(group); people.set(person.id, group); }
    for (const object of world.objects) { const geometry = object.category === 'cup' ? new CylinderGeometry(.07, .06, .14, 16) : object.category === 'bottle' ? new CylinderGeometry(.045, .05, .22, 16) : new BoxGeometry(.16, .04, .12); const color = object.id === 'red-cup' ? '#ef4444' : object.graspable ? '#f6c453' : '#6d8496'; const mesh = new Mesh(geometry, new MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0 })); mesh.castShadow = true; scene.add(mesh); objects.set(object.id, mesh); }
    const resize = () => { const width = host.clientWidth, height = host.clientHeight; renderer.setSize(width, height, false); camera.aspect = width / Math.max(1, height); camera.updateProjectionMatrix(); }; const observer = new ResizeObserver(resize); observer.observe(host); resize();
    const animate = (time: number) => {
      const state = worldRef.current; if (state.revision !== overlayRevision) { rebuildNavigationOverlay(navigationOverlay, state.jobs); overlayRevision = state.revision; } const robotPosition = worldToScene(state.robot.pose.x, state.robot.pose.y); robotRoot.position.set(robotPosition.x, robotPosition.y, robotPosition.z); robotRoot.rotation.y = worldThetaToSceneYaw(state.robot.pose.theta);
      if (faceMaterial) { faceMaterial.emissive.set(state.robot.faceLight.color); faceMaterial.emissiveIntensity = state.robot.faceLight.current_intensity * 3; }
      if (robot && semantics) {
        const moving = state.jobs.some((job) => job.resources.includes('locomotion') && job.status === 'running'); const phase = time * .006;
        const [leftHip, , , leftKnee, , , rightHip, , , rightKnee] = semantics.leg_joints; const [, leftShoulderRoll] = semantics.arm_joints.left; const [, rightShoulderRoll, , rightElbow] = semantics.arm_joints.right; const waistPitch = semantics.torso_joints[2]; const headJoint = semantics.head_joints[0];
        robot.setJointValue?.(leftHip, moving ? Math.sin(phase) * .18 : 0); robot.setJointValue?.(rightHip, moving ? -Math.sin(phase) * .18 : 0); robot.setJointValue?.(leftKnee, moving ? Math.max(0, -Math.sin(phase)) * .25 : 0); robot.setJointValue?.(rightKnee, moving ? Math.max(0, Math.sin(phase)) * .25 : 0);
        const action = state.robot.action; const wave = action === '打招呼' || action === '扫描' || action === '递交'; robot.setJointValue?.(rightShoulderRoll, wave ? -1.1 : 0); robot.setJointValue?.(rightElbow, wave ? 1.3 + Math.sin(phase * 1.7) * .25 : .25); robot.setJointValue?.(leftShoulderRoll, action === '指向左侧' ? .9 : 0); robot.setJointValue?.(waistPitch, action === '鞠躬' || action === '抓取' || action === '放置' ? .35 : 0); robot.setJointValue?.(headJoint, action === '摇头' ? Math.sin(phase * 1.5) * .4 : 0);
      }
      for (const person of state.people) { const group = people.get(person.id); if (group) { const position = worldToScene(person.pose.x, person.pose.y); group.position.set(position.x, position.y, position.z); group.rotation.y = worldThetaToSceneYaw(person.pose.theta); } }
      for (const object of state.objects) { const mesh = objects.get(object.id); if (!mesh) continue; const handLink = object.owner === 'robot:left' ? semantics?.left_hand_link : object.owner === 'robot:right' ? semantics?.right_hand_link : undefined; const hand = handLink && robot?.links?.[handLink]; if (hand) { if (mesh.parent !== hand) hand.attach(mesh); mesh.position.set(.02, 0, .06); } else { if (mesh.parent !== scene) scene.attach(mesh); const position = worldToScene(object.pose.x, object.pose.y, Math.max(.04, object.pose.z)); mesh.position.set(position.x, position.y, position.z); } const material = mesh.material as MeshStandardMaterial; material.emissiveIntensity = object.highlightedUntil > Date.now() ? 1.8 : 0; mesh.visible = true; }
      controls.update(); renderer.render(scene, camera); frame = requestAnimationFrame(animate);
    }; frame = requestAnimationFrame(animate);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); controls.dispose(); renderer.dispose(); host.removeChild(renderer.domElement); scene.traverse((object: any) => { object.geometry?.dispose?.(); if (Array.isArray(object.material)) object.material.forEach((m: any) => m.dispose()); else object.material?.dispose?.(); }); };
  }, []);
  return <div className="viewport-panel scene-panel" ref={hostRef}><div className="viewport-label"><span className="live-dot cyan" />3D POINT CLOUD</div><div className={`model-status ${modelStatus.includes('失败') ? 'error' : ''}`}>{modelStatus}</div></div>;
}
