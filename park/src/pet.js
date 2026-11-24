// 宠物：加载 GLB、统一大小、移动、待机（浮动 + 转身）、程序化走路感、跟随主人。
//
// 结构：root（位置 + 朝向，由 Mover 控制）
//         ├─ shadow（脚下假影子）
//         └─ body（程序化起伏 / 摇摆 / 待机转头都只动这一层）
//              └─ model（GLB，已居中、贴地、缩放、校正朝向）
import * as THREE from 'three';
import { Mover, dampAngle } from './mover.js';
import { ClipAnimator } from './animator.js';
import { makeBlobShadow } from './fx.js';
import { instantiate, skinnedBox } from './assets.js';

/**
 * 加载宠物模型（带骨骼动画或静态都行）。
 * cfg.scale：缩放；cfg.forwardYaw：把“头朝向”校正到 +Z；cfg.height（可选）：按高度自动缩放，给没量过尺寸的模型用。
 */
export async function loadPetModel(url, cfg, onProgress) {
  const { object: model, clips } = await instantiate(url, onProgress);
  if (cfg.height) {
    const size = skinnedBox(model, THREE.Box3).getSize(new THREE.Vector3());
    model.scale.multiplyScalar(cfg.height / (size.y || 1));
  } else {
    model.scale.multiplyScalar(cfg.scale ?? 1);
  }
  const wrap = new THREE.Group();          // 再包一层用来校正“头朝哪”
  wrap.add(model);
  wrap.rotation.y = cfg.forwardYaw || 0;
  let tris = 0;
  model.traverse((o) => {
    if (o.isMesh) {
      o.frustumCulled = false;             // 蒙皮网格的包围盒按绑定姿势算，不准；只有一只狗，干脆不裁剪
      const g = o.geometry;
      tris += (g.index ? g.index.count : g.attributes.position.count) / 3;
    }
  });
  const size = skinnedBox(wrap, THREE.Box3).getSize(new THREE.Vector3());
  return { object: wrap, model, clips, size, tris };
}

export class Pet {
  constructor(scene, collision, cfg, loaded) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.root.name = 'pet';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.body.add(loaded.object);
    const len = Math.max(loaded.size.x, loaded.size.z);
    this.root.add(makeBlobShadow(len * 0.75, len * 1.05));
    scene.add(this.root);

    this.mover = new Mover(this.root, cfg, collision);
    const sc = cfg.scale ?? 1;
    this.anim = new ClipAnimator(loaded.model, loaded.clips, {
      clips: cfg.clips,
      walkClipSpeed: cfg.walkClipSpeed * sc,
      runClipSpeed: (cfg.trotClipSpeed ?? cfg.walkClipSpeed * 2) * sc,
      runAbove: cfg.runAbove,
      maxTimeScale: cfg.maxTimeScale,
    });

    this.state = 'idle';     // 'idle' | 'walk'
    this._phase = 0;
    this._idleTimer = 2 + Math.random() * 2;
    this._lookYaw = 0;       // 待机时身体相对朝向的偏转（东张西望）
    this._lookTarget = 0;
    this._turnTo = null;     // 待机时整只转身的目标朝向
    this.owner = null;       // 跟随对象（主人模式）
    this.following = false;
    this._farTime = 0;
    this.followSide = Math.PI + 0.5;   // 跟在主人哪个方位（相对主人朝向）：默认斜后方；拍照模式改成斜前方
  }

  /** 马上走到主人身边的 followSide 方位（拍照模式：让狗进镜头） */
  regroup() {
    if (!this.owner) return;
    const o = this.owner.position, a = this.owner.heading + this.followSide, r = this.cfg.followMin * 0.8;
    this.mover.moveTo(new THREE.Vector3(o.x + Math.sin(a) * r, 0, o.z + Math.cos(a) * r), 0.2);
    this._regrouping = true;
  }

  get position() { return this.root.position; }

  /** 点地面 / 摇杆：玩家直接指挥宠物（第 1 步默认） */
  goTo(point) { this.following = false; this.mover.speedScale = 1; this.mover.moveTo(point, 0.15); }
  drive(x, z) { this.following = false; this.mover.speedScale = 1; this.mover.setDirection(x, z); }

  /** 第 2 步：跟随主人 */
  follow(owner) { this.owner = owner; this.following = true; }

  update(dt, t) {
    if (this.following && this.owner) this._updateFollow(dt);
    this.mover.update(dt);

    const speed = this.mover.speed;
    const walking = speed > 0.05;
    this.state = walking ? 'walk' : 'idle';
    this.anim.update(dt, speed);
    // 有骨骼动画时，起伏 / 摇摆 / 待机浮动全交给 walk、idle 片段（proc = 0），
    // 只保留程序化的“东张西望 + 偶尔原地转身”。静态模型（没有片段）才用程序化的走路感。
    const proc = this.anim.hasClips ? 0 : 1;

    const b = this.body;
    if (walking) {
      this._phase += dt * (6 + speed * 3.5);
      const amp = Math.min(1, speed / this.cfg.walkSpeed);
      b.position.y = Math.abs(Math.sin(this._phase)) * 0.045 * amp * proc;
      b.rotation.z = Math.sin(this._phase) * 0.06 * amp * proc;        // 左右摇摆
      b.rotation.x = Math.sin(this._phase * 2) * 0.025 * amp * proc;   // 前后点头
      this._lookTarget = 0;
      this._turnTo = null;
      this._idleTimer = 1.5 + Math.random() * 2;
    } else {
      // 待机：轻微上下浮动（呼吸感），偶尔左右张望或原地转身
      const breathe = (Math.sin(t * 2.2) * 0.012 + 0.012) * proc;
      b.position.y += (Math.max(0, breathe) - b.position.y) * (1 - Math.exp(-6 * dt));
      b.rotation.z *= Math.exp(-8 * dt);
      b.rotation.x += (Math.sin(t * 1.1) * 0.015 * proc - b.rotation.x) * (1 - Math.exp(-4 * dt));
      this._idleTimer -= dt;
      if (this._idleTimer <= 0) {
        // 正看前方时一定做点什么（张望或转身）；已经偏着头时可能转回来
        const r = this._lookTarget === 0 ? Math.random() * 0.45 + (Math.random() < 0.4 ? 0.75 : 0) : Math.random();
        if (r < 0.45) this._lookTarget = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.35);
        else if (r < 0.75) this._lookTarget = 0;
        else this._turnTo = this.mover.heading + (Math.random() < 0.5 ? -1 : 1) * (0.6 + Math.random() * 0.9);
        this._idleTimer = 1.8 + Math.random() * 2.5;
      }
      if (this._turnTo !== null && !this.following) {
        this.mover.faceTowards(this._turnTo, dt, 2.5);
        if (Math.abs(Math.atan2(Math.sin(this._turnTo - this.mover.heading), Math.cos(this._turnTo - this.mover.heading))) < 0.03) this._turnTo = null;
        this.root.rotation.y = this.mover.heading;
      }
    }
    this._lookYaw = dampAngle(this._lookYaw, this._lookTarget, 3, dt);
    b.rotation.y = this._lookYaw;
  }

  _updateFollow(dt) {
    const o = this.owner.position, p = this.position;
    const dx = o.x - p.x, dz = o.z - p.z;
    const d = Math.hypot(dx, dz);
    const { followMin, followMax, catchUpFrom, catchUpScale, teleportAfter } = this.cfg;
    // 落后越多跑得越快：catchUpFrom 米以内是正常速度，再远线性加速，多落后 3 米就到 catchUpScale 倍
    const k = THREE.MathUtils.clamp((d - catchUpFrom) / 3, 0, 1);
    this.mover.speedScale = 1 + (catchUpScale - 1) * k;
    // 没做寻路：被喷泉 / 池塘卡住、落后太远 2 秒，就瞬移到主人身后（以后做寻路再去掉）
    this._farTime = d > teleportAfter ? this._farTime + dt : 0;
    if (this._farTime > 2) {
      this._farTime = 0;
      const back = this.owner.heading + Math.PI;
      p.set(o.x + Math.sin(back) * followMin, 0, o.z + Math.cos(back) * followMin);
      this.mover.collision.resolve(p, this.cfg.radius);
      this.mover.heading = this.root.rotation.y = this.owner.heading;
      this.mover.stop();
      return;
    }
    if (this._regrouping) {
      // 正在走去主人身边指定方位：走到为止（主人又走远了就按正常跟随）
      if (this.mover.target && d <= followMax + 0.5) return;
      this._regrouping = false;
    }
    if (d > followMax || (this.mover.target && d > followMin)) {
      // 目标点：主人身后偏一侧（狗走在主人斜后方，不挡视线），离主人 followMin。
      // 主人在走时目标再往前提一点：追移动目标总会落后一截，这样走路时实际距离稳定在 1.5–2 米
      const back = this.owner.heading + this.followSide;
      const r = this.owner.mover.moving ? followMin * 0.8 : followMin;
      const tgt = new THREE.Vector3(o.x + Math.sin(back) * r, 0, o.z + Math.cos(back) * r);
      this.mover.moveTo(tgt, 0.2);
    } else if (!this.mover.moving) {
      this.mover.target = null;
      // 停在旁边时慢慢转头看主人
      this.mover.faceTowards(Math.atan2(dx, dz), dt, 2);
      this.root.rotation.y = this.mover.heading;
    }
  }
}
