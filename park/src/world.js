// 公园地图：全部用程序生成的低多边形几何体，没有外部素材。
// 重复的物体（树、栏杆柱、路灯、花丛）用 InstancedMesh，静态杂物合并几何体，控制 draw call。
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CollisionWorld } from './collision.js';

// 可复现的随机数（mulberry32）
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const mat = (color, extra = {}) => new THREE.MeshLambertMaterial({ color, flatShading: true, ...extra });

export const PARK = {
  plazaRadius: 5,
  ringRadius: 13,
  pathWidth: 2.4,
  pond: { x: -16, z: -14, r: 5 },
  fountain: { x: 0, z: 0, r: 2.3 },
};

export function createWorld(scene, cfg) {
  const half = cfg.fenceHalf;
  const rand = rng(cfg.seed);
  const collision = new CollisionWorld(half);
  const animated = [];   // 每帧要动的东西（水面、喷泉水柱）

  // ---------- 天空、雾、灯光（不用实时阴影，角色脚下用圆形假影子） ----------
  scene.background = new THREE.Color(0xbfe3f5);
  scene.fog = new THREE.Fog(0xbfe3f5, 35, 90);
  scene.add(new THREE.HemisphereLight(0xeaf6ff, 0x6b8a4a, 1.6));
  const sun = new THREE.DirectionalLight(0xfff2dd, 1.8);
  sun.position.set(20, 30, 12);
  scene.add(sun);

  // ---------- 地面 ----------
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), mat(0x8cc56a, { flatShading: false }));
  ground.rotation.x = -Math.PI / 2;
  ground.name = 'ground';
  scene.add(ground);

  const inner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, half * 2), mat(0x9fd47a, { flatShading: false }));
  inner.rotation.x = -Math.PI / 2;
  inner.position.y = 0.005;
  scene.add(inner);

  // ---------- 小路：十字路 + 环形路 + 中心广场 ----------
  const pathMat = mat(0xe8d6a8, { flatShading: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const pw = PARK.pathWidth;
  const pathGeos = [];
  const straight = new THREE.PlaneGeometry(pw, half * 2 - 1);
  straight.rotateX(-Math.PI / 2);
  pathGeos.push(straight.clone());
  pathGeos.push(straight.clone().rotateY(Math.PI / 2));
  const ring = new THREE.RingGeometry(PARK.ringRadius - pw / 2, PARK.ringRadius + pw / 2, 64);
  ring.rotateX(-Math.PI / 2);
  pathGeos.push(ring);
  const plaza = new THREE.CircleGeometry(PARK.plazaRadius, 40);
  plaza.rotateX(-Math.PI / 2);
  pathGeos.push(plaza);
  const paths = new THREE.Mesh(mergeGeometries(pathGeos.map((g) => g.toNonIndexed())), pathMat);
  paths.position.y = 0.012;
  scene.add(paths);

  // ---------- 喷泉（中心广场） ----------
  {
    const f = PARK.fountain;
    const g = new THREE.Group();
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(f.r, f.r + 0.15, 0.5, 16), mat(0xcfc8bd));
    basin.position.y = 0.25;
    const water = new THREE.Mesh(new THREE.CylinderGeometry(f.r - 0.2, f.r - 0.2, 0.05, 16), mat(0x5fb3e0, { flatShading: false }));
    water.position.y = 0.45;
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 1.3, 8), mat(0xd9d2c7));
    column.position.y = 0.9;
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.3, 0.25, 12), mat(0xd9d2c7));
    bowl.position.y = 1.6;
    const jet = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.9, 8, 1, true),
      new THREE.MeshLambertMaterial({ color: 0xbfe8ff, transparent: true, opacity: 0.75 }));
    jet.position.y = 2.15;
    g.add(basin, water, column, bowl, jet);
    g.position.set(f.x, 0, f.z);
    scene.add(g);
    collision.addCircle(f.x, f.z, f.r + 0.1);
    animated.push((t) => { jet.scale.y = 1 + Math.sin(t * 6) * 0.08; jet.rotation.y = t; });
  }

  // ---------- 池塘 ----------
  {
    const p = PARK.pond;
    const shape = new THREE.Shape();
    const pts = 20;
    const radii = [];
    for (let i = 0; i < pts; i++) radii.push(p.r * (0.88 + rand() * 0.12));
    for (let i = 0; i < pts; i++) {
      const a = (i / pts) * Math.PI * 2;
      const x = Math.cos(a) * radii[i], y = Math.sin(a) * radii[i];
      i === 0 ? shape.moveTo(x, y) : shape.lineTo(x, y);
    }
    const waterGeo = new THREE.ShapeGeometry(shape);
    waterGeo.rotateX(-Math.PI / 2);
    const water = new THREE.Mesh(waterGeo, mat(0x4aa3d6, { flatShading: false }));
    water.position.set(p.x, 0.03, p.z);
    scene.add(water);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(p.r * 0.97, 0.18, 4, 24), mat(0xb7ad9b));
    rim.rotation.x = -Math.PI / 2;
    rim.position.set(p.x, 0.05, p.z);
    scene.add(rim);
    // 几片荷叶
    const padGeo = new THREE.CircleGeometry(0.35, 7);
    padGeo.rotateX(-Math.PI / 2);
    const pads = new THREE.InstancedMesh(padGeo, mat(0x4f9a3f), 6);
    const m = new THREE.Matrix4();
    for (let i = 0; i < 6; i++) {
      const a = rand() * Math.PI * 2, d = rand() * p.r * 0.6;
      m.makeTranslation(p.x + Math.cos(a) * d, 0.045, p.z + Math.sin(a) * d);
      pads.setMatrixAt(i, m);
    }
    scene.add(pads);
    collision.addCircle(p.x, p.z, p.r);
    animated.push((t) => { water.position.y = 0.03 + Math.sin(t * 1.3) * 0.004; });
  }

  // ---------- 长椅（沿环形路外侧，朝向路面） ----------
  {
    const seat = new THREE.BoxGeometry(1.6, 0.08, 0.45).translate(0, 0.45, 0);
    const back = new THREE.BoxGeometry(1.6, 0.4, 0.06).translate(0, 0.75, -0.22);
    const legs = [-0.7, 0.7].map((x) => new THREE.BoxGeometry(0.08, 0.45, 0.4).translate(x, 0.225, 0));
    const benchGeo = mergeGeometries([seat, back, ...legs]);
    const angles = [0.35, 1.25, 2.3, 3.6, 4.5, 5.6];
    const benches = new THREE.InstancedMesh(benchGeo, mat(0xa86b3c), angles.length);
    const obj = new THREE.Object3D();
    angles.forEach((a, i) => {
      const r = PARK.ringRadius + pw / 2 + 0.5;
      obj.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
      obj.rotation.set(0, Math.atan2(-obj.position.x, -obj.position.z), 0); // 椅子正面（+Z）朝向公园中心
      obj.updateMatrix();
      benches.setMatrixAt(i, obj.matrix);
      collision.addBox(obj.position.x, obj.position.z, 0.85, 0.3, -obj.rotation.y);
    });
    scene.add(benches);
  }

  // ---------- 树（避开路、广场、池塘） ----------
  const onPath = (x, z, margin) => {
    const d = Math.hypot(x, z);
    return Math.abs(x) < pw / 2 + margin || Math.abs(z) < pw / 2 + margin ||
      Math.abs(d - PARK.ringRadius) < pw / 2 + margin || d < PARK.plazaRadius + margin;
  };
  const nearPond = (x, z, m) => Math.hypot(x - PARK.pond.x, z - PARK.pond.z) < PARK.pond.r + m;
  {
    const trunkGeo = new THREE.CylinderGeometry(0.15, 0.22, 1.4, 6).translate(0, 0.7, 0);
    const crownA = new THREE.IcosahedronGeometry(1.1, 0).translate(0, 2.1, 0);
    const crownB = new THREE.ConeGeometry(1.0, 2.2, 7).translate(0, 2.5, 0);
    const n = cfg.treeCount;
    const trunks = new THREE.InstancedMesh(trunkGeo, mat(0x8a5a36), n);
    const roundTrees = new THREE.InstancedMesh(crownA, mat(0x4d9a45), n);
    const pineTrees = new THREE.InstancedMesh(crownB, mat(0x3b8048), n);
    const obj = new THREE.Object3D();
    let placed = 0, nRound = 0, nPine = 0, guard = 0;
    const spots = [];
    while (placed < n && guard++ < 4000) {
      const x = (rand() * 2 - 1) * (half - 1.5);
      const z = (rand() * 2 - 1) * (half - 1.5);
      if (onPath(x, z, 1.2) || nearPond(x, z, 1.5)) continue;
      if (spots.some((s) => Math.hypot(s[0] - x, s[1] - z) < 2.6)) continue;
      spots.push([x, z]);
      const s = 0.8 + rand() * 0.6;
      obj.position.set(x, 0, z);
      obj.rotation.set(0, rand() * Math.PI * 2, 0);
      obj.scale.setScalar(s);
      obj.updateMatrix();
      trunks.setMatrixAt(placed, obj.matrix);
      if (rand() < 0.6) roundTrees.setMatrixAt(nRound++, obj.matrix);
      else pineTrees.setMatrixAt(nPine++, obj.matrix);
      collision.addCircle(x, z, 0.3 * s + 0.05);
      placed++;
    }
    trunks.count = placed; roundTrees.count = nRound; pineTrees.count = nPine;
    scene.add(trunks, roundTrees, pineTrees);
  }

  // ---------- 花丛（装饰，不挡路） ----------
  {
    const bushGeo = new THREE.IcosahedronGeometry(0.24, 0).translate(0, 0.17, 0);
    const n = 40;
    const bushes = new THREE.InstancedMesh(bushGeo, mat(0xffffff), n);
    const palette = [0xf28fad, 0xffd166, 0xf6f6f6, 0x9b7ede, 0x6fbf5a].map((c) => new THREE.Color(c));
    const obj = new THREE.Object3D();
    let i = 0, guard = 0;
    while (i < n && guard++ < 2000) {
      const a = rand() * Math.PI * 2;
      const r = PARK.plazaRadius + 0.6 + rand() * 0.6;       // 一部分围着广场
      const ring2 = i % 2 === 0;
      const x = ring2 ? Math.cos(a) * r : (rand() * 2 - 1) * (half - 1);
      const z = ring2 ? Math.sin(a) * r : (rand() * 2 - 1) * (half - 1);
      if (!ring2 && (onPath(x, z, 0.4) || nearPond(x, z, 0.8))) continue;
      if (ring2 && (Math.abs(x) < pw / 2 + 0.4 || Math.abs(z) < pw / 2 + 0.4)) continue;
      obj.position.set(x, 0, z);
      obj.scale.setScalar(0.7 + rand() * 0.6);
      obj.updateMatrix();
      bushes.setMatrixAt(i, obj.matrix);
      bushes.setColorAt(i, palette[Math.floor(rand() * palette.length)]);
      i++;
    }
    bushes.count = i;
    scene.add(bushes);
  }

  // ---------- 路灯（沿环形路内侧） ----------
  {
    const poleGeo = mergeGeometries([
      new THREE.CylinderGeometry(0.06, 0.08, 2.6, 6).translate(0, 1.3, 0),
      new THREE.CylinderGeometry(0.18, 0.18, 0.1, 6).translate(0, 0.05, 0),
    ]);
    const n = 8;
    const poles = new THREE.InstancedMesh(poleGeo, mat(0x3d4a52), n);
    const lamps = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.2, 0).translate(0, 2.7, 0),
      new THREE.MeshBasicMaterial({ color: 0xfff3c4 }), n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 8;
      const r = PARK.ringRadius - pw / 2 - 0.4;
      const x = Math.cos(a) * r, z = Math.sin(a) * r;
      m.makeTranslation(x, 0, z);
      poles.setMatrixAt(i, m); lamps.setMatrixAt(i, m);
      collision.addCircle(x, z, 0.15);
    }
    scene.add(poles, lamps);
  }

  // ---------- 围栏（边界） ----------
  {
    const step = 2;
    const perSide = Math.round((half * 2) / step);
    const n = perSide * 4;
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.14, 1.0, 0.14).translate(0, 0.5, 0), mat(0xf4efe6), n);
    const m = new THREE.Matrix4();
    let i = 0;
    for (let s = 0; s < 4; s++) {
      for (let k = 0; k < perSide; k++) {
        const t = -half + k * step;
        const [x, z] = [[t, -half], [half, t], [-t, half], [-half, -t]][s];
        m.makeTranslation(x, 0, z);
        posts.setMatrixAt(i++, m);
      }
    }
    scene.add(posts);
    const railGeos = [];
    for (const y of [0.45, 0.85]) {
      railGeos.push(new THREE.BoxGeometry(half * 2, 0.08, 0.06).translate(0, y, -half));
      railGeos.push(new THREE.BoxGeometry(half * 2, 0.08, 0.06).translate(0, y, half));
      railGeos.push(new THREE.BoxGeometry(0.06, 0.08, half * 2).translate(-half, y, 0));
      railGeos.push(new THREE.BoxGeometry(0.06, 0.08, half * 2).translate(half, y, 0));
    }
    scene.add(new THREE.Mesh(mergeGeometries(railGeos), mat(0xf4efe6)));
    // 围栏碰撞由 CollisionWorld 的 boundsHalf 负责（略往里收一点，别穿模）
    collision.boundsHalf = half - 0.25;
  }

  return {
    collision,
    ground,                       // 点击地面射线检测用
    groundPlane: new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
    spawn: { pet: new THREE.Vector3(0, 0, 8), owner: new THREE.Vector3(-1.5, 0, 6.3) },
    update(t) { for (const f of animated) f(t); },
  };
}
