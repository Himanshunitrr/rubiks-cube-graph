"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import * as THREE from "three";

type Move =
  | "R" | "R'" | "U" | "U'" | "F" | "F'"
  | "L" | "L'" | "D" | "D'" | "B" | "B'"
  | "M" | "M'" | "E" | "E'" | "S" | "S'";

type CubeApi = {
  enqueue: (
    moves: Move[],
    onStep?: (move: Move, index: number) => void,
    onStart?: (move: Move, index: number) => void,
  ) => void;
  reset: () => void;
};

type RuntimeApi = {
  enqueue: CubeApi["enqueue"];
  reset: CubeApi["reset"];
};

type LayerPreview = {
  axis: "x" | "y" | "z";
  layer: number;
  angle: number;
};

const FACE_COLORS: Record<string, number> = {
  R: 0xef8428,
  L: 0xdf3e2f,
  U: 0xedb640,
  D: 0xf8f4eb,
  F: 0x1f6a4d,
  B: 0x1f4f91,
};

const GRAPH_COLORS: Record<string, string> = {
  R: "#ef8428",
  L: "#df3e2f",
  U: "#edb640",
  D: "#f8f4eb",
  F: "#1f6a4d",
  B: "#1f4f91",
};

const MOVE_SPEC: Record<Move, { axis: "x" | "y" | "z"; layer: number; angle: number }> = {
  R: { axis: "x", layer: 1, angle: -Math.PI / 2 },
  "R'": { axis: "x", layer: 1, angle: Math.PI / 2 },
  L: { axis: "x", layer: -1, angle: Math.PI / 2 },
  "L'": { axis: "x", layer: -1, angle: -Math.PI / 2 },
  U: { axis: "y", layer: 1, angle: -Math.PI / 2 },
  "U'": { axis: "y", layer: 1, angle: Math.PI / 2 },
  D: { axis: "y", layer: -1, angle: Math.PI / 2 },
  "D'": { axis: "y", layer: -1, angle: -Math.PI / 2 },
  F: { axis: "z", layer: 1, angle: -Math.PI / 2 },
  "F'": { axis: "z", layer: 1, angle: Math.PI / 2 },
  B: { axis: "z", layer: -1, angle: Math.PI / 2 },
  "B'": { axis: "z", layer: -1, angle: -Math.PI / 2 },
  M: { axis: "x", layer: 0, angle: Math.PI / 2 },
  "M'": { axis: "x", layer: 0, angle: -Math.PI / 2 },
  E: { axis: "y", layer: 0, angle: Math.PI / 2 },
  "E'": { axis: "y", layer: 0, angle: -Math.PI / 2 },
  S: { axis: "z", layer: 0, angle: -Math.PI / 2 },
  "S'": { axis: "z", layer: 0, angle: Math.PI / 2 },
};

const inverseMove = (move: Move): Move =>
  (move.endsWith("'") ? move[0] : `${move}'`) as Move;

const moveFromRotation = (
  axis: "x" | "y" | "z",
  layer: number,
  positive: boolean,
): Move => {
  if (axis === "x") {
    if (layer === 1) return positive ? "R'" : "R";
    if (layer === -1) return positive ? "L" : "L'";
    return positive ? "M" : "M'";
  }
  if (axis === "y") {
    if (layer === 1) return positive ? "U'" : "U";
    if (layer === -1) return positive ? "D" : "D'";
    return positive ? "E" : "E'";
  }
  if (layer === 1) return positive ? "F'" : "F";
  if (layer === -1) return positive ? "B" : "B'";
  return positive ? "S'" : "S";
};

type VectorTuple = [number, number, number];

const easeInOutQuart = (value: number) =>
  value < 0.5 ? 8 * value ** 4 : 1 - (-2 * value + 2) ** 4 / 2;

function makeSticker(color: number, face: string) {
  const geometry = new THREE.PlaneGeometry(0.76, 0.76);
  const material = new THREE.MeshStandardMaterial({
    color,
    roughness: 0.62,
    metalness: 0.02,
    side: THREE.FrontSide,
  });
  const sticker = new THREE.Mesh(geometry, material);
  sticker.userData.face = face;
  sticker.castShadow = true;
  return sticker;
}

const CubeScene = forwardRef<CubeApi, {
  onManualCommit: (move: Move) => void;
  onBusyChange: (busy: boolean) => void;
  previewRef: { current: LayerPreview | null };
}>(({ onManualCommit, onBusyChange, previewRef }, ref) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const runtimeRef = useRef<RuntimeApi | null>(null);
  const onManualCommitRef = useRef(onManualCommit);
  const onBusyChangeRef = useRef(onBusyChange);

  useEffect(() => {
    onManualCommitRef.current = onManualCommit;
    onBusyChangeRef.current = onBusyChange;
  }, [onManualCommit, onBusyChange]);

  useImperativeHandle(ref, () => ({
    enqueue(moves, onStep, onStart) {
      runtimeRef.current?.enqueue(moves, onStep, onStart);
    },
    reset() {
      runtimeRef.current?.reset();
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 100);
    camera.position.set(5.5, 4.5, 7.4);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    renderer.domElement.setAttribute("aria-hidden", "true");

    const root = new THREE.Group();
    root.rotation.set(-0.17, -0.5, 0.04);
    scene.add(root);

    const hemi = new THREE.HemisphereLight(0xfffbef, 0x9b8876, 2.15);
    scene.add(hemi);
    const key = new THREE.DirectionalLight(0xffffff, 3.6);
    key.position.set(4, 7, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(1024, 1024);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc9d8ff, 1.25);
    rim.position.set(-5, 1, -3);
    scene.add(rim);

    const floorMaterial = new THREE.ShadowMaterial({ color: 0x3b2a1d, opacity: 0.1 });
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(8, 8), floorMaterial);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -2.05;
    floor.receiveShadow = true;
    scene.add(floor);

    const cubelets: THREE.Group[] = [];
    const boxGeometry = new THREE.BoxGeometry(0.91, 0.91, 0.91);
    const bodyMaterial = new THREE.MeshStandardMaterial({
      color: 0xe5e0d6,
      roughness: 0.58,
      metalness: 0.02,
    });

    const addSticker = (
      group: THREE.Group,
      face: string,
      position: [number, number, number],
      rotation: [number, number, number],
    ) => {
      const sticker = makeSticker(FACE_COLORS[face], face);
      sticker.position.set(...position);
      sticker.rotation.set(...rotation);
      group.add(sticker);
    };

    const createCubelets = () => {
      cubelets.splice(0).forEach((cubelet) => root.remove(cubelet));
      for (let x = -1; x <= 1; x += 1) {
        for (let y = -1; y <= 1; y += 1) {
          for (let z = -1; z <= 1; z += 1) {
            const cubelet = new THREE.Group();
            cubelet.position.set(x, y, z);
            cubelet.userData.coord = new THREE.Vector3(x, y, z);

            const body = new THREE.Mesh(boxGeometry, bodyMaterial);
            body.castShadow = true;
            body.receiveShadow = true;
            cubelet.add(body);

            const offset = 0.462;
            if (x === 1) addSticker(cubelet, "R", [offset, 0, 0], [0, Math.PI / 2, 0]);
            if (x === -1) addSticker(cubelet, "L", [-offset, 0, 0], [0, -Math.PI / 2, 0]);
            if (y === 1) addSticker(cubelet, "U", [0, offset, 0], [-Math.PI / 2, 0, 0]);
            if (y === -1) addSticker(cubelet, "D", [0, -offset, 0], [Math.PI / 2, 0, 0]);
            if (z === 1) addSticker(cubelet, "F", [0, 0, offset], [0, 0, 0]);
            if (z === -1) addSticker(cubelet, "B", [0, 0, -offset], [0, Math.PI, 0]);

            cubelets.push(cubelet);
            root.add(cubelet);
          }
        }
      }
    };

    createCubelets();

    type QueueItem = { move: Move; onDone?: () => void; onStart?: () => void };
    const queue: QueueItem[] = [];
    let active: {
      item: QueueItem;
      pivot: THREE.Group;
      start: number;
      duration: number;
      angle: number;
      axis: "x" | "y" | "z";
    } | null = null;
    type ManualTurn = {
      pivot: THREE.Group;
      axis: "x" | "y" | "z";
      layer: number;
      angle: number;
      screenAxis: THREE.Vector2;
      rotationSign: number;
      pixelsPerQuarter: number;
    };
    let manualTurn: ManualTurn | null = null;
    let settling: {
      turn: ManualTurn;
      from: number;
      to: number;
      start: number;
      duration: number;
    } | null = null;
    let disposed = false;

    const beginNext = (timestamp: number) => {
      const item = queue[0];
      if (!item) {
        active = null;
        onBusyChangeRef.current(false);
        return;
      }

      const spec = MOVE_SPEC[item.move];
      const pivot = new THREE.Group();
      root.add(pivot);
      cubelets
        .filter((cubelet) => Math.round(cubelet.userData.coord[spec.axis]) === spec.layer)
        .forEach((cubelet) => pivot.add(cubelet));

      active = {
        item,
        pivot,
        start: timestamp,
        duration: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 1 : 900,
        angle: spec.angle,
        axis: spec.axis,
      };
      previewRef.current = { axis: spec.axis, layer: spec.layer, angle: 0 };
      item.onStart?.();
    };

    const finishMove = () => {
      if (!active) return;
      const { pivot, axis, angle, item } = active;
      pivot.rotation[axis] = angle;
      pivot.updateMatrix();

      [...pivot.children].forEach((child) => {
        child.applyMatrix4(pivot.matrix);
        root.add(child);
        child.position.set(
          Math.round(child.position.x),
          Math.round(child.position.y),
          Math.round(child.position.z),
        );
        child.userData.coord.copy(child.position);
      });
      root.remove(pivot);
      queue.shift();
      active = null;
      item.onDone?.();
      previewRef.current = null;
      if (!queue.length) onBusyChangeRef.current(false);
    };

    runtimeRef.current = {
      enqueue(moves, onStep, onStart) {
        if (!moves.length) return;
        const wasIdle = queue.length === 0 && !active && !manualTurn && !settling;
        moves.forEach((move, index) => {
          queue.push({
            move,
            onDone: () => onStep?.(move, index),
            onStart: () => onStart?.(move, index),
          });
        });
        if (wasIdle) onBusyChangeRef.current(true);
      },
      reset() {
        queue.splice(0);
        if (active) {
          [...active.pivot.children].forEach((child) => root.add(child));
          root.remove(active.pivot);
          active = null;
        }
        const interruptedTurn = manualTurn || settling?.turn;
        if (interruptedTurn) {
          interruptedTurn.pivot.rotation[interruptedTurn.axis] = 0;
          [...interruptedTurn.pivot.children].forEach((child) => root.add(child));
          root.remove(interruptedTurn.pivot);
          manualTurn = null;
          settling = null;
        }
        createCubelets();
        previewRef.current = null;
        onBusyChangeRef.current(false);
      },
    };

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let dragStart = { x: 0, y: 0 };
    let dragLast = { x: 0, y: 0 };
    let dragging = false;
    let dragDistance = 0;
    let gesture: { normal: THREE.Vector3; coord: THREE.Vector3 } | null = null;

    const hitAt = (clientX: number, clientY: number) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(cubelets, true)[0];
      if (!hit?.face) return null;

      let cubelet: THREE.Object3D | null = hit.object;
      while (cubelet && cubelet.parent !== root) cubelet = cubelet.parent;
      if (!cubelet?.userData.coord) return null;

      const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld);
      normal.applyQuaternion(root.getWorldQuaternion(new THREE.Quaternion()).invert());
      const ax = Math.abs(normal.x);
      const ay = Math.abs(normal.y);
      const az = Math.abs(normal.z);
      normal.set(
        ax >= ay && ax >= az ? Math.sign(normal.x) : 0,
        ay >= ax && ay >= az ? Math.sign(normal.y) : 0,
        az >= ax && az >= ay ? Math.sign(normal.z) : 0,
      );
      return { normal, coord: (cubelet.userData.coord as THREE.Vector3).clone() };
    };

    const projectLocalAxis = (axis: THREE.Vector3) => {
      const origin = root.localToWorld(new THREE.Vector3(0, 0, 0)).project(camera);
      const endpoint = root.localToWorld(axis.clone()).project(camera);
      return new THREE.Vector2(endpoint.x - origin.x, -(endpoint.y - origin.y)).normalize();
    };

    const lockManualTurn = (normal: THREE.Vector3, coord: THREE.Vector3, screenDrag: THREE.Vector2) => {
      const tangentAxes = [
        new THREE.Vector3(1, 0, 0),
        new THREE.Vector3(0, 1, 0),
        new THREE.Vector3(0, 0, 1),
      ].filter((axis) => Math.abs(axis.dot(normal)) < 0.5);
      let dragAxis = tangentAxes[0];
      let screenAxis = projectLocalAxis(dragAxis);
      tangentAxes.forEach((axis) => {
        const candidate = projectLocalAxis(axis);
        if (Math.abs(screenDrag.dot(candidate)) > Math.abs(screenDrag.dot(screenAxis))) {
          dragAxis = axis;
          screenAxis = candidate;
        }
      });

      const rotationAxis = normal.clone().cross(dragAxis);
      const components = [rotationAxis.x, rotationAxis.y, rotationAxis.z];
      const axisIndex = components.reduce(
        (best, value, index) => Math.abs(value) > Math.abs(components[best]) ? index : best,
        0,
      );
      const axis = (["x", "y", "z"] as const)[axisIndex];
      const layer = Math.round(coord[axis]);
      const pivot = new THREE.Group();
      root.add(pivot);
      cubelets
        .filter((cubelet) => Math.round(cubelet.userData.coord[axis]) === layer)
        .forEach((cubelet) => pivot.add(cubelet));

      manualTurn = {
        pivot,
        axis,
        layer,
        angle: 0,
        screenAxis,
        rotationSign: Math.sign(components[axisIndex]) || 1,
        pixelsPerQuarter: Math.max(72, Math.min(renderer.domElement.clientWidth, renderer.domElement.clientHeight) * 0.3),
      };
      previewRef.current = { axis, layer, angle: 0 };
      onBusyChangeRef.current(true);
    };

    const pointerDown = (event: PointerEvent) => {
      if (active || queue.length || settling || manualTurn) return;
      dragging = true;
      dragDistance = 0;
      dragStart = { x: event.clientX, y: event.clientY };
      dragLast = { ...dragStart };
      gesture = hitAt(event.clientX, event.clientY);
      renderer.domElement.setPointerCapture(event.pointerId);
      renderer.domElement.classList.add(gesture ? "is-slicing" : "is-dragging");
    };

    const pointerMove = (event: PointerEvent) => {
      if (!dragging) return;
      const dx = event.clientX - dragLast.x;
      const dy = event.clientY - dragLast.y;
      dragDistance += Math.abs(dx) + Math.abs(dy);
      if (gesture) {
        const totalDrag = new THREE.Vector2(
          event.clientX - dragStart.x,
          event.clientY - dragStart.y,
        );
        if (!manualTurn && totalDrag.length() > 5) {
          lockManualTurn(gesture.normal, gesture.coord, totalDrag.clone().normalize());
        }
        if (manualTurn) {
          const pixels = totalDrag.dot(manualTurn.screenAxis);
          manualTurn.angle = THREE.MathUtils.clamp(
            manualTurn.rotationSign * (pixels / manualTurn.pixelsPerQuarter) * (Math.PI / 2),
            -Math.PI / 2,
            Math.PI / 2,
          );
          manualTurn.pivot.rotation[manualTurn.axis] = manualTurn.angle;
          previewRef.current = {
            axis: manualTurn.axis,
            layer: manualTurn.layer,
            angle: manualTurn.angle,
          };
        }
      } else if (dragDistance > 3) {
        root.rotation.y += dx * 0.008;
        root.rotation.x = THREE.MathUtils.clamp(root.rotation.x + dy * 0.006, -0.75, 0.62);
      }
      dragLast = { x: event.clientX, y: event.clientY };
    };

    const pointerUp = () => {
      if (!dragging) return;
      dragging = false;
      renderer.domElement.classList.remove("is-dragging");
      renderer.domElement.classList.remove("is-slicing");
      if (manualTurn) {
        const target = Math.abs(manualTurn.angle) >= Math.PI / 6
          ? Math.sign(manualTurn.angle) * Math.PI / 2
          : 0;
        settling = {
          turn: manualTurn,
          from: manualTurn.angle,
          to: target,
          start: performance.now(),
          duration: 180 + Math.abs(target - manualTurn.angle) / (Math.PI / 2) * 180,
        };
        manualTurn = null;
      }
      gesture = null;
    };

    renderer.domElement.addEventListener("pointerdown", pointerDown);
    renderer.domElement.addEventListener("pointermove", pointerMove);
    renderer.domElement.addEventListener("pointerup", pointerUp);
    renderer.domElement.addEventListener("pointercancel", pointerUp);

    const resize = () => {
      const { width, height } = mount.getBoundingClientRect();
      renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
      camera.aspect = width / Math.max(height, 1);
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    resize();

    const finishManualSettle = () => {
      if (!settling) return;
      const { turn, to } = settling;
      turn.pivot.rotation[turn.axis] = to;
      if (to === 0) {
        [...turn.pivot.children].forEach((child) => root.add(child));
      } else {
        turn.pivot.updateMatrix();
        [...turn.pivot.children].forEach((child) => {
          child.applyMatrix4(turn.pivot.matrix);
          root.add(child);
          child.position.set(
            Math.round(child.position.x),
            Math.round(child.position.y),
            Math.round(child.position.z),
          );
          child.userData.coord.copy(child.position);
        });
        onManualCommitRef.current(moveFromRotation(turn.axis, turn.layer, to > 0));
      }
      root.remove(turn.pivot);
      settling = null;
      previewRef.current = null;
      if (!queue.length) onBusyChangeRef.current(false);
    };

    let animationFrame = 0;
    const render = (timestamp: number) => {
      if (disposed) return;
      if (!active && !manualTurn && !settling && !dragging && queue.length) beginNext(timestamp);
      if (active) {
        const progress = Math.min(1, (timestamp - active.start) / active.duration);
        const angle = active.angle * easeInOutQuart(progress);
        active.pivot.rotation[active.axis] = angle;
        previewRef.current = {
          axis: active.axis,
          layer: MOVE_SPEC[active.item.move].layer,
          angle,
        };
        if (progress >= 1) finishMove();
      }
      if (settling) {
        const progress = Math.min(1, (timestamp - settling.start) / settling.duration);
        const angle = settling.from + (settling.to - settling.from) * easeInOutQuart(progress);
        settling.turn.angle = angle;
        settling.turn.pivot.rotation[settling.turn.axis] = angle;
        previewRef.current = {
          axis: settling.turn.axis,
          layer: settling.turn.layer,
          angle,
        };
        if (progress >= 1) finishManualSettle();
      }
      renderer.render(scene, camera);
      animationFrame = requestAnimationFrame(render);
    };
    animationFrame = requestAnimationFrame(render);

    return () => {
      disposed = true;
      cancelAnimationFrame(animationFrame);
      observer.disconnect();
      renderer.domElement.removeEventListener("pointerdown", pointerDown);
      renderer.domElement.removeEventListener("pointermove", pointerMove);
      renderer.domElement.removeEventListener("pointerup", pointerUp);
      renderer.domElement.removeEventListener("pointercancel", pointerUp);
      renderer.dispose();
      boxGeometry.dispose();
      bodyMaterial.dispose();
      floor.geometry.dispose();
      floorMaterial.dispose();
      cubelets.forEach((cubelet) => {
        cubelet.children.forEach((child) => {
          if (child instanceof THREE.Mesh && child.geometry !== boxGeometry) child.geometry.dispose();
          if (child instanceof THREE.Mesh && child.material !== bodyMaterial) {
            (child.material as THREE.Material).dispose();
          }
        });
      });
      mount.removeChild(renderer.domElement);
      runtimeRef.current = null;
      previewRef.current = null;
    };
  }, [previewRef]);

  return <div className="cube-stage" ref={mountRef} role="img" aria-label="Interactive three-dimensional Rubik’s Cube" />;
});

CubeScene.displayName = "CubeScene";

type Point = { x: number; y: number };

type GraphCircle = {
  family: "top" | "left" | "right";
  center: Point;
  radius: number;
};

type GraphSlot = {
  point: Point;
};

type GraphNode = {
  id: string;
  color: keyof typeof GRAPH_COLORS;
  slotId: string;
};

type GraphNodeTransition = {
  from: Point;
  to: Point;
  circle?: GraphCircle;
  startAngle?: number;
  angleDelta?: number;
};

type GraphTransition = Record<string, GraphNodeTransition>;

const GRAPH_VIEWBOX = { width: 440, height: 455 };
const GRAPH_RING_RADII = { 1: 100, 0: 130, "-1": 160 } as const;
const GRAPH_CIRCLE_CENTERS: Record<GraphCircle["family"], Point> = {
  top: { x: 220, y: 160 },
  left: { x: 160, y: 282 },
  right: { x: 280, y: 282 },
};

const GRAPH_CIRCLES: GraphCircle[] = (["top", "left", "right"] as const).flatMap((family) =>
  ([1, 0, -1] as const).map((layer) => ({
    family,
    center: GRAPH_CIRCLE_CENTERS[family],
    radius: GRAPH_RING_RADII[layer],
  })),
);

const GRAPH_FACE_NORMALS: Record<keyof typeof GRAPH_COLORS, VectorTuple> = {
  L: [-1, 0, 0], U: [0, 1, 0], B: [0, 0, -1],
  F: [0, 0, 1], R: [1, 0, 0], D: [0, -1, 0],
};

const GRAPH_CELL_NAMES = ["NW", "N", "NE", "W", "C", "E", "SW", "S", "SE"] as const;
type GraphCell = typeof GRAPH_CELL_NAMES[number];
const graphSlotId = (face: keyof typeof GRAPH_COLORS, cell: GraphCell) => `${face}:${cell}`;

// The seeds reproduce the six compact clusters from the reference visualization.
// Their physical positions encode which two of the nine fixed circles intersect there.
const GRAPH_SLOT_SEEDS: Record<keyof typeof GRAPH_COLORS, Array<{ position: VectorTuple; seed: Point }>> = {
  L: [
    { position: [-1, -1, -1], seed: { x: 56, y: 127 } },
    { position: [-1, 0, -1], seed: { x: 92, y: 106 } },
    { position: [-1, 1, -1], seed: { x: 133, y: 95 } },
    { position: [-1, -1, 0], seed: { x: 55, y: 168 } },
    { position: [-1, 0, 0], seed: { x: 84, y: 143 } },
    { position: [-1, 1, 0], seed: { x: 117, y: 129 } },
    { position: [-1, -1, 1], seed: { x: 64, y: 209 } },
    { position: [-1, 0, 1], seed: { x: 86, y: 180 } },
    { position: [-1, 1, 1], seed: { x: 114, y: 162 } },
  ],
  U: [
    { position: [-1, 1, 0], seed: { x: 177, y: 125 } },
    { position: [-1, 1, -1], seed: { x: 213, y: 105 } },
    { position: [0, 1, -1], seed: { x: 250, y: 126 } },
    { position: [-1, 1, 1], seed: { x: 148, y: 154 } },
    { position: [0, 1, 0], seed: { x: 213, y: 138 } },
    { position: [1, 1, -1], seed: { x: 278, y: 153 } },
    { position: [0, 1, 1], seed: { x: 185, y: 158 } },
    { position: [1, 1, 1], seed: { x: 213, y: 173 } },
    { position: [1, 1, 0], seed: { x: 242, y: 158 } },
  ],
  B: [
    { position: [-1, 1, -1], seed: { x: 294, y: 95 } },
    { position: [-1, 0, -1], seed: { x: 333, y: 106 } },
    { position: [-1, -1, -1], seed: { x: 370, y: 127 } },
    { position: [0, 1, -1], seed: { x: 310, y: 129 } },
    { position: [0, 0, -1], seed: { x: 342, y: 143 } },
    { position: [0, -1, -1], seed: { x: 372, y: 169 } },
    { position: [1, 1, -1], seed: { x: 312, y: 162 } },
    { position: [1, 0, -1], seed: { x: 340, y: 179 } },
    { position: [1, -1, -1], seed: { x: 363, y: 209 } },
  ],
  F: [
    { position: [-1, 1, 1], seed: { x: 124, y: 197 } },
    { position: [0, 1, 1], seed: { x: 146, y: 227 } },
    { position: [1, 1, 1], seed: { x: 174, y: 244 } },
    { position: [-1, 0, 1], seed: { x: 115, y: 237 } },
    { position: [0, 0, 1], seed: { x: 144, y: 263 } },
    { position: [1, 0, 1], seed: { x: 177, y: 277 } },
    { position: [-1, -1, 1], seed: { x: 115, y: 279 } },
    { position: [0, -1, 1], seed: { x: 153, y: 300 } },
    { position: [1, -1, 1], seed: { x: 193, y: 311.25 } },
  ],
  R: [
    { position: [1, 1, 1], seed: { x: 252, y: 244 } },
    { position: [1, 1, 0], seed: { x: 279, y: 227 } },
    { position: [1, 1, -1], seed: { x: 302, y: 197 } },
    { position: [1, 0, 1], seed: { x: 250, y: 277 } },
    { position: [1, 0, 0], seed: { x: 282, y: 263 } },
    { position: [1, 0, -1], seed: { x: 312, y: 237 } },
    { position: [1, -1, 1], seed: { x: 234, y: 311 } },
    { position: [1, -1, 0], seed: { x: 274, y: 300 } },
    { position: [1, -1, -1], seed: { x: 310, y: 279 } },
  ],
  D: [
    { position: [0, -1, 1], seed: { x: 185, y: 348 } },
    { position: [1, -1, 1], seed: { x: 213, y: 332 } },
    { position: [1, -1, 0], seed: { x: 242, y: 347 } },
    { position: [-1, -1, 1], seed: { x: 148, y: 352 } },
    { position: [0, -1, 0], seed: { x: 213, y: 367 } },
    { position: [1, -1, -1], seed: { x: 278, y: 352 } },
    { position: [-1, -1, 0], seed: { x: 177, y: 380 } },
    { position: [-1, -1, -1], seed: { x: 213, y: 400 } },
    { position: [0, -1, -1], seed: { x: 249, y: 380 } },
  ],
};

const circleForAxisLayer = (axis: "x" | "y" | "z", layer: number): GraphCircle => ({
  family: axis === "x" ? "right" : axis === "y" ? "top" : "left",
  center: GRAPH_CIRCLE_CENTERS[axis === "x" ? "right" : axis === "y" ? "top" : "left"],
  radius: GRAPH_RING_RADII[layer as keyof typeof GRAPH_RING_RADII],
});

function circleIntersections(first: GraphCircle, second: GraphCircle): [Point, Point] {
  const dx = second.center.x - first.center.x;
  const dy = second.center.y - first.center.y;
  const distance = Math.hypot(dx, dy);
  const along = (first.radius ** 2 - second.radius ** 2 + distance ** 2) / (2 * distance);
  const height = Math.sqrt(Math.max(0, first.radius ** 2 - along ** 2));
  const mid = {
    x: first.center.x + dx * along / distance,
    y: first.center.y + dy * along / distance,
  };
  const offset = { x: -dy * height / distance, y: dx * height / distance };
  return [
    { x: mid.x + offset.x, y: mid.y + offset.y },
    { x: mid.x - offset.x, y: mid.y - offset.y },
  ];
}

function buildGraphSlots() {
  const slots = new Map<string, GraphSlot>();
  (Object.keys(GRAPH_SLOT_SEEDS) as Array<keyof typeof GRAPH_COLORS>).forEach((face) => {
    const normal = GRAPH_FACE_NORMALS[face];
    const normalAxis = normal[0] ? 0 : normal[1] ? 1 : 2;
    GRAPH_SLOT_SEEDS[face].forEach(({ position, seed }, index) => {
      const axes = ([0, 1, 2] as const).filter((axis) => axis !== normalAxis);
      const axisNames = ["x", "y", "z"] as const;
      const intersections = circleIntersections(
        circleForAxisLayer(axisNames[axes[0]], position[axes[0]]),
        circleForAxisLayer(axisNames[axes[1]], position[axes[1]]),
      );
      const point = intersections.reduce((closest, candidate) =>
        Math.hypot(candidate.x - seed.x, candidate.y - seed.y)
          < Math.hypot(closest.x - seed.x, closest.y - seed.y)
          ? candidate : closest,
      );
      slots.set(graphSlotId(face, GRAPH_CELL_NAMES[index]), { point });
    });
  });
  if (slots.size !== 54) throw new Error("The state map must contain exactly 54 fixed facelet slots.");
  return slots;
}

const GRAPH_SLOTS = buildGraphSlots();

const graphSlice = (
  face: keyof typeof GRAPH_COLORS,
  cells: readonly GraphCell[],
  reverse = false,
) => (reverse ? [...cells].reverse() : [...cells]).map((cell) => graphSlotId(face, cell));

const GRAPH_FACE_SLICES = {
  top: ["NW", "N", "NE"],
  middle: ["W", "C", "E"],
  bottom: ["SW", "S", "SE"],
  left: ["NW", "W", "SW"],
  center: ["N", "C", "S"],
  right: ["NE", "E", "SE"],
  diagonalForward: ["NE", "C", "SW"],
  diagonalBack: ["NW", "C", "SE"],
  cornerNW: ["W", "NW", "N"],
  cornerNE: ["N", "NE", "E"],
  cornerSE: ["E", "SE", "S"],
  cornerSW: ["S", "SW", "W"],
} satisfies Record<string, readonly GraphCell[]>;

const GRAPH_RING_SLOTS = {
  topInner: [
    ...graphSlice("B", GRAPH_FACE_SLICES.left),
    ...graphSlice("R", GRAPH_FACE_SLICES.top, true),
    ...graphSlice("F", GRAPH_FACE_SLICES.top, true),
    ...graphSlice("L", GRAPH_FACE_SLICES.right, true),
  ],
  topMiddle: [
    ...graphSlice("B", GRAPH_FACE_SLICES.center),
    ...graphSlice("R", GRAPH_FACE_SLICES.middle, true),
    ...graphSlice("F", GRAPH_FACE_SLICES.middle, true),
    ...graphSlice("L", GRAPH_FACE_SLICES.center, true),
  ],
  topOuter: [
    ...graphSlice("B", GRAPH_FACE_SLICES.right),
    ...graphSlice("R", GRAPH_FACE_SLICES.bottom, true),
    ...graphSlice("F", GRAPH_FACE_SLICES.bottom, true),
    ...graphSlice("L", GRAPH_FACE_SLICES.left, true),
  ],
  leftInner: [
    ...graphSlice("L", GRAPH_FACE_SLICES.bottom),
    ...graphSlice("U", GRAPH_FACE_SLICES.cornerSW, true),
    ...graphSlice("R", GRAPH_FACE_SLICES.left),
    ...graphSlice("D", GRAPH_FACE_SLICES.cornerNW, true),
  ],
  leftMiddle: [
    ...graphSlice("L", GRAPH_FACE_SLICES.middle),
    ...graphSlice("U", GRAPH_FACE_SLICES.diagonalBack),
    ...graphSlice("R", GRAPH_FACE_SLICES.center),
    ...graphSlice("D", GRAPH_FACE_SLICES.diagonalForward),
  ],
  leftOuter: [
    ...graphSlice("L", GRAPH_FACE_SLICES.top),
    ...graphSlice("U", GRAPH_FACE_SLICES.cornerNE),
    ...graphSlice("R", GRAPH_FACE_SLICES.right),
    ...graphSlice("D", GRAPH_FACE_SLICES.cornerSE),
  ],
  rightInner: [
    ...graphSlice("D", GRAPH_FACE_SLICES.cornerNE, true),
    ...graphSlice("F", GRAPH_FACE_SLICES.right, true),
    ...graphSlice("U", GRAPH_FACE_SLICES.cornerSE, true),
    ...graphSlice("B", GRAPH_FACE_SLICES.bottom),
  ],
  rightMiddle: [
    ...graphSlice("D", GRAPH_FACE_SLICES.diagonalBack, true),
    ...graphSlice("F", GRAPH_FACE_SLICES.center, true),
    ...graphSlice("U", GRAPH_FACE_SLICES.diagonalForward, true),
    ...graphSlice("B", GRAPH_FACE_SLICES.middle),
  ],
  rightOuter: [
    ...graphSlice("D", GRAPH_FACE_SLICES.cornerSW),
    ...graphSlice("F", GRAPH_FACE_SLICES.left, true),
    ...graphSlice("U", GRAPH_FACE_SLICES.cornerNW),
    ...graphSlice("B", GRAPH_FACE_SLICES.top),
  ],
};

type GraphMoveBase = "R" | "U" | "F" | "L" | "D" | "B" | "M" | "E" | "S";

const GRAPH_RING_FOR_MOVE: Record<GraphMoveBase, readonly string[]> = {
  U: GRAPH_RING_SLOTS.topInner,
  E: GRAPH_RING_SLOTS.topMiddle,
  D: GRAPH_RING_SLOTS.topOuter,
  F: GRAPH_RING_SLOTS.leftInner,
  S: GRAPH_RING_SLOTS.leftMiddle,
  B: GRAPH_RING_SLOTS.leftOuter,
  R: GRAPH_RING_SLOTS.rightInner,
  M: GRAPH_RING_SLOTS.rightMiddle,
  L: GRAPH_RING_SLOTS.rightOuter,
};

const createSolvedGraphNodes = (): GraphNode[] =>
  (Object.keys(GRAPH_SLOT_SEEDS) as Array<keyof typeof GRAPH_COLORS>).flatMap((face) =>
    GRAPH_CELL_NAMES.map((cell) => {
      const slotId = graphSlotId(face, cell);
      return { id: `${face}-${cell}`, color: face, slotId };
    }),
  );

function assertGraphInventory(nodes: GraphNode[]) {
  const colorCounts = nodes.reduce<Record<string, number>>((counts, node) => {
    counts[node.color] = (counts[node.color] ?? 0) + 1;
    return counts;
  }, {});
  if (
    nodes.length !== 54
    || new Set(nodes.map((node) => node.id)).size !== 54
    || new Set(nodes.map((node) => node.slotId)).size !== 54
    || Object.values(colorCounts).some((count) => count !== 9)
  ) {
    throw new Error("The graph requires 54 unique facelets with exactly nine nodes per color.");
  }
}

function turnGraphNodes(nodes: GraphNode[], move: Move) {
  assertGraphInventory(nodes);
  const base = move[0] as GraphMoveBase;
  const ring = GRAPH_RING_FOR_MOVE[base];
  const invertedOuter = base === "L" || base === "D" || base === "B";
  const ringShift = (move.endsWith("'") ? -3 : 3) * (invertedOuter ? -1 : 1);
  const targetBySlot = new Map<string, string>();
  ring.forEach((slotId, index) => {
    targetBySlot.set(slotId, ring[(index + ringShift + ring.length) % ring.length]);
  });

  if (Math.abs(MOVE_SPEC[move].layer) === 1) {
    const face = base as keyof typeof GRAPH_COLORS;
    const invertFace = face === "D" || face === "B" || face === "L";
    const counterRotate = move.endsWith("'") !== invertFace;
    const step = counterRotate ? -1 : 1;
    const cycles: readonly GraphCell[][] = [
      ["NW", "NE", "SE", "SW"],
      ["N", "E", "S", "W"],
    ];
    cycles.forEach((cycle) => {
      cycle.forEach((cell, index) => {
        targetBySlot.set(
          graphSlotId(face, cell),
          graphSlotId(face, cycle[(index + step + cycle.length) % cycle.length]),
        );
      });
    });
  }

  return nodes.map((node) => ({
    ...node,
    slotId: targetBySlot.get(node.slotId) ?? node.slotId,
  }));
}

function createGraphTransition(
  nodes: GraphNode[],
  move: Move,
): GraphTransition {
  assertGraphInventory(nodes);
  const destination = turnGraphNodes(nodes, move);
  const transition: GraphTransition = {};
  const base = move[0] as GraphMoveBase;
  const ring = GRAPH_RING_FOR_MOVE[base];
  const ringSlots = new Set(ring);
  const invertedOuter = base === "L" || base === "D" || base === "B";
  const ringShift = (move.endsWith("'") ? -3 : 3) * (invertedOuter ? -1 : 1);
  const circle = circleForAxisLayer(MOVE_SPEC[move].axis, MOVE_SPEC[move].layer);
  const firstFrom = GRAPH_SLOTS.get(ring[0])?.point;
  const firstTo = GRAPH_SLOTS.get(ring[(ringShift + ring.length) % ring.length])?.point;
  if (!firstFrom || !firstTo) throw new Error(`Missing ring geometry for ${move}.`);
  const firstStart = Math.atan2(firstFrom.y - circle.center.y, firstFrom.x - circle.center.x);
  const firstEnd = Math.atan2(firstTo.y - circle.center.y, firstTo.x - circle.center.x);
  const ringDirection = Math.sign(Math.atan2(Math.sin(firstEnd - firstStart), Math.cos(firstEnd - firstStart)));

  destination.forEach((node, index) => {
    const origin = nodes[index];
    if (node.slotId === origin.slotId) return;
    const from = GRAPH_SLOTS.get(origin.slotId)?.point;
    const to = GRAPH_SLOTS.get(node.slotId)?.point;
    if (!from || !to) throw new Error(`Missing fixed graph slot for ${node.id}.`);

    if (!ringSlots.has(origin.slotId)) {
      transition[node.id] = { from, to };
      return;
    }

    const startAngle = Math.atan2(from.y - circle.center.y, from.x - circle.center.x);
    const targetAngle = Math.atan2(to.y - circle.center.y, to.x - circle.center.x);
    let angleDelta = Math.atan2(Math.sin(targetAngle - startAngle), Math.cos(targetAngle - startAngle));
    if (Math.sign(angleDelta) !== ringDirection) angleDelta += ringDirection * Math.PI * 2;
    transition[node.id] = { from, to, circle, startAngle, angleDelta };
  });

  const expectedAffected = Math.abs(MOVE_SPEC[move].layer) === 1 ? 20 : 12;
  if (Object.keys(transition).length !== expectedAffected) {
    throw new Error(`Expected ${expectedAffected} affected graph nodes for ${move}.`);
  }
  const ringNodes = Object.values(transition).filter((node) => node.circle);
  if (ringNodes.length !== 12) throw new Error(`Expected exactly 12 ring nodes for ${move}.`);
  if (ringNodes.some((node) => Math.sign(node.angleDelta ?? 0) !== ringDirection)) {
    throw new Error(`${move} contains opposing ring directions.`);
  }
  return transition;
}

function validateGraphModel() {
  const solved = createSolvedGraphNodes();
  (Object.keys(MOVE_SPEC) as Move[]).forEach((move) => createGraphTransition(solved, move));
}

validateGraphModel();

function GraphCanvas({
  graphStateRef,
  previewRef,
}: {
  graphStateRef: { current: GraphNode[] };
  previewRef: { current: LayerPreview | null };
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let width = 0;
    let height = 0;
    let dpr = 1;
    let scale = 1;
    let offset: Point = { x: 0, y: 0 };

    const toCanvas = (point: Point): Point => ({
      x: offset.x + point.x * scale,
      y: offset.y + point.y * scale,
    });

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      dpr = Math.min(window.devicePixelRatio, 2);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      context.setTransform(dpr, 0, 0, dpr, 0, 0);
      scale = Math.min(width / GRAPH_VIEWBOX.width, height / GRAPH_VIEWBOX.height) * 0.94;
      offset = {
        x: (width - GRAPH_VIEWBOX.width * scale) / 2,
        y: (height - GRAPH_VIEWBOX.height * scale) / 2,
      };
    };

    const observer = new ResizeObserver(layout);
    observer.observe(canvas);
    layout();

    const draw = () => {
      context.clearRect(0, 0, width, height);
      context.save();
      context.strokeStyle = "rgba(220, 226, 238, .28)";
      context.lineWidth = Math.max(1.1, scale * 1.3);
      GRAPH_CIRCLES.forEach((circle) => {
        const center = toCanvas(circle.center);
        context.beginPath();
        context.arc(center.x, center.y, circle.radius * scale, 0, Math.PI * 2);
        context.stroke();
      });

      const baseNodes = graphStateRef.current;
      const preview = previewRef.current;
      const previewMove = preview && Math.abs(preview.angle) > 0.0001
        ? moveFromRotation(preview.axis, preview.layer, preview.angle > 0)
        : null;
      const transition = previewMove
        ? createGraphTransition(baseNodes, previewMove)
        : {};
      const progress = preview ? Math.min(1, Math.abs(preview.angle) / (Math.PI / 2)) : 0;

      baseNodes.forEach((node) => {
        const nodeTransition = transition[node.id];
        const resting = GRAPH_SLOTS.get(node.slotId)?.point;
        if (!resting) return;
        let graphPoint = resting;
        if (nodeTransition?.circle && nodeTransition.startAngle !== undefined && nodeTransition.angleDelta !== undefined) {
          const angle = nodeTransition.startAngle + nodeTransition.angleDelta * progress;
          graphPoint = {
            x: nodeTransition.circle.center.x + Math.cos(angle) * nodeTransition.circle.radius,
            y: nodeTransition.circle.center.y + Math.sin(angle) * nodeTransition.circle.radius,
          };
        } else if (nodeTransition) {
          graphPoint = {
            x: nodeTransition.from.x + (nodeTransition.to.x - nodeTransition.from.x) * progress,
            y: nodeTransition.from.y + (nodeTransition.to.y - nodeTransition.from.y) * progress,
          };
        }
        const current = toCanvas(graphPoint);

        const nodeRadius = Math.max(4.8, Math.min(7.2, scale * 7.4));
        context.beginPath();
        context.arc(current.x, current.y, nodeRadius, 0, Math.PI * 2);
        context.fillStyle = GRAPH_COLORS[node.color];
        context.shadowColor = GRAPH_COLORS[node.color];
        context.shadowBlur = Math.max(4, scale * 5);
        context.fill();
        context.shadowBlur = 0;
        context.strokeStyle = "rgba(6, 8, 13, .94)";
        context.lineWidth = 1.8;
        context.stroke();
      });
      context.restore();

      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [graphStateRef, previewRef]);

  return (
    <canvas
      ref={canvasRef}
      className="graph-canvas"
      role="img"
      aria-label="All 54 Rubik’s Cube facelets moving through three overlapping sets of three concentric circles"
    />
  );
}

const BASE_MOVES: Array<Move> = ["R", "U", "F", "L", "D", "B"];

export default function CubeTheoryLab() {
  const cubeRef = useRef<CubeApi>(null);
  const initialGraphNodes = useMemo(() => createSolvedGraphNodes(), []);
  const graphStateRef = useRef<GraphNode[]>(initialGraphNodes);
  const previewRef = useRef<LayerPreview | null>(null);
  const [history, setHistory] = useState<Move[]>([]);
  const [busy, setBusy] = useState(false);
  const [solving, setSolving] = useState(false);
  const applyVisualMove = useCallback((move: Move) => {
    graphStateRef.current = turnGraphNodes(graphStateRef.current, move);
  }, []);

  const commitForwardMove = useCallback((move: Move) => {
    applyVisualMove(move);
    setHistory((current) => {
      if (current.length && inverseMove(current[current.length - 1]) === move) {
        return current.slice(0, -1);
      }
      return [...current, move];
    });
  }, [applyVisualMove]);

  const scramble = useCallback(() => {
    if (busy || solving) return;
    const moves: Move[] = [];
    for (let index = 0; index < 12; index += 1) {
      let base = BASE_MOVES[Math.floor(Math.random() * BASE_MOVES.length)];
      while (moves.length && base[0] === moves[moves.length - 1][0]) {
        base = BASE_MOVES[Math.floor(Math.random() * BASE_MOVES.length)];
      }
      moves.push((Math.random() > 0.5 ? `${base}'` : base) as Move);
    }
    cubeRef.current?.enqueue(moves, (move) => {
      applyVisualMove(move);
      setHistory((current) => [...current, move]);
    });
  }, [applyVisualMove, busy, solving]);

  const undo = useCallback(() => {
    if (!history.length || busy || solving) return;
    const move = inverseMove(history[history.length - 1]);
    cubeRef.current?.enqueue(
      [move],
      () => {
        applyVisualMove(move);
        setHistory((current) => current.slice(0, -1));
      },
    );
  }, [applyVisualMove, busy, history, solving]);

  const solve = useCallback(() => {
    if (!history.length || busy || solving) return;
    setSolving(true);
    const solution = [...history].reverse().map(inverseMove);
    cubeRef.current?.enqueue(solution, (move, index) => {
      applyVisualMove(move);
      setHistory((current) => current.slice(0, -1));
      if (index === solution.length - 1) setSolving(false);
    });
  }, [applyVisualMove, busy, history, solving]);

  return (
    <main className="lab-shell minimal-lab">
      <section className="experiment" aria-label="Interactive cube and graph experiment">
        <article className="panel cube-panel">
          <div className="cube-wrap">
            <CubeScene
              ref={cubeRef}
              onManualCommit={commitForwardMove}
              onBusyChange={setBusy}
              previewRef={previewRef}
            />
          </div>
        </article>
        <article className="panel graph-panel">
          <div className="graph-wrap">
            <GraphCanvas
              graphStateRef={graphStateRef}
              previewRef={previewRef}
            />
          </div>
        </article>
      </section>

      <section className="minimal-actions" aria-label="Cube controls">
          <button type="button" className="action secondary" onClick={undo} disabled={!history.length || busy || solving}>Undo</button>
          <button type="button" className="action secondary" onClick={scramble} disabled={busy || solving}>Scramble</button>
          <button type="button" className="action primary" onClick={solve} disabled={!history.length || busy || solving}>
            {solving ? "Solving…" : "Solve by inverse"}
          </button>
      </section>
    </main>
  );
}
