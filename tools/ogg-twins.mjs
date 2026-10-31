// Gives every .ogg under public/sfx and public/music an AAC twin (.mp4) next to it: Safari before
// 18.4 (iPhones before iOS 18.4) can't decode Ogg Vorbis, and the game falls back to the twin
// (see _decode in src/core/audio.js). Only missing or outdated twins are made. Needs ffmpeg.
// Usage: node tools/ogg-twins.mjs
import fs from 'fs';
import path from 'path';
import { execFileSync } from 'child_process';

const oggs = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.ogg$/i.test(f)) oggs.push(p); } };
for (const dir of ['public/sfx', 'public/music']) if (fs.existsSync(dir)) walk(dir);
let made = 0;
for (const src of oggs) {
  const out = src.replace(/\.ogg$/i, '.mp4');
  if (fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) continue;
  // music (long, stereo) gets more bits than the short effects
  const rate = src.includes('music') ? '160k' : '128k';
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-map_metadata', '-1', '-c:a', 'aac', '-b:a', rate, '-movflags', '+faststart', out]);
  made++;
}
console.log(`[ogg-twins] ${oggs.length} ogg files, ${made} twins made`);
