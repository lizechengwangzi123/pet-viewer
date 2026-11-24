// 骨骼动画：按名字找 idle / walk / run 片段，用 AnimationMixer 播放，片段之间 crossFade。
// 片段名在 config 里配（clips: { idle, walk, run }），找不到再按常见名字兜底。
// 动画都是“原地走”的，位移由代码负责：timeScale = 实际速度 / 片段步速，脚才不会打滑。
// 没有 run（例如狗的 trot 还没做）时，快的时候就把 walk 加速播放（最多 maxTimeScale 倍）。
import * as THREE from 'three';

const FALLBACK = {
  idle: /idle|stand|待机|站/i,
  walk: /walk|走/i,
  run: /trot|run|sprint|跑/i,
};

function findClip(clips, wanted, key) {
  if (wanted) {
    const w = String(wanted).toLowerCase();
    const exact = clips.find((c) => c.name.toLowerCase() === w);
    if (exact) return exact;
    const part = clips.find((c) => c.name.toLowerCase().includes(w));
    if (part) return part;
    return null;          // 配置里写了名字却找不到：不乱猜（例如狗没有 trot 时不要把别的片段当成 trot）
  }
  return clips.find((c) => FALLBACK[key].test(c.name)) || null;
}

export class ClipAnimator {
  /**
   * @param root 模型根节点
   * @param clips GLB 里的 AnimationClip
   * @param gait { clips:{idle,walk,run}, walkClipSpeed, runClipSpeed, runAbove, maxTimeScale } —— 速度都是米/秒
   */
  constructor(root, clips = [], gait = {}) {
    this.gait = { walkClipSpeed: 1, runClipSpeed: 2, runAbove: Infinity, maxTimeScale: 3, ...gait };
    this.mixer = clips.length ? new THREE.AnimationMixer(root) : null;
    this.actions = {};
    for (const key of ['idle', 'walk', 'run']) {
      const clip = findClip(clips, this.gait.clips?.[key], key);
      if (clip) this.actions[key] = this.mixer.clipAction(clip);
    }
    if (clips.length === 1 && !Object.keys(this.actions).length) this.actions.walk = this.mixer.clipAction(clips[0]);
    this.current = null;
    this.currentKey = null;
    this.timeScale = 1;
  }

  get hasWalk() { return !!this.actions.walk; }
  get hasRun() { return !!this.actions.run; }
  get hasIdle() { return !!this.actions.idle; }
  get hasClips() { return Object.keys(this.actions).length > 0; }
  get clipName() { return this.current ? this.current.getClip().name : null; }

  play(key, fade = 0.25) {
    const next = this.actions[key];
    if (!next || next === this.current) return;
    next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
    if (this.current) {
      // 走 ↔ 跑：对齐步伐相位，切换时不会“踩空一步”
      if ((key === 'run' || key === 'walk') && (this.currentKey === 'run' || this.currentKey === 'walk')) {
        next.time = (this.current.time / this.current.getClip().duration) * next.getClip().duration;
      }
      this.current.crossFadeTo(next, fade, false);
    } else next.fadeIn(fade);
    this.current = next;
    this.currentKey = key;
  }

  /** 每帧调用：根据速度选片段，并让片段快慢跟移动速度匹配 */
  update(dt, speed) {
    if (!this.mixer) return;
    const g = this.gait;
    if (speed > 0.05 && (this.hasWalk || this.hasRun)) {
      // 有 run：超过 runAbove 换 run（带 0.15 的回差，免得在临界速度来回切）
      const useRun = this.hasRun && (speed > g.runAbove || (this.currentKey === 'run' && speed > g.runAbove - 0.15) || !this.hasWalk);
      const key = useRun ? 'run' : 'walk';
      this.play(key, 0.3);
      const ref = useRun ? g.runClipSpeed : g.walkClipSpeed;
      this.timeScale = THREE.MathUtils.clamp(speed / ref, 0.35, g.maxTimeScale);
      this.actions[key].setEffectiveTimeScale(this.timeScale);
    } else if (this.hasIdle) {
      this.play('idle', 0.3);
      this.timeScale = 1;
    } else if (this.current && speed <= 0.05) {
      this.current.fadeOut(0.25); this.current = null; this.currentKey = null;
    }
    this.mixer.update(dt);
  }
}
