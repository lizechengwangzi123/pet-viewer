// 小特效：角色脚下的圆形假影子（代替实时阴影，手机上省性能）、点地面的落点圈。
import * as THREE from 'three';

let blobTex = null;
function getBlobTexture() {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 2, 32, 32, 32);
  grd.addColorStop(0, 'rgba(0,0,0,0.45)');
  grd.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

export function makeBlobShadow(w, d = w) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(w, d),
    new THREE.MeshBasicMaterial({ map: getBlobTexture(), transparent: true, depthWrite: false })
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.02;
  m.renderOrder = 1;
  return m;
}

/** 点地面后的落点提示：一个会缩小淡出的圆圈 */
export class TapMarker {
  constructor(scene) {
    this.mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.28, 0.4, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false })
    );
    this.mesh.rotation.x = -Math.PI / 2;
    this.mesh.renderOrder = 2;
    this.mesh.visible = false;
    scene.add(this.mesh);
    this.life = 0;
  }
  show(p) {
    this.mesh.position.set(p.x, 0.03, p.z);
    this.life = 1;
    this.mesh.visible = true;
  }
  hide() { this.life = Math.min(this.life, 0.15); }
  update(dt) {
    if (!this.mesh.visible) return;
    this.life -= dt * 0.9;
    if (this.life <= 0) { this.mesh.visible = false; return; }
    this.mesh.material.opacity = Math.min(1, this.life * 1.5) * 0.9;
    const s = 0.8 + 0.4 * Math.abs(Math.sin(this.life * 6));
    this.mesh.scale.setScalar(s);
  }
}
