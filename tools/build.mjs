import fs from 'node:fs';
import path from 'node:path';
import matter from 'gray-matter';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

const ROOT = process.cwd();
const OUT = path.join(ROOT, 'dist');
const articleDir = path.join(ROOT, 'content', 'journal');

function escapeHTML(s = '') {return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function slugify(s) { return String(s).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9-]+/g,'-').replace(/^-+|-+$/g,'').slice(0,90); }
function validImage(source) {
  if (!source || typeof source !== 'string') return '';
  const value = source.trim();
  if (/^\/(?!\/)[\w\-./%]+$/.test(value) && !value.includes('..')) return value;
  if (/^https:\/\/[\w.-]+(?:\:[0-9]+)?\/[\w\-./%?=&]+$/i.test(value)) return value;
  return '';
}
function cleanMarkdown(markdown) {
  return sanitizeHtml(marked.parse(markdown || ''), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'figure', 'figcaption', 'h1', 'h2'],
    allowedAttributes: { a:['href','name','target','rel'], img:['src','alt','title','loading'], '*':['id'] },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: {img:['http','https']},
    allowProtocolRelative: false,
    transformTags: {
      'a': (tag, attrs) => ({tagName:'a',attribs:{...attrs, ...(attrs.target === '_blank' ? {rel:'noopener noreferrer'} : {})}})
    }
  });
}

fs.rmSync(OUT,{recursive:true,force:true});
fs.mkdirSync(OUT,{recursive:true});
const copy = (src,dest) => {if(fs.existsSync(path.join(ROOT,src))) fs.cpSync(path.join(ROOT,src),path.join(OUT,dest),{recursive:true});};
for(const filename of ['index.html','directory.html','fool.html','readings.html','journal.html'])copy(filename,filename);
for(const dir of ['assets','media'])copy(dir,dir);

const documents = fs.existsSync(articleDir) ? fs.readdirSync(articleDir,{withFileTypes:true}).filter(f=>f.isFile() && /\.md$/i.test(f.name)).map(f => ({name:f.name,...matter(fs.readFileSync(path.join(articleDir,f.name),'utf8'))})) : [];
const articles = documents.filter(({data,content}) => data.published === true && typeof data.title === 'string' && data.title.trim() && content.trim()).map(({name,data,content}) => ({
  title:data.title.trim(), arcana:typeof data.arcana==='string'?data.arcana.trim():'',description:typeof data.description==='string'?data.description.trim():'',
  image:validImage(data.image),body:cleanMarkdown(content),slug:slugify(path.basename(name,'.md'))
})).filter(a=>a.slug);
articles.sort((a,b)=>a.title.localeCompare(b.title,'en'));
const seen=new Set();for(const a of articles){if(seen.has(a.slug))throw new Error('Duplicate Journal slug: '+a.slug);seen.add(a.slug);}
const journal = fs.readFileSync(path.join(OUT,'journal.html'),'utf8');
const listing = articles.length ? `<div class="journal-entries">${articles.map((a,i) => `<article class="journal-entry">
<div class="journal-entry-copy"><span class="mini-label">${escapeHTML(a.arcana||'THE JOURNAL')} / ESSAY ${String(i+1).padStart(2,'0')}</span><h3><a href="/journal/${encodeURIComponent(a.slug)}/">${escapeHTML(a.title)}</a></h3>${a.description?`<p>${escapeHTML(a.description)}</p>`:''}<a class="line-link" href="/journal/${encodeURIComponent(a.slug)}/">READ ESSAY ↗</a></div>
${a.image?`<a class="journal-entry-cover" href="/journal/${encodeURIComponent(a.slug)}/"><img src="${escapeHTML(a.image)}" alt="" loading="lazy"></a>`:`<a class="journal-entry-cover no-image" href="/journal/${encodeURIComponent(a.slug)}/"><span aria-hidden="true">${String(i+1).padStart(2,'0')}</span></a>`}
</article>`).join('\n')}</div>` : `<div class="journal-empty"><span class="mini-label">THE JOURNAL</span><p>The archive is being prepared. Articles will appear here when released.</p><a class="line-link" href="/directory.html">Explore the directory ↗</a></div>`;
const updated = journal.replace(/<!-- JOURNAL_ARTICLES_START -->[\s\S]*?<!-- JOURNAL_ARTICLES_END -->/,`<!-- JOURNAL_ARTICLES_START -->\n${listing}\n<!-- JOURNAL_ARTICLES_END -->`);
if(updated===journal) throw new Error('Journal list markers missing');
fs.writeFileSync(path.join(OUT,'journal.html'),updated);
for(const a of articles){
  const dest=path.join(OUT,'journal',a.slug);fs.mkdirSync(dest,{recursive:true});
  fs.writeFileSync(path.join(dest,'index.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#f5f2e9"><meta name="description" content="${escapeHTML(a.description||a.title)}"><title>${escapeHTML(a.title)} — Wellington Hugo</title><link rel="stylesheet" href="/assets/sections/styles.css"><link rel="stylesheet" href="/assets/sections/journal-cms.css"></head><body><a href="#main" class="skip">Skip to content</a><header class="site-head"><a class="brand" href="/">Wellington Hugo</a><nav aria-label="Main menu"><a href="/#arcana">The Arcana</a><a href="/directory.html">Directory</a><a href="/journal.html" aria-current="page">Journal</a><a href="/readings.html">Readings</a></nav></header><main id="main" class="page"><header class="journal-essay-cover"><span class="mini-label">${escapeHTML(a.arcana||'THE JOURNAL')} / WELLINGTON HUGO</span><h1>${escapeHTML(a.title)}</h1>${a.description?`<p class="essay-subtitle">${escapeHTML(a.description)}</p>`:''}</header>${a.image?`<figure class="journal-hero-image"><img src="${escapeHTML(a.image)}" alt=""></figure>`:''}<article class="journal-essay-body">${a.body}</article><div class="journal-essay-back"><a class="line-link" href="/journal.html">← BACK TO THE JOURNAL</a></div></main><footer class="footer"><p>Wellington Hugo · Tarot & Photography</p><p>The Journal</p><p>© 2026</p></footer></body></html>`);
}
console.log(`Journal build complete: ${articles.length} published article(s), ${documents.length-articles.length} draft/incomplete article(s) excluded.`);
