// 头顶昵称牌：一张 canvas 贴图的 Sprite（永远朝向相机，1 个 draw call，不用 CSS2DRenderer）。
// 牌子大小按世界单位算，离得远自然变小；文字改了才重画贴图。
import * as THREE from 'three';

const PX_PER_M = 320;        // 贴图分辨率：1 米 = 320 像素（手机 DPR 2 下够清楚）
const H_M = 0.2;             // 牌子高度（米）

export class NameTag {
  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d');
    this.texture = new THREE.CanvasTexture(this.canvas);
    this.texture.colorSpace = THREE.SRGBColorSpace;
    this.texture.minFilter = THREE.LinearFilter;
    this.texture.generateMipmaps = false;
    this.material = new THREE.SpriteMaterial({ map: this.texture, transparent: true, depthWrite: false });
    this.sprite = new THREE.Sprite(this.material);
    this.sprite.center.set(0.5, 0);   // 牌子底边对准位置点
    this.sprite.renderOrder = 10;
    this.sprite.name = 'nametag';
    this.text = '';
    this.sprite.visible = false;
  }

  setText(text) {
    text = String(text || '');
    if (text === this.text) return;
    this.text = text;
    this.sprite.visible = !!text;
    if (!text) return;
    const h = Math.round(H_M * PX_PER_M);        // 66 px
    const font = `600 ${Math.round(h * 0.56)}px "PingFang SC", "Noto Sans SC", "Microsoft YaHei", system-ui, sans-serif`;
    const g = this.ctx;
    g.font = font;
    const padX = h * 0.42;
    const w = Math.ceil(g.measureText(text).width + padX * 2);
    this.canvas.width = w; this.canvas.height = h;
    g.font = font;                                 // 改尺寸会重置 context
    g.fillStyle = 'rgba(20, 40, 30, 0.62)';
    const r = h / 2;
    g.beginPath();
    g.roundRect ? g.roundRect(0, 0, w, h, r) : g.rect(0, 0, w, h);
    g.fill();
    g.fillStyle = '#ffffff';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + h * 0.03);
    this.texture.dispose();                        // 尺寸变了，旧的 GPU 贴图作废
    this.texture.needsUpdate = true;
    this.sprite.scale.set(w / PX_PER_M, H_M, 1);
  }
}
