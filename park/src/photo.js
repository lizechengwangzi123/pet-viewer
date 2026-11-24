// 第 3 步：拍照 + 存到手机。图片只在本机（内存里的 Blob），不上传任何地方。
//
// capturePhoto()：拍照那一帧临时调高像素比（最多 CONFIG.photo.maxPixelRatio，并限制总像素，省手机内存），
//   渲染 → 马上把 WebGL 画面画到 2D canvas（renderer 没开 preserveDrawingBuffer，必须同一帧里取）→ 加水印 → toBlob。
// PhotoUI：快门、拍照模式、名牌开关、白闪、预览小窗（保存 / 再拍一张）。
import * as THREE from 'three';
import { CONFIG } from './config.js';

const $ = (id) => document.getElementById(id);
const pad = (n) => String(n).padStart(2, '0');

/** 云宠物_YYYYMMDD_HHMMSS.jpg（本机时间） */
export function photoFileName(date = new Date(), ext = 'jpg') {
  const d = date;
  return `云宠物_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}.${ext}`;
}

/** 选拍照用的像素比：先取 maxPixelRatio（3），再按总像素上限 maxPixels、边长 / GPU 上限往下压；不低于平时的像素比 */
export function pickPhotoPixelRatio(renderer, w, h) {
  const cfg = CONFIG.photo;
  const gl = renderer.getContext();
  const maxSide = Math.min(gl.getParameter(gl.MAX_RENDERBUFFER_SIZE), gl.getParameter(gl.MAX_TEXTURE_SIZE), cfg.maxSide);
  let r = Math.min(cfg.maxPixelRatio, Math.sqrt(cfg.maxPixels / (w * h)), maxSide / Math.max(w, h));
  return Math.max(r, Math.min(renderer.getPixelRatio(), maxSide / Math.max(w, h)), 1);
}

function drawWatermark(g, W, H) {
  const text = CONFIG.photo.watermark;
  const fs = Math.round(Math.max(14, Math.min(W, H) * 0.038));
  g.save();
  g.font = `600 ${fs}px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif`;
  g.textAlign = 'right'; g.textBaseline = 'alphabetic';
  const m = Math.round(fs * 0.8);
  g.shadowColor = 'rgba(0, 0, 0, 0.45)'; g.shadowBlur = fs * 0.25; g.shadowOffsetY = fs * 0.06;
  g.fillStyle = 'rgba(255, 255, 255, 0.88)';
  g.fillText(text, W - m, H - m);
  g.restore();
}

/**
 * 拍一张。返回 { blob, width, height, pixelRatio, type, name, ms }。
 * hooks.before() / hooks.after()：拍照前后（藏名牌、藏 HUD 等）。
 */
export async function capturePhoto(renderer, scene, camera, { type = CONFIG.photo.type, quality = CONFIG.photo.quality, before, after } = {}) {
  const t0 = performance.now();
  const size = renderer.getSize(new THREE.Vector2());   // CSS 像素
  const w = size.x, h = size.y;
  const oldRatio = renderer.getPixelRatio();
  const r = pickPhotoPixelRatio(renderer, w, h);
  let out = null;
  before?.();
  try {
    renderer.setPixelRatio(r);           // 会把画布缓冲区放大（CSS 尺寸不变）
    renderer.render(scene, camera);
    const src = renderer.domElement;
    out = document.createElement('canvas');
    out.width = src.width; out.height = src.height;
    const g = out.getContext('2d');
    g.drawImage(src, 0, 0);              // 同一帧里取，不需要 preserveDrawingBuffer
    drawWatermark(g, out.width, out.height);
  } finally {
    renderer.setPixelRatio(oldRatio);    // 马上缩回来，大缓冲区释放
    renderer.render(scene, camera);
    after?.();
  }
  const blob = await new Promise((res) => out.toBlob(res, type, quality));
  const result = { blob, width: out.width, height: out.height, pixelRatio: +r.toFixed(3), type, name: photoFileName(new Date(), type === 'image/png' ? 'png' : 'jpg'), ms: Math.round(performance.now() - t0) };
  out.width = out.height = 0;            // 释放 2D canvas 内存
  return result;
}

/** 保存：能分享文件就用系统分享（手机上可“存储到照片 / 保存到相册”），不能就 <a download> 下载 */
export async function savePhoto(photo) {
  const file = new File([photo.blob], photo.name, { type: photo.type });
  if (navigator.canShare && navigator.share) {
    let ok = false;
    try { ok = navigator.canShare({ files: [file] }); } catch { ok = false; }
    if (ok) {
      try {
        await navigator.share({ files: [file], title: '云宠物世界' });
        return 'shared';
      } catch (e) {
        if (e?.name === 'AbortError') return 'cancelled';   // 用户自己关了分享面板
        // 其他错误（例如不允许）：退回下载
      }
    }
  }
  const url = URL.createObjectURL(photo.blob);
  const a = document.createElement('a');
  a.href = url; a.download = photo.name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
  return 'downloaded';
}

const isIOS = () => /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

export class PhotoUI {
  /**
   * @param opts.capture () => Promise<photo>   真正拍照（main.js 提供：藏 HUD / 名牌、调像素比）
   * @param opts.onModeChange (on:boolean) => void   进出拍照模式（main.js 负责转相机）
   */
  constructor({ capture, onModeChange }) {
    this.capture = capture;
    this.onModeChange = onModeChange;
    this.shutter = $('shutter');
    this.modeBtn = $('photo-mode');
    this.tagBtn = $('photo-tag');
    this.flash = $('flash');
    this.preview = $('photo-preview');
    this.img = $('photo-img');
    this.msg = $('photo-msg');
    this.saveBtn = $('photo-save');
    this.againBtn = $('photo-again');
    this.closeBtn = $('photo-close');
    this.photo = null;
    this.url = null;
    this.busy = false;
    this.photoMode = false;
    this.lastSave = null;
    this.showTag = true;
    try { const s = localStorage.getItem('petpark.photo.tag'); if (s !== null) this.showTag = s === '1'; } catch { /* ignore */ }
    this._renderTagBtn();

    this.shutter.addEventListener('click', () => this.shoot());
    this.modeBtn.addEventListener('click', () => this.setPhotoMode(!this.photoMode));
    this.tagBtn.addEventListener('click', () => {
      this.showTag = !this.showTag;
      try { localStorage.setItem('petpark.photo.tag', this.showTag ? '1' : '0'); } catch { /* ignore */ }
      this._renderTagBtn();
    });
    this.saveBtn.addEventListener('click', () => this.save());
    this.againBtn.addEventListener('click', () => this.closePreview());
    this.closeBtn.addEventListener('click', () => this.closePreview());
    this.hint = isIOS()
      ? 'iPhone：点「保存」后选「存储图像」；也可以长按上面的照片 →「存储到照片」'
      : '点「保存」存到手机（相册或“下载”文件夹）；照片只在这台手机上，不会上传';
  }

  get isOpen() { return !this.preview.hidden; }

  _renderTagBtn() {
    this.tagBtn.setAttribute('aria-pressed', this.showTag ? 'true' : 'false');
    this.tagBtn.querySelector('.label').textContent = this.showTag ? '名牌：拍' : '名牌：不拍';
    this.tagBtn.classList.toggle('off', !this.showTag);
  }

  setPhotoMode(on) {
    this.photoMode = on;
    document.body.classList.toggle('photo-mode', on);
    this.modeBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    this.modeBtn.querySelector('.label').textContent = on ? '退出拍照' : '拍照模式';
    this.onModeChange?.(on);
  }

  async shoot() {
    if (this.busy || this.isOpen) return;
    this.busy = true;
    try {
      const pending = this.capture({ showTag: this.showTag });   // 渲染那一帧是同步做完的
      this._flash();                                             // 马上白闪，编码 JPEG 在后台进行
      const photo = await pending;
      if (!photo?.blob) throw new Error('toBlob 返回空');
      this._openPreview(photo);
    } catch (e) {
      console.error('拍照失败', e);
      this._openPreview(null, '拍照失败了，请再试一次');
    } finally {
      this.busy = false;
    }
  }

  _flash() {
    const f = this.flash;
    f.classList.remove('go'); void f.offsetWidth; f.classList.add('go');   // 重新触发动画
  }

  _openPreview(photo, err) {
    this._revoke();
    this.photo = photo;
    if (photo) { this.url = URL.createObjectURL(photo.blob); this.img.src = this.url; this.img.hidden = false; }
    else this.img.hidden = true;
    this.img.alt = photo ? `照片 ${photo.width}×${photo.height}` : '';
    this.saveBtn.disabled = !photo;
    this.msg.classList.toggle('err', !!err);
    this.msg.textContent = err || this.hint;
    this.preview.hidden = false;
    document.body.classList.add('preview-open');
  }

  async save() {
    if (!this.photo) return;
    this.saveBtn.disabled = true;
    try {
      const r = await savePhoto(this.photo);
      this.lastSave = { result: r, name: this.photo.name };
      this.msg.classList.remove('err');
      this.msg.textContent = r === 'shared' ? '已交给系统分享，选「存储图像 / 保存到相册」即可'
        : r === 'cancelled' ? '已取消。可以再点「保存」，或长按照片保存'
        : `已下载：${this.photo.name}（在“下载”文件夹或相册里）。iPhone 也可以长按照片 →「存储到照片」`;
    } catch (e) {
      console.error('保存失败', e);
      this.msg.classList.add('err');
      this.msg.textContent = '保存失败。可以长按照片保存';
    } finally {
      this.saveBtn.disabled = false;
    }
  }

  closePreview() {
    this.preview.hidden = true;
    document.body.classList.remove('preview-open');
    this.img.removeAttribute('src');
    this._revoke();
    this.photo = null;                  // 不留在内存里
  }

  _revoke() { if (this.url) { URL.revokeObjectURL(this.url); this.url = null; } }
}
