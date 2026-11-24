// 全局配置：第 1 步到第 4 步共用。改玩法优先改这里。
//
// 换画风（写实狗 ↔ 卡通狗、换主人形象）只改下面的 OWNERS / CONFIG.pet：
//   url（GLB 路径）、scale（缩放）、forwardYaw（头朝向校正）、clips（片段名）、*ClipGround（片段步速）。
// 片段步速 = 片段原速播放时“着地的脚往后蹬”的速度，单位是模型自己的单位/秒（乘 scale 才是米/秒），
// 用 scripts/measure-stride.mjs 量（见 README），量好填进来，动画快慢就会自动跟移动速度对上、不滑步。
const params = new URLSearchParams(location.search);

/** 可选的卡通主人（选形象界面三选一）。id 会存进 localStorage，别随便改名。 */
export const OWNERS = [
  {
    id: 'a', label: '丸子头女孩',
    url: './vendor/models/owners/owner_a_girl_buns.glb',
    scale: 2.0,           // 原始高约 0.7，放大后约 1.4 米
    forwardYaw: 0,        // 头朝 +Z
    clips: { idle: 'idle', walk: 'walk', run: 'sprint' },
    // walk 片段原速时的着地步速（模型单位/秒）。2026-11-24 用 scripts/calibrate-slip.mjs 实测：
    // 按 1.25 米/秒走，片段步速在 1.0–1.85 之间扫，1.30（= 2.6 米/秒）时着地脚滑动最小（约 0.2 米/秒，
    // 卡通“钟摆腿”本身的残余）；原来估的 1.16 滑 0.30，1.0 滑 0.43。三个形象是同一套骨骼动画，数值通用。
    walkClipGround: 1.30,
    runClipGround: 2.55,  // sprint：按 walk 的比例推算，没单独校准（主人现在不跑）
  },
  {
    id: 'b', label: '绿衣男孩',
    url: './vendor/models/owners/owner_b_boy_green.glb',
    scale: 2.0, forwardYaw: 0,
    clips: { idle: 'idle', walk: 'walk', run: 'sprint' },
    walkClipGround: 1.30, runClipGround: 2.55,
  },
  {
    id: 'c', label: '眼镜男孩',
    url: './vendor/models/owners/owner_c_glasses.glb',
    scale: 2.0, forwardYaw: 0,
    clips: { idle: 'idle', walk: 'walk', run: 'sprint' },
    walkClipGround: 1.30, runClipGround: 2.55,
  },
];

export const CONFIG = {
  // 谁听玩家指挥：
  //   'owner' —— 第 2 步默认：点地面 / 摇杆移动主人，宠物跟在身后 1.5–2 米。
  //   'pet'   —— 第 1 步玩法（调试用）：直接指挥宠物，主人站着看。网址加 ?mode=pet
  controlMode: params.get('mode') === 'pet' ? 'pet' : 'owner',

  maxPixelRatio: 2,
  showFps: params.get('fps') !== '0',
  forceSetup: params.get('setup') === '1',      // ?setup=1：强制显示选形象界面
  previewOwner: params.get('owner'),             // ?owner=a|b|c：选形象界面默认选中哪个

  profile: {
    storageKey: 'petpark.profile.v1',            // localStorage：{ owner: 'b', nickname: '小明' }
    nicknameMax: 12,                             // 最多 12 个字（按字算，中英文、emoji 都算 1 个）
  },

  world: {
    fenceHalf: 28,       // 围栏是边长 56 米的正方形
    seed: 20261124,      // 树、花的随机种子：每次打开地图都一样
    treeCount: 60,
  },

  pet: {
    // 宠物分身做的带骨骼拳师犬（2026-11-24 第二版，1.26 MB）：1 单位 = 1 米，Y 朝上，脚在 y=0，头朝 +Z，
    // 片段 idle（2.0 秒）、walk（1.0 秒）、trot（0.5 秒），都是原地动画。长约 1.0 米、高 0.74 米。
    url: './vendor/models/boxer_anim.glb',
    label: '拳师犬',
    scale: 1,            // 模型已经是真实尺寸
    forwardYaw: 0,       // 头朝 +Z 就是 0；旧的 TripoSR 静态狗朝 -Z，要填 Math.PI
    // 片段名：按名字找（不分大小写，包含即可）。trot 找不到就用 walk 加速代替。
    clips: { idle: 'idle', walk: 'walk', run: 'trot' },
    // 片段步速（米/秒，模型 1 单位 = 1 米）：timeScale = 实际速度 / 这个值。宠物分身 2026-11-24 原速实测。
    walkClipSpeed: 0.62,   // walk 1.0 秒
    trotClipSpeed: 1.48,   // trot 0.5 秒（没有 trot 片段的模型会自动退回 walk 加速）
    runAbove: 1.0,         // 速度超过约 1 米/秒换 trot，低于 0.85 换回 walk（中间 crossFade，步伐相位对齐）
    maxTimeScale: 3.5,     // walk 最多加速到几倍（再快就宁可有点滑步，也不要腿抖成残影）
    radius: 0.4,         // 和障碍碰撞的半径
    bodyRadius: 0.38,    // 和其他角色互相推开时的半径
    pushWeight: 0.75,    // 互相推开时宠物让出的比例（主人只让 0.25，玩家操作不会被狗顶歪）
    walkSpeed: 1.35,     // 米/秒（比主人稍快一点才跟得上；第 1 步是 1.5）
    turnRate: 6.0,       // 转向平滑系数（越大越快）
    followMin: 1.5,      // 主人模式：跟到离主人这么近就停
    followMax: 2.0,      // 远于这个距离就开始跟
    catchUpFrom: 3.0,    // 落后超过这个距离开始加速追
    catchUpScale: 1.6,   // 追赶时最多是平时速度的几倍
    teleportAfter: 14,   // 被障碍卡住、落后超过这个距离 2 秒：直接瞬移回主人身后（没做寻路）
  },

  owner: {
    // 移动参数（所有形象共用）；形象本身在上面的 OWNERS 里
    radius: 0.32,
    bodyRadius: 0.3,
    pushWeight: 0.25,
    walkSpeed: 1.25,     // 米/秒（散步速度）。walk 片段播 1.25 / 2.6 ≈ 0.48 倍速，一步约 0.7 秒
    turnRate: 8.0,
    maxTimeScale: 2.5,
    nameHeight: 0.15,    // 昵称牌离头顶的高度（米）
  },

  photo: {
    maxPixelRatio: 3,      // 拍照那一帧最多放大到 3 倍像素比
    maxPixels: 3_200_000,  // 总像素上限（约 320 万，390×844×3² = 296 万）：大屏平板会自动降，省手机内存
    maxSide: 4096,         // 边长上限（再受 GPU 的 MAX_RENDERBUFFER_SIZE 限制）
    type: 'image/jpeg',
    quality: 0.92,
    watermark: '云宠物世界',
    view: { pitch: 0.22, distance: 5.2, height: 0.7 },   // 拍照模式：相机转到主人正面，稍低、稍近
  },

  camera: {
    fov: 50,
    distance: 6,
    minDistance: 2.5,
    maxDistance: 16,
    pitch: 0.55,         // 俯角（弧度）
    minPitch: 0.12,
    maxPitch: 1.25,
  },
};

export const ownerById = (id) => OWNERS.find((o) => o.id === id) || null;
