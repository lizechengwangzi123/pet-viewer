// 本机资料：选的形象 + 昵称，存在 localStorage（不登录、不上传）。第 5 步做账号后再同步到云端。
import { CONFIG, OWNERS, ownerById } from './config.js';

const KEY = CONFIG.profile.storageKey;

/** 按“字”切分：中文、英文字母、emoji（含组合 emoji）都算 1 个 */
export function splitChars(s) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return Array.from(new Intl.Segmenter('zh', { granularity: 'grapheme' }).segment(s), (x) => x.segment);
  }
  return Array.from(s);
}

/** 清理昵称：去掉所有空白（含全角空格、换行、零宽字符）和控制字符，最多 nicknameMax 个字 */
export function sanitizeNickname(raw, max = CONFIG.profile.nicknameMax) {
  const s = String(raw ?? '')
    .normalize('NFC')
    .replace(/[\s\u200B-\u200D\u2060\uFEFF\u3000]/gu, '')
    .replace(/\p{Cc}/gu, '');
  return splitChars(s).slice(0, max).join('');
}

export function loadProfile() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    const nickname = sanitizeNickname(p?.nickname);
    if (!ownerById(p?.owner) || !nickname) return null;   // 坏数据 / 形象被删了：重新选
    return { owner: p.owner, nickname };
  } catch { return null; }
}

export function saveProfile({ owner, nickname }) {
  const p = { owner, nickname: sanitizeNickname(nickname), savedAt: Date.now() };
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* 隐私模式：这次能玩，下次要重新输 */ }
  return p;
}

export function defaultOwnerId() {
  return ownerById(CONFIG.previewOwner)?.id || OWNERS[0].id;
}
