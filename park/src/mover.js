// 角色移动的公共部分：主人和宠物都用它。
// 三种驱动方式：走向目标点（点地面）、按方向走（摇杆）、停下。
import * as THREE from 'three';

const tmp = new THREE.Vector3();

export function dampAngle(current, target, rate, dt) {
  let d = target - current;
  d = Math.atan2(Math.sin(d), Math.cos(d));          // 取最短方向
  return current + d * (1 - Math.exp(-rate * dt));
}

export class Mover {
  /**
   * @param {THREE.Object3D} root 角色根节点（位置 + 朝向）
   * @param {{radius:number, walkSpeed:number, turnRate:number}} opts
   * @param {import('./collision.js').CollisionWorld} collision
   */
  constructor(root, opts, collision) {
    this.root = root;
    this.opts = opts;
    this.collision = collision;
    this.target = null;            // THREE.Vector3 | null
    this.arriveDist = 0.12;
    this.dir = new THREE.Vector2(); // 摇杆方向（世界 XZ，长度 0–1）
    this.speedScale = 1;           // 临时加速（宠物追主人时用）
    this.speed = 0;                // 当前实际速度（米/秒），给动画用
    this.heading = root.rotation.y;
    this.blocked = false;          // 本帧是否撞到东西
    this._stuckTime = 0;
    this.onArrive = null;          // 到达 / 被挡住停下时回调 (reason) => void
  }

  get moving() { return this.speed > 0.05; }

  moveTo(v, arriveDist = 0.12) {
    this.target = this.collision.clampTarget(v.clone().setY(0), this.opts.radius);
    this.arriveDist = arriveDist;
    this.dir.set(0, 0);
  }

  setDirection(x, z) {
    this.dir.set(x, z);
    if (this.dir.lengthSq() > 0.0001) this.target = null;
  }

  stop() { this.target = null; this.dir.set(0, 0); }

  /** 让角色慢慢转向某个世界方向（停下时看主人、东张西望用） */
  faceTowards(yaw, dt, rate = this.opts.turnRate) {
    this.heading = dampAngle(this.heading, yaw, rate, dt);
  }

  update(dt) {
    const p = this.root.position;
    let want = 0;           // 期望速度比例 0–1
    let wantYaw = this.heading;

    if (this.dir.lengthSq() > 0.0001) {
      want = Math.min(1, this.dir.length());
      wantYaw = Math.atan2(this.dir.x, this.dir.y);
    } else if (this.target) {
      tmp.subVectors(this.target, p).setY(0);
      const d = tmp.length();
      if (d < this.arriveDist) {
        this.target = null;
        this.onArrive?.('arrived');
      } else {
        wantYaw = Math.atan2(tmp.x, tmp.z);
        want = Math.min(1, d / 0.8);      // 快到时减速
      }
    }

    this.heading = dampAngle(this.heading, wantYaw, this.opts.turnRate, dt);
    // 方向还没转过来时先放慢，避免“倒着滑”
    let facing = Math.cos(Math.atan2(Math.sin(wantYaw - this.heading), Math.cos(wantYaw - this.heading)));
    facing = Math.max(0, facing);
    const targetSpeed = this.opts.walkSpeed * this.speedScale * want * (0.25 + 0.75 * facing);
    this.speed += (targetSpeed - this.speed) * (1 - Math.exp(-8 * dt));
    if (want === 0 && this.speed < 0.02) this.speed = 0;

    const prevX = p.x, prevZ = p.z;
    const step = this.speed * dt;
    p.x += Math.sin(this.heading) * step;
    p.z += Math.cos(this.heading) * step;
    this.blocked = this.collision.resolve(p, this.opts.radius);

    // 被障碍挡住、几乎走不动时：停下（满足“撞到边界或障碍会停”）
    const moved = Math.hypot(p.x - prevX, p.z - prevZ);
    if (step > 0.0005 && moved < step * 0.3) this._stuckTime += dt; else this._stuckTime = 0;
    if (this._stuckTime > 0.35) {
      this._stuckTime = 0;
      if (this.target) { this.target = null; this.onArrive?.('blocked'); }
      this.speed = 0;
    }
    // 真实速度（考虑碰撞后），给动画用
    if (dt > 0) this.speed = Math.min(this.speed, moved / dt + 0.001);
    this.root.rotation.y = this.heading;
  }
}
