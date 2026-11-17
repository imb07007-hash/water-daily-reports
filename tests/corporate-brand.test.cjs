'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const read=p=>fs.readFileSync(p,'utf8');
const svg=read('assets/wsc-logo.svg');
const mark=read('assets/wsc-mark.svg');
const css=read('assets/wsc-brand.css');
const index=read('index.html');
const core=read('assets/core-app.js');

test('official company artwork is a standalone vector, not a blurry embedded PNG',()=>{
 assert.ok(svg.startsWith('<svg '));
 assert.ok(svg.includes('viewBox="0 0 256 152"'));
 assert.ok((svg.match(/<path\s/g)||[]).length>=40);
 assert.doesNotMatch(svg,/<image|<foreignObject|<script|<text|font-family|data:image/i);
 assert.equal((svg.match(/<svg/g)||[]).length,(svg.match(/<\/svg>/g)||[]).length);
 assert.ok(mark.includes('viewBox="0 0 256 84"'));
 assert.equal((mark.match(/<path\s/g)||[]).length,6);
 for(const hex of ['#0362AF','#50B4F2','#87329A'])assert.ok(svg.includes(hex),hex);
});
test('design system uses all four official colors in the app, not image raster sampling',()=>{
 for(const hex of ['#0362AF','#50B4F2','#87329A','#444444','#FFFFFF']){
  assert.ok(css.includes(hex),hex);
 }
 assert.ok(index.includes('/assets/wsc-brand.css'));
 assert.ok(css.includes('.login-logo-shell img.brand-logo-login'));
 assert.ok(css.includes('clip-path:none!important'));
 assert.ok(css.includes('object-fit:contain'));
});
test('every existing company logo points to same vector including printable report',()=>{
 assert.ok(core.includes("const LOGO='/assets/wsc-logo.svg?v=20261117-official';"));
 assert.doesNotMatch(core,/const LOGO='data:image\/png;base64/);
 assert.ok(core.includes("el.src=LOGO"));
 assert.ok(core.includes("logo.src=LOGO"));
 assert.ok(core.includes("logo:()=>LOGO"));
 assert.equal((index.match(/<img data-brand-logo src="\/assets\/wsc-logo\.svg/g)||[]).length,3);
 assert.ok(core.includes("icon.type='image/svg+xml'"));
});
test('vector artwork and CSS do not include font files or user secrets',()=>{
 for(const s of [svg,mark,css]){
  assert.doesNotMatch(s,/@font-face|\.otf\b|\.ttf\b|sb_secret_|SUPABASE_SECRET_KEY|Authorization:\s*Bearer/i);
 }
});
