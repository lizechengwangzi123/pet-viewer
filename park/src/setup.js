// 选形象 + 输昵称界面（第一次进来、或者点左上角“设置”时打开）。
// 只操作 DOM，结果通过 onPreview(look) / onDone(profile) 交回 main.js。
import { CONFIG, OWNERS, ownerById } from './config.js';
import { sanitizeNickname, splitChars, saveProfile, defaultOwnerId } from './profile.js';

const $ = (id) => document.getElementById(id);

export class SetupPanel {
  constructor({ onPreview, onDone }) {
    this.el = $('setup');
    this.list = $('owner-list');
    this.input = $('nick');
    this.count = $('nick-count');
    this.msg = $('nick-msg');
    this.ok = $('setup-ok');
    this.cancel = $('setup-cancel');
    this.title = $('setup-title');
    this.onPreview = onPreview;
    this.onDone = onDone;
    this.max = CONFIG.profile.nicknameMax;
    this.selected = defaultOwnerId();
    this.prev = null;           // 打开前的资料（取消时恢复）
    this.composing = false;     // 中文输入法拼写中：先不截断

    this.input.placeholder = `最多 ${this.max} 个字，中英文都行`;
    this.buttons = OWNERS.map((look) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'owner-card';
      b.setAttribute('role', 'radio');
      b.dataset.id = look.id;
      b.innerHTML = `<span class="thumb"><span class="thumb-ph"></span></span><span class="name"></span>`;
      b.querySelector('.name').textContent = look.label;
      b.addEventListener('click', () => this.select(look.id, true));
      this.list.appendChild(b);
      return b;
    });

    this.input.addEventListener('compositionstart', () => { this.composing = true; });
    this.input.addEventListener('compositionend', () => { this.composing = false; this._onInput(); });
    this.input.addEventListener('input', (e) => { if (!e.isComposing && !this.composing) this._onInput(); else this._updateCount(); });
    this.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.isComposing) this._submit(); });
    this.ok.addEventListener('click', () => this._submit());
    this.cancel.addEventListener('click', () => this.close(true));

    // 手机弹出键盘时：让界面只占“键盘上面”那块可见区域，输入框不会被键盘挡住
    const vv = window.visualViewport;
    if (vv) {
      const fit = () => {
        if (this.el.hidden) return;
        this.el.style.top = `${vv.offsetTop}px`;
        this.el.style.height = `${vv.height}px`;
        this.el.style.bottom = 'auto';
        // 可见区域明显变矮 = 键盘弹出来了：卡片贴顶（键盘收起后自动恢复居中）
        this.el.classList.toggle('typing', vv.height < window.innerHeight * 0.8);
      };
      vv.addEventListener('resize', fit);
      vv.addEventListener('scroll', fit);
      this._fit = fit;
    }
    this.input.addEventListener('focus', () => setTimeout(() => { if (document.activeElement === this.input) this.input.scrollIntoView({ block: 'nearest' }); }, 350));
  }

  setThumbs(map) {
    for (const b of this.buttons) {
      const url = map[b.dataset.id];
      if (!url) continue;
      const img = new Image();
      img.alt = ''; img.src = url; img.draggable = false;
      const t = b.querySelector('.thumb'); t.textContent = ''; t.appendChild(img);
    }
  }

  get isOpen() { return !this.el.hidden; }

  /** first = 第一次进来（没有“取消”） */
  open(profile, { first = false } = {}) {
    this.prev = profile;
    this.title.textContent = first ? '选一个形象，起个昵称' : '修改形象和昵称';
    this.cancel.hidden = first;
    this.ok.textContent = first ? '进入公园' : '保存';
    this.input.value = profile?.nickname || '';
    this.select(profile?.owner || this.selected, false);
    this._onInput();
    this.msg.classList.remove('err');
    this.msg.textContent = '昵称只存在这台手机上，不会上传';
    this.el.hidden = false;
    document.body.classList.add('setup-open');
    this._fit?.();
  }

  close(cancelled = false) {
    this.el.hidden = true;
    document.body.classList.remove('setup-open');
    this.input.blur();
    if (cancelled && this.prev) this.onPreview?.(ownerById(this.prev.owner));   // 恢复原来的形象
  }

  select(id, preview) {
    if (!ownerById(id)) id = OWNERS[0].id;
    this.selected = id;
    for (const b of this.buttons) {
      const on = b.dataset.id === id;
      b.classList.toggle('on', on);
      b.setAttribute('aria-checked', on ? 'true' : 'false');
    }
    if (preview) this.onPreview?.(ownerById(id));
  }

  _onInput() {
    const clean = sanitizeNickname(this.input.value, this.max);
    if (clean !== this.input.value) {
      this.input.value = clean;
      try { this.input.setSelectionRange(clean.length, clean.length); } catch { /* ignore */ }
    }
    this._updateCount();
  }

  _updateCount() {
    const n = splitChars(sanitizeNickname(this.input.value, 999)).length;
    this.count.textContent = `${Math.min(n, this.max)}/${this.max}`;
    this.count.classList.toggle('full', n >= this.max);
    this.ok.disabled = n === 0;
    if (n > 0 && this.msg.classList.contains('err')) {
      this.msg.classList.remove('err');
      this.msg.textContent = '昵称只存在这台手机上，不会上传';
    }
  }

  _submit() {
    const nickname = sanitizeNickname(this.input.value, this.max);
    if (!nickname) {
      this.msg.textContent = '昵称不能是空的（空格会被去掉）';
      this.msg.classList.add('err');
      this.input.focus();
      return;
    }
    const p = saveProfile({ owner: this.selected, nickname });
    this.prev = null;
    this.close(false);
    this.onDone?.({ owner: p.owner, nickname: p.nickname });
  }
}
