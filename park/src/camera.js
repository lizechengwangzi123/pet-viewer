// 第三人称跟随相机：围着“被控制的角色”转。
// 偏航（左右）/ 俯仰由单指拖动控制，距离由双指捏合控制，位置平滑跟随。
import * as THREE from 'three';

export class FollowCamera {
  constructor(camera, cfg) {
    this.camera = camera;
    this.cfg = cfg;
    this.yaw = 0;                 // 0 = 相机在角色 +Z 方向，往 -Z 看
    this.pitch = cfg.pitch;
    this.distance = cfg.distance;
    this.focus = new THREE.Vector3();
    this.target = null;           // 要跟的 Object3D
    this.height = 0.5;            // 看向角色身上的高度
  }

  follow(obj, height = 0.5, snap = true) {
    this.target = obj; this.height = height;
    if (snap) { this.focus.copy(obj.position); this.focus.y += height; }
  }

  /** 平滑转到某个视角（拍照模式用）。手动拖动 / 捏合会打断。 */
  animateTo({ yaw = this.yaw, pitch = this.pitch, distance = this.distance, height = this.height }, dur = 0.8) {
    // 偏航走最短方向
    let dy = yaw - this.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.tween = { t: 0, dur, from: { yaw: this.yaw, pitch: this.pitch, distance: this.distance, height: this.height },
      to: { yaw: this.yaw + dy, pitch, distance, height } };
  }

  /** 当前视角（退出拍照模式时恢复用） */
  getView() { return { yaw: this.yaw, pitch: this.pitch, distance: this.distance, height: this.height }; }

  orbit(dxPx, dyPx) {
    this.tween = null;
    this.yaw -= dxPx * 0.006;
    this.pitch = THREE.MathUtils.clamp(this.pitch + dyPx * 0.004, this.cfg.minPitch, this.cfg.maxPitch);
  }

  zoom(ratio) {
    this.tween = null;
    this.distance = THREE.MathUtils.clamp(this.distance * ratio, this.cfg.minDistance, this.cfg.maxDistance);
  }

  /** 摇杆输入（屏幕方向）换成世界 XZ 方向：向上 = 相机朝前 */
  screenToWorld(x, y) {
    const s = Math.sin(this.yaw), c = Math.cos(this.yaw);
    // 相机前方（水平）是 (-sin yaw, -cos yaw)，右方是 (cos yaw, -sin yaw)
    return { x: -s * y + c * x, z: -c * y - s * x };
  }

  update(dt) {
    if (this.tween) {
      const tw = this.tween;
      tw.t += dt;
      const k = Math.min(1, tw.t / tw.dur), e = k * k * (3 - 2 * k);   // smoothstep
      for (const key of ['yaw', 'pitch', 'distance', 'height']) this[key] = tw.from[key] + (tw.to[key] - tw.from[key]) * e;
      if (k >= 1) this.tween = null;
    }
    if (this.target) {
      const want = this.target.position;
      const k = 1 - Math.exp(-6 * dt);
      this.focus.x += (want.x - this.focus.x) * k;
      this.focus.z += (want.z - this.focus.z) * k;
      this.focus.y += (want.y + this.height - this.focus.y) * k;
    }
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.camera.position.set(
      this.focus.x + Math.sin(this.yaw) * cp * this.distance,
      Math.max(0.3, this.focus.y + sp * this.distance),
      this.focus.z + Math.cos(this.yaw) * cp * this.distance
    );
    this.camera.lookAt(this.focus);
  }
}
