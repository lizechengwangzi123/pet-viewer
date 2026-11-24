// 入口：创建渲染器、场景、角色，把输入接到“被控制的角色”上，跑主循环。
//
// 第 2 步：进来先选卡通形象 + 输昵称（setup.js，存 localStorage），默认主人走、宠物跟（controlMode='owner'）。
// 第 3 步：拍照（photo.js）。快门 / 拍照模式 / 名牌开关在 HUD 右侧中下；照片只在本机，不上传。
// 第 4 步（多人联机）：其他玩家 = 额外的 Player + Pet 实例，位置由服务器同步，见 README。
import * as THREE from 'three';
import { CONFIG, OWNERS, ownerById } from './config.js';
import { loadProfile, defaultOwnerId } from './profile.js';
import { SetupPanel } from './setup.js';
import { renderOwnerThumbs } from './thumbs.js';
import { separateBodies } from './collision.js';
import { capturePhoto, PhotoUI } from './photo.js';
import { createWorld } from './world.js';
import { Player } from './player.js';
import { Pet, loadPetModel } from './pet.js';
import { FollowCamera } from './camera.js';
import { Joystick, GestureInput, keyboardJoystick, lockPageGestures } from './input.js';
import { TapMarker } from './fx.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const loadingEl = $('loading');
const loadingText = $('loading-text');

lockPageGestures();

// ---------- 渲染器 ----------
const dpr = Math.min(window.devicePixelRatio || 1, CONFIG.maxPixelRatio);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: dpr < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(dpr);
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(CONFIG.camera.fov, 1, 0.1, 150);
const world = createWorld(scene, CONFIG.world);
const followCam = new FollowCamera(camera, CONFIG.camera);
const marker = new TapMarker(scene);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  // 竖屏时视野稍宽一点，人物不至于太大
  camera.fov = w < h ? CONFIG.camera.fov + 8 : CONFIG.camera.fov;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
addEventListener('orientationchange', () => setTimeout(resize, 200));
resize();

// ---------- 角色 ----------
const owner = new Player(scene, world.collision, CONFIG.owner);
owner.root.position.copy(world.spawn.owner);
owner.mover.heading = owner.root.rotation.y = Math.PI; // 先朝北（-Z）

// 本机资料（形象 + 昵称）。没有就等加载完弹出选形象界面。
let profile = loadProfile();
function applyLook(look) {
  if (!look) return Promise.resolve(false);
  // 加载失败就继续用占位小人 / 上一个形象
  return owner.setLook(look).catch((e) => { console.warn('主人模型加载失败', look.url, e); return false; });
}
const ownerLoading = applyLook(ownerById(profile?.owner || defaultOwnerId()));
const settingsName = $('settings-name');
function applyProfile(p) {
  profile = p;
  owner.setName(p?.nickname || '');
  settingsName.textContent = p?.nickname || '';
}
const setup = new SetupPanel({
  onPreview: (look) => applyLook(look),
  onDone: (p) => { applyProfile(p); dimHint(false); },
});
$('settings-btn').addEventListener('click', () => setup.open(profile, { first: false }));

let pet = null;
let controlled = null;   // 现在听玩家指挥的角色（Pet 或 Player）

const state = {
  mode: CONFIG.controlMode,
  fps: 0,
  frames: 0,
  ready: false,
  lastTap: null,
};

function applyControlMode(mode) {
  state.mode = mode;
  if (mode === 'owner') {
    controlled = owner;
    owner.lookAt = null;
    pet.follow(owner);
    followCam.follow(owner.root, 1.0);
  } else {
    controlled = pet;
    pet.following = false;
    owner.lookAt = pet;          // 第 1 步：主人站着，看着宠物
    owner.mover.stop();
    followCam.follow(pet.root, 0.35);
  }
}

// ---------- 输入 ----------
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();
const hit = new THREE.Vector3();
let hintDimmed = false;
function dimHint(on = true) { if (hintDimmed !== on) { hintDimmed = on; $('hint').classList.toggle('dim', on); } }

function tapGround(clientX, clientY) {
  if (!controlled || modalOpen()) return false;
  const r = canvas.getBoundingClientRect();
  ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  ray.setFromCamera(ndc, camera);
  if (!ray.ray.intersectPlane(world.groundPlane, hit)) return false;
  const lim = world.collision.boundsHalf;
  hit.x = THREE.MathUtils.clamp(hit.x, -lim, lim);
  hit.z = THREE.MathUtils.clamp(hit.z, -lim, lim);
  controlled.goTo(hit);
  const tgt = controlled.mover.target;
  if (tgt) marker.show(tgt);
  state.lastTap = tgt ? { x: tgt.x, z: tgt.z } : null;
  dimHint();
  return true;
}

let joyVec = { x: 0, y: 0 }, keyVec = { x: 0, y: 0 }, driving = false;
function applyDrive() {
  let x = joyVec.x || keyVec.x, y = joyVec.y || keyVec.y;
  if (!controlled) return;
  if (modalOpen()) { x = 0; y = 0; }
  if (x === 0 && y === 0) {
    if (driving) { controlled.drive(0, 0); driving = false; }
    return;
  }
  const w = followCam.screenToWorld(x, y);
  controlled.drive(w.x, w.z);
  if (!driving) marker.hide();
  driving = true;
  dimHint();
}
new Joystick($('joystick'), (x, y) => { joyVec = { x, y }; });
keyboardJoystick((x, y) => { keyVec = { x, y }; });
new GestureInput(canvas, {
  onTap: tapGround,
  onOrbit: (dx, dy) => followCam.orbit(dx, dy),
  onZoom: (r) => followCam.zoom(r),
});

// ---------- FPS ----------
const fpsEl = $('fps'), fpsBox = $('fps-box'), fpsOpen = $('fps-open');
function setFpsVisible(v) {
  fpsBox.hidden = !v; fpsOpen.hidden = v;
  try { localStorage.setItem('petpark.fps', v ? '1' : '0'); } catch { /* 隐私模式 */ }
}
let fpsPref = CONFIG.showFps;
try { const s = localStorage.getItem('petpark.fps'); if (s !== null) fpsPref = s === '1'; } catch { /* ignore */ }
setFpsVisible(fpsPref);
$('fps-close').addEventListener('click', () => setFpsVisible(false));
fpsOpen.addEventListener('click', () => setFpsVisible(true));

// ---------- 角色互相推开 ----------
// 第 4 步：其他玩家和他们的宠物也加进这个数组
const bodies = [];
function rebuildBodies() {
  bodies.length = 0;
  bodies.push({ position: owner.root.position, radius: CONFIG.owner.radius, bodyRadius: CONFIG.owner.bodyRadius, pushWeight: CONFIG.owner.pushWeight });
  if (pet) bodies.push({ position: pet.root.position, radius: CONFIG.pet.radius, bodyRadius: CONFIG.pet.bodyRadius, pushWeight: CONFIG.pet.pushWeight });
}

// ---------- 主循环 ----------
const timer = new THREE.Timer();
timer.connect?.(document);   // 切到后台再回来时不会跳一大步
let fpsFrames = 0, fpsT0 = performance.now();
function frame(timestamp) {
  timer.update(timestamp);
  const dt = Math.min(timer.getDelta(), 0.1); // 掉帧到 10fps 以下时才会“变慢”
  const t = timer.getElapsed();
  applyDrive();                  // 摇杆每帧按当前相机方向重新换算
  owner.update(dt, t);
  pet?.update(dt, t);
  if (pet) separateBodies(bodies, world.collision);   // 主人和狗互相推开，不重叠
  if (photo.photoMode) updatePhotoFocus();
  if (controlled && !controlled.mover.target && !driving) marker.hide();
  marker.update(dt);
  world.update(t);
  followCam.update(dt);
  renderer.render(scene, camera);

  // FPS 用真实时间算（dt 有上限，不能拿来算）
  fpsFrames++; state.frames++;
  const now = performance.now();
  if (now - fpsT0 >= 500) {
    state.fps = Math.round((fpsFrames * 1000) / (now - fpsT0));
    fpsEl.textContent = `FPS ${state.fps}`;
    fpsFrames = 0; fpsT0 = now;
  }
}

// ---------- 拍照（第 3 步） ----------
// 拍的那一帧：藏 HUD、落点圈；名牌按开关决定拍不拍；临时调高像素比（photo.js）
function capture({ showTag = true } = {}) {
  const tag = owner.nameTag.sprite, markerMesh = marker.mesh;
  let tagWas, markerWas;
  return capturePhoto(renderer, scene, camera, {
    before() {
      document.body.classList.add('capturing');
      tagWas = tag.visible; markerWas = markerMesh.visible;
      tag.visible = showTag && !!owner.nameTag.text;
      markerMesh.visible = false;
    },
    after() {
      tag.visible = tagWas; markerMesh.visible = markerWas;
      document.body.classList.remove('capturing');
    },
  });
}
/** 兼容第 2 步留下的接口：返回当前画面的 Blob */
export async function takeSnapshot(type = 'image/jpeg', quality = 0.9) {
  return (await capturePhoto(renderer, scene, camera, { type, quality })).blob;
}

// 拍照模式时相机看的点：主人和狗中间（偏主人），两个都进镜头
const photoFocus = new THREE.Object3D();
function updatePhotoFocus() {
  const a = (controlled || owner).root.position, other = controlled === pet ? owner : pet;
  if (!other) { photoFocus.position.copy(a); return; }
  const b = other.root.position;
  if (Math.hypot(a.x - b.x, a.z - b.z) > 4) photoFocus.position.copy(a);   // 离得太远就只拍主角
  else photoFocus.position.set(a.x * 0.62 + b.x * 0.38, 0, a.z * 0.62 + b.z * 0.38);
}
const hintEl = $('hint');
const hintNormal = hintEl.textContent;
let savedView = null;
const photo = new PhotoUI({
  capture,
  onModeChange(on) {
    const subject = controlled || owner;
    if (on) {
      savedView = followCam.getView();
      // 相机转到角色正面（yaw = 角色朝向：相机在角色前方往回看），之后照样可以拖动 / 捏合转视角
      followCam.animateTo({ yaw: subject.mover.heading, ...CONFIG.photo.view, ...(subject === pet ? { height: 0.4, distance: 3.6 } : {}) }, 0.9);
      updatePhotoFocus();
      followCam.target = photoFocus;
      if (pet && state.mode === 'owner') { pet.followSide = 0.9; pet.regroup(); }   // 狗走到主人斜前方，进镜头
      hintEl.textContent = '拍照模式：拖动画面转视角，双指缩放，点快门拍照';
      dimHint(false);
    } else {
      if (savedView) followCam.animateTo(savedView, 0.7);
      followCam.target = (controlled || owner).root;
      if (pet) pet.followSide = Math.PI + 0.5;
      hintEl.textContent = hintNormal;
    }
  },
});
function modalOpen() { return setup.isOpen || photo.isOpen; }

// ---------- 启动 ----------
async function start() {
  followCam.follow(owner.root, 1.0);
  followCam.update(0);
  renderer.setAnimationLoop(frame);   // 先把公园画出来，狗边加载边看
  try {
    const loaded = await loadPetModel(CONFIG.pet.url, CONFIG.pet, (e) => {
      if (e.total) loadingText.textContent = `正在加载拳师犬… ${Math.round((e.loaded / e.total) * 100)}%`;
    });
    pet = new Pet(scene, world.collision, CONFIG.pet, loaded);
    pet.root.position.copy(world.spawn.pet);
    pet.mover.heading = pet.root.rotation.y = Math.PI;
    rebuildBodies();
    loadingText.textContent = '正在加载卡通形象…';
    await ownerLoading;
    applyControlMode(state.mode);
    followCam.yaw = 0.45;          // 开局斜后方视角，能看到狗的侧面和主人
    state.petTris = loaded.tris;
    if (!profile || CONFIG.forceSetup) {
      // 第一次进来：先渲染三个头像再弹界面（失败也照样弹，只是没有头像）
      const thumbs = await renderOwnerThumbs(OWNERS).catch((e) => { console.warn('头像渲染失败', e); return {}; });
      setup.setThumbs(thumbs);
      setup.open(profile, { first: !profile });
    } else {
      applyProfile(profile);
      // 头像在后台渲染，打开设置时就有
      renderOwnerThumbs(OWNERS).then((t) => setup.setThumbs(t)).catch(() => {});
    }
    state.ready = true;
    loadingEl.classList.add('done');
  } catch (err) {
    console.error(err);
    loadingEl.classList.add('error');
    loadingText.textContent = '宠物模型加载失败，请刷新重试';
  }
}
start();

// 调试 / 自动化测试用的只读入口（不影响玩法）
window.__park = {
  state,
  get pet() { return pet; },
  owner,
  setup,
  photo,
  capture,
  get profile() { return profile; },
  camera: followCam,
  renderer,
  tapGround,
  setMode: (m) => pet && applyControlMode(m),
  info: () => renderer.info.render,
  resume: () => renderer.setAnimationLoop(frame),   // 自动化测试暂停后恢复
};
