// 模型资源：同一个 GLB 只下载 / 解析一次，每个角色实例用 SkeletonUtils.clone 复制
// （带骨骼的模型不能用 scene.clone()，否则骨骼会共用、动画乱掉）。
// 第 2 步的主人形象、第 4 步的其他玩家都走这里。
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';

const loader = new GLTFLoader();
const cache = new Map();   // url -> Promise<gltf>

export function loadAsset(url, onProgress) {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url, onProgress));
  return cache.get(url);
}

/** 得到一个独立的实例：{ object, clips } */
export async function instantiate(url, onProgress) {
  const gltf = await loadAsset(url, onProgress);
  return { object: cloneSkinned(gltf.scene), clips: gltf.animations || [] };
}

/**
 * 带骨骼模型的包围盒：SkinnedMesh 的包围盒按“当前骨骼矩阵”算，第一次渲染前骨骼矩阵还没更新，
 * 直接 Box3.setFromObject 会得到错的大小（Kenney 人物会被算成 2.7 米高）。先更新骨骼再算。
 */
export function skinnedBox(object, Box3) {
  object.updateMatrixWorld(true);
  object.traverse((o) => {
    if (o.isSkinnedMesh) { o.skeleton.update(); o.computeBoundingBox(); o.computeBoundingSphere(); }
  });
  return new Box3().setFromObject(object);
}
