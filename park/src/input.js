// 触控输入：三种操作互不冲突。
//   1) 虚拟摇杆（左下角，单独的 DOM 元素，按 pointerId 追踪）→ onJoystick(x, y)
//   2) 画面上轻点（移动 < 10px 且 < 350ms）→ onTap(clientX, clientY)
//   3) 画面上单指拖动 → onOrbit(dx, dy)；双指捏合 → onZoom(ratio)
// 摇杆上的手指不会进画布的手势，所以可以一手摇杆、一手转视角。
// 桌面浏览器：鼠标点击 = 轻点，拖动 = 转视角，滚轮 = 缩放，WASD / 方向键 = 摇杆。

export class Joystick {
  constructor(el, onChange) {
    this.el = el;
    this.knob = el.querySelector('.knob');
    this.onChange = onChange;
    this.pointerId = null;
    this.value = { x: 0, y: 0 };
    this.radius = 48;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e));
    el.addEventListener('pointercancel', (e) => this._up(e));
    el.addEventListener('lostpointercapture', (e) => this._up(e));
  }
  _center() {
    const r = this.el.getBoundingClientRect();
    this.radius = r.width * 0.36;
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  _down(e) {
    if (this.pointerId !== null) return;
    e.preventDefault();
    this.pointerId = e.pointerId;
    this.el.setPointerCapture(e.pointerId);
    this.el.classList.add('active');
    this._move(e);
  }
  _move(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const c = this._center();
    let dx = e.clientX - c.x, dy = e.clientY - c.y;
    const d = Math.hypot(dx, dy);
    if (d > this.radius) { dx *= this.radius / d; dy *= this.radius / d; }
    this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
    let x = dx / this.radius, y = -dy / this.radius;   // y：向上为正（往前走）
    const m = Math.hypot(x, y);
    if (m < 0.15) { x = 0; y = 0; }                     // 死区
    this.value = { x, y };
    this.onChange(x, y);
  }
  _up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.el.classList.remove('active');
    this.knob.style.transform = '';
    this.value = { x: 0, y: 0 };
    this.onChange(0, 0);
  }
}

export class GestureInput {
  constructor(el, { onTap, onOrbit, onZoom }) {
    this.el = el;
    this.cb = { onTap, onOrbit, onZoom };
    this.pointers = new Map();   // pointerId -> {x, y, sx, sy, t}
    this.tapCandidate = null;
    this.pinchDist = 0;
    el.addEventListener('pointerdown', (e) => this._down(e));
    el.addEventListener('pointermove', (e) => this._move(e));
    el.addEventListener('pointerup', (e) => this._up(e, true));
    el.addEventListener('pointercancel', (e) => this._up(e, false));
    el.addEventListener('wheel', (e) => { e.preventDefault(); onZoom(Math.exp(e.deltaY * 0.001)); }, { passive: false });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }
  _down(e) {
    e.preventDefault();
    try { this.el.setPointerCapture(e.pointerId); } catch { /* 合成事件可能没有活动指针 */ }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, t: performance.now() });
    if (this.pointers.size === 1) this.tapCandidate = e.pointerId;
    else { this.tapCandidate = null; this.pinchDist = this._dist(); }
  }
  _move(e) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    e.preventDefault();
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (this.pointers.size === 1) {
      if (this.tapCandidate === e.pointerId && Math.hypot(p.x - p.sx, p.y - p.sy) > 10) this.tapCandidate = null;
      if (this.tapCandidate === null) this.cb.onOrbit(dx, dy);
    } else if (this.pointers.size === 2) {
      const d = this._dist();
      if (this.pinchDist > 0 && d > 0) this.cb.onZoom(this.pinchDist / d);
      this.pinchDist = d;
    }
  }
  _up(e, fire) {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    this.pointers.delete(e.pointerId);
    if (fire && this.tapCandidate === e.pointerId && performance.now() - p.t < 350) {
      this.cb.onTap(e.clientX, e.clientY);
    }
    this.tapCandidate = null;
    if (this.pointers.size === 2) this.pinchDist = this._dist();
    else this.pinchDist = 0;
  }
  _dist() {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

/** 键盘（桌面调试用）：WASD / 方向键 → 摇杆值 */
export function keyboardJoystick(onChange) {
  const down = new Set();
  const emit = () => {
    const x = (down.has('d') || down.has('arrowright') ? 1 : 0) - (down.has('a') || down.has('arrowleft') ? 1 : 0);
    const y = (down.has('w') || down.has('arrowup') ? 1 : 0) - (down.has('s') || down.has('arrowdown') ? 1 : 0);
    const m = Math.hypot(x, y) || 1;
    onChange(x / m, y / m);
  };
  const keys = ['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
  const typing = (e) => e.target?.closest?.('input, textarea, [contenteditable]');   // 在输入框里打字时不要让角色走
  addEventListener('keydown', (e) => { if (typing(e)) return; const k = e.key.toLowerCase(); if (keys.includes(k) && !down.has(k)) { down.add(k); emit(); } });
  addEventListener('keyup', (e) => { const k = e.key.toLowerCase(); if (down.delete(k)) emit(); });
  addEventListener('blur', () => { down.clear(); emit(); });
}

/** 禁止页面被双指缩放、双击缩放、下拉刷新（iOS Safari 不完全听 viewport 的，需要 JS 兜底） */
export function lockPageGestures() {
  const stop = (e) => e.preventDefault();
  for (const t of ['gesturestart', 'gesturechange', 'gestureend']) document.addEventListener(t, stop, { passive: false });
  document.addEventListener('touchmove', (e) => {
    if (!e.target.closest?.('.scrollable')) e.preventDefault();
  }, { passive: false });
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && !e.target.closest?.('a,button,input,label,#setup')) e.preventDefault();
    lastTouchEnd = now;
  }, { passive: false });
  document.addEventListener('dblclick', stop, { passive: false });
}
