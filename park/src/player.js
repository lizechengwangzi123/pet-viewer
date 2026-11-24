// 主人：卡通形象（config.js 的 OWNERS，选形象界面选的那个）+ 头顶昵称牌。
// 形象没加载好之前先显示占位小人（胶囊身体 + 头 + 帽子）。移动 / 碰撞 / 相机跟随跟形象无关。
// 第 4 步多人：其他玩家也是一个 Player（不接输入，位置由服务器同步），一样可以 setLook / setName。
import * as THREE from 'three';
import { Mover } from './mover.js';
import { ClipAnimator } from './animator.js';
import { makeBlobShadow } from './fx.js';
import { instantiate, skinnedBox } from './assets.js';
import { NameTag } from './nametag.js';

function buildPlaceholder() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x4f86e8 });
  const skinMat = new THREE.MeshLambertMaterial({ color: 0xffd9b8 });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x2b2b2b });
  const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.26, 0.6, 4, 10), bodyMat);
  body.position.y = 0.26 + 0.3 + 0.02;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 10), skinMat);
  head.position.y = 1.32;
  const eyeGeo = new THREE.SphereGeometry(0.035, 6, 4);
  const eyeL = new THREE.Mesh(eyeGeo, darkMat); eyeL.position.set(-0.08, 1.36, 0.19);
  const eyeR = eyeL.clone(); eyeR.position.x = 0.08;
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.235, 14, 6, 0, Math.PI * 2, 0, Math.PI / 2),
    new THREE.MeshLambertMaterial({ color: 0xf2a33a }));
  cap.position.y = 1.36;
  const brim = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.03, 0.18), cap.material);
  brim.position.set(0, 1.38, 0.22);
  g.add(body, head, eyeL, eyeR, cap, brim);
  return g;
}

export class Player {
  constructor(scene, collision, cfg) {
    this.cfg = cfg;
    this.root = new THREE.Group();
    this.root.name = 'owner';
    this.body = new THREE.Group();
    this.root.add(this.body);
    this.model = buildPlaceholder();
    this.body.add(this.model);
    this.root.add(makeBlobShadow(0.8));
    scene.add(this.root);
    this.mover = new Mover(this.root, cfg, collision);
    this.anim = new ClipAnimator(this.model, []);
    this._phase = 0;
    this.lookAt = null;   // 不受控制时看向谁（第 1 步：看着宠物）
    this.look = null;     // 当前形象（OWNERS 里的一项）
    this.height = 1.5;    // 头顶高度（米），昵称牌放在上面
    this._loadToken = 0;
    this.nameTag = new NameTag();
    this.root.add(this.nameTag.sprite);
    this._placeNameTag();
  }

  /** 头顶昵称（空字符串 = 不显示） */
  setName(text) { this.nameTag.setText(text); }

  _placeNameTag() { this.nameTag.sprite.position.y = this.height + (this.cfg.nameHeight ?? 0.28); }

  get position() { return this.root.position; }
  get heading() { return this.mover.heading; }

  /** 换形象：look = OWNERS 里的一项 { url, scale, forwardYaw, clips, walkClipGround, runClipGround } */
  setModel(object, clips, look) {
    this.body.remove(this.model);
    const sc = look.scale ?? 1;
    object.scale.multiplyScalar(sc);
    object.rotation.y = look.forwardYaw || 0;
    object.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
    this.model = object;
    this.body.add(object);
    this.look = look;
    this.anim = new ClipAnimator(object, clips, {
      clips: look.clips,
      walkClipSpeed: (look.walkClipGround ?? 1) * sc,
      runClipSpeed: (look.runClipGround ?? 2) * sc,
      runAbove: look.runAbove ?? Infinity,   // 主人默认不跑（以后加“跑步”按钮时再设）
      maxTimeScale: this.cfg.maxTimeScale ?? 2.5,
    });
    const box = skinnedBox(object, THREE.Box3);
    this.height = Math.max(0.5, box.max.y - this.root.position.y);
    this._placeNameTag();
  }

  /** 按形象配置加载 GLB（SkeletonUtils.clone，多人共用同一份资源）。连续切换时只保留最后一次。 */
  async setLook(look) {
    const token = ++this._loadToken;
    const { object, clips } = await instantiate(look.url);
    if (token !== this._loadToken) return false;
    this.setModel(object, clips, look);
    return true;
  }

  goTo(point) { this.mover.moveTo(point, 0.12); }
  drive(x, z) { this.mover.setDirection(x, z); }

  update(dt, t) {
    this.mover.update(dt);
    const speed = this.mover.speed;
    this.anim.update(dt, speed);
    const proc = this.anim.hasClips ? 0 : 1;
    if (speed > 0.05) {
      this._phase += dt * (7 + speed * 3);
      this.body.position.y = Math.abs(Math.sin(this._phase)) * 0.06 * proc;
      this.body.rotation.z = Math.sin(this._phase) * 0.05 * proc;
    } else {
      this.body.position.y *= Math.exp(-10 * dt);
      this.body.rotation.z *= Math.exp(-10 * dt);
      this.body.scale.y = 1 + Math.sin(t * 2) * 0.008 * proc;
      if (this.lookAt) {
        const o = this.lookAt.position, p = this.position;
        if (Math.hypot(o.x - p.x, o.z - p.z) > 0.3) {
          this.mover.faceTowards(Math.atan2(o.x - p.x, o.z - p.z), dt, 2);
          this.root.rotation.y = this.mover.heading;
        }
      }
    }
  }
}
