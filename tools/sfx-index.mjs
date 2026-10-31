// Writes public/sfx/index.json listing every audio file under public/sfx (the game loads
// whatever is listed; missing groups fall back to procedural sound), and public/alt/index.json
// for the candidate replacements under public/alt (shown only on sounds.html, never loaded by the game).
import fs from 'fs';
import path from 'path';
const index = (dir) => {
  const root = path.resolve(dir);
  const out = [];
  const walk = (d) => {
    for (const f of fs.readdirSync(d)) {
      const p = path.join(d, f);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (/\.(ogg|mp3|wav)$/i.test(f)) out.push(path.relative(root, p).split(path.sep).join('/'));
    }
  };
  if (!fs.existsSync(root)) return 0;
  walk(root);
  out.sort();
  fs.writeFileSync(path.join(root, 'index.json'), JSON.stringify(out, null, 0));
  return out.length;
};
console.log(`[sfx] indexed ${index('public/sfx')} files`);
if (fs.existsSync('public/alt')) console.log(`[sfx] indexed ${index('public/alt')} alternatives`);
