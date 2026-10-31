// Turns dist/ into a claude.ai Artifact page: the page body (no doctype/head/body - the host adds the
// skeleton) with inlined CSS, plus the JS chunks as supporting files.
// Usage: npm run build && node tools/build-artifact.mjs <outDir>
import fs from 'fs';
import path from 'path';
const out = process.argv[2];
if (!out) { console.error('usage: node tools/build-artifact.mjs <outDir>'); process.exit(1); }
const dist = path.resolve('dist');
const html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8');
const js = html.match(/<script type="module"[^>]*src="\.\/(assets\/[^"]+\.js)"/)[1];
const css = html.match(/<link rel="stylesheet"[^>]*href="\.\/(assets\/[^"]+\.css)"/)[1];
const body = html.match(/<body>([\s\S]*?)<\/body>/)[1].replace(/<script[\s\S]*?<\/script>/g, '').trim();
fs.mkdirSync(path.join(out, 'assets'), { recursive: true });
for (const f of fs.readdirSync(path.join(dist, 'assets'))) {
  if (f.endsWith('.js')) fs.copyFileSync(path.join(dist, 'assets', f), path.join(out, 'assets', f));
}
// sound effects and music (public/sfx and public/music are copied into dist/ by Vite)
const sfxFiles = [];
const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(ogg|mp4|mp3|wav|json)$/i.test(f)) sfxFiles.push(path.relative(dist, p)); } };
for (const dir of ['sfx', 'music']) if (fs.existsSync(path.join(dist, dir))) walk(path.join(dist, dir));
for (const f of sfxFiles) { fs.mkdirSync(path.dirname(path.join(out, f)), { recursive: true }); fs.copyFileSync(path.join(dist, f), path.join(out, f)); }
// the page's web fonts come from the built index.html, so the two never drift apart
const fonts = (html.match(/<link href="https:\/\/fonts\.googleapis\.com\/css2[^>]*>/) || [''])[0].replace(/\s*\/>$/, '>');
const page = `<title>Bloodline</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
${fonts}
<style>
html, body { height: 100%; }
${fs.readFileSync(path.join(dist, css), 'utf8')}
</style>
${body}
<script type="module" src="./${js}"></script>
`;
fs.writeFileSync(path.join(out, 'bloodline.html'), page);
const files = fs.readdirSync(path.join(out, 'assets')).map((f) => `assets/${f}`).concat(sfxFiles);
console.log(JSON.stringify({ page: path.join(out, 'bloodline.html'), files }, null, 1));
