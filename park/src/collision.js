// 简单 2D 碰撞（只看 XZ 平面）：圆形障碍 + 旋转方块障碍 + 正方形围栏边界。
// 角色当成圆形，被推出障碍外，所以撞上去会停住或沿边滑动。

export class CollisionWorld {
  constructor(boundsHalf) {
    this.boundsHalf = boundsHalf;
    this.circles = [];   // {x, z, r}
    this.boxes = [];     // {x, z, hw, hd, rot}
  }

  addCircle(x, z, r) { this.circles.push({ x, z, r }); }

  addBox(x, z, hw, hd, rot = 0) {
    this.boxes.push({ x, z, hw, hd, rot, c: Math.cos(rot), s: Math.sin(rot) });
  }

  /** 把半径 r 的圆（位置 p，THREE.Vector3，只改 x/z）推出所有障碍。返回是否发生了碰撞。 */
  resolve(p, r) {
    let hit = false;
    for (let iter = 0; iter < 2; iter++) {
      for (const c of this.circles) {
        const dx = p.x - c.x, dz = p.z - c.z;
        const min = c.r + r;
        const d2 = dx * dx + dz * dz;
        if (d2 < min * min) {
          const d = Math.sqrt(d2) || 1e-4;
          p.x = c.x + (dx / d) * min;
          p.z = c.z + (dz / d) * min;
          hit = true;
        }
      }
      for (const b of this.boxes) {
        // 转到方块自己的坐标系
        const dx = p.x - b.x, dz = p.z - b.z;
        const lx = dx * b.c + dz * b.s;
        const lz = -dx * b.s + dz * b.c;
        const cx = Math.max(-b.hw, Math.min(b.hw, lx));
        const cz = Math.max(-b.hd, Math.min(b.hd, lz));
        let ox = lx - cx, oz = lz - cz;
        const d2 = ox * ox + oz * oz;
        if (d2 < r * r) {
          let nx, nz;
          if (d2 > 1e-8) {
            const d = Math.sqrt(d2);
            nx = cx + (ox / d) * r; nz = cz + (oz / d) * r;
          } else {
            // 圆心在方块里：往最近的边推
            const px = b.hw - Math.abs(lx), pz = b.hd - Math.abs(lz);
            if (px < pz) { nx = Math.sign(lx || 1) * (b.hw + r); nz = lz; }
            else { nx = lx; nz = Math.sign(lz || 1) * (b.hd + r); }
          }
          p.x = b.x + nx * b.c - nz * b.s;
          p.z = b.z + nx * b.s + nz * b.c;
          hit = true;
        }
      }
      const lim = this.boundsHalf - r;
      if (p.x > lim) { p.x = lim; hit = true; }
      if (p.x < -lim) { p.x = -lim; hit = true; }
      if (p.z > lim) { p.z = lim; hit = true; }
      if (p.z < -lim) { p.z = -lim; hit = true; }
    }
    return hit;
  }

  /** 点击目标点如果落在障碍里，把它挪到障碍边上，避免角色永远到不了。 */
  clampTarget(v, r) {
    this.resolve(v, r + 0.05);
    return v;
  }
}

/**
 * 角色之间互相推开（主人、宠物，第 4 步还有其他玩家和他们的宠物）。
 * bodies: [{ position: Vector3, bodyRadius, pushWeight, radius }]，pushWeight 越大越容易被推开。
 * 推完再跟障碍做一次碰撞，避免把谁推进树里。
 */
export function separateBodies(bodies, world) {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i], b = bodies[j];
      const pa = a.position, pb = b.position;
      let dx = pb.x - pa.x, dz = pb.z - pa.z;
      const min = a.bodyRadius + b.bodyRadius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let d = Math.sqrt(d2);
      if (d < 1e-4) { dx = 1; dz = 0; d = 1e-4; } else { dx /= d; dz /= d; }
      const overlap = min - d;
      const wa = a.pushWeight, wb = b.pushWeight, sum = wa + wb || 1;
      pa.x -= dx * overlap * (wa / sum); pa.z -= dz * overlap * (wa / sum);
      pb.x += dx * overlap * (wb / sum); pb.z += dz * overlap * (wb / sum);
      world.resolve(pa, a.radius);
      world.resolve(pb, b.radius);
    }
  }
}
