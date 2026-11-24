// 选形象界面的小头像：用一个临时的小 WebGLRenderer 把每个形象渲染成图片（dataURL），渲完立刻释放。
// 这样换画风只换 GLB，不用另外做头像图片。
import * as THREE from 'three';
import { instantiate, skinnedBox } from './assets.js';

export async function renderOwnerThumbs(looks, w = 168, h = 200) {
  const canvas = document.createElement('canvas');
  const r = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
  r.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
  r.setSize(w, h, false);
  r.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene();
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8fb08a, 2.2));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(2, 4, 3); scene.add(sun);
  const cam = new THREE.PerspectiveCamera(30, w / h, 0.05, 50);
  const out = {};
  try {
    for (const look of looks) {
      try {
        const { object, clips } = await instantiate(look.url);
        object.scale.multiplyScalar(look.scale ?? 1);
        object.rotation.y = (look.forwardYaw || 0) + 0.45;     // 稍微侧一点，看得出立体感
        const idle = clips.find((c) => c.name.toLowerCase().includes(String(look.clips?.idle || 'idle')));
        if (idle) { const m = new THREE.AnimationMixer(object); m.clipAction(idle).play(); m.update(0.3); }
        scene.add(object);
        const box = skinnedBox(object, THREE.Box3);
        const size = box.getSize(new THREE.Vector3()), c = box.getCenter(new THREE.Vector3());
        const dist = (size.y * 0.62) / Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
        cam.position.set(c.x, c.y + size.y * 0.08, c.z + dist);
        cam.lookAt(c.x, c.y, c.z);
        r.render(scene, cam);
        out[look.id] = canvas.toDataURL('image/png');
        scene.remove(object);
      } catch (e) {
        console.warn('头像渲染失败', look.id, e);
      }
    }
  } finally {
    r.dispose();
    r.forceContextLoss?.();
  }
  return out;
}
