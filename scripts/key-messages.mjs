// One-time, position-based migration: retain the existing rendering/provider system.
import {createRequire} from 'node:module';
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join,relative,dirname} from 'node:path';
const parser=createRequire(import.meta.url)('next/dist/compiled/babel/bundle').parser();
const original=JSON.parse(await readFile('apps/web/messages/en.json','utf8'));
const catalog={},mapping={};
function key(value){const normalized=value.replace(/\s+/g,' ').trim();if(!normalized)return null;const id='ui.'+createHash('sha256').update(normalized).digest('hex').slice(0,16);catalog[id]=normalized;mapping[normalized]=id;return id;}
for(const value of Object.values(original))key(value);
async function files(root){let out=[];for(const d of await readdir(root,{withFileTypes:true})){if(d.name==='.next')continue;const p=join(root,d.name);if(d.isDirectory())out.push(...await files(p));else if(/\.tsx?$/.test(p))out.push(p);}return out;}
const roots=[...await files('apps/web/app'),...await files('apps/web/components'),...await files('apps/web/lib')];
for(const file of roots){
 if(file.includes('/lib/i18n/'))continue;
 let source=await readFile(file,'utf8');const ast=parser.parse(source,{sourceType:'module',plugins:['typescript','jsx']});const changes=[];
 const component=file.includes('/components/')||file.includes('/app/')&&!file.includes('/api/');
 function replace(n,value,jsx=false){const id=key(value);if(id)changes.push([n.start,n.end,(jsx?'{':'')+'message('+JSON.stringify(id)+')'+(jsx?'}':'')]);}
 function walk(n,parent){if(!n||typeof n!=='object')return;
 if(n.type==='JSXText' && /\S/.test(n.value)&&/[A-Za-z]/.test(n.value)){const raw=n.value;const normalized=raw.replace(/\s+/g,' ').trim();const prefix=/^\s/.test(raw)?' ':'';const suffix=/\s$/.test(raw)?' ':'';const id=key(normalized);changes.push([n.start,n.end,'{'+(prefix?JSON.stringify(prefix)+' + ':'')+'message('+JSON.stringify(id)+')'+(suffix?' + '+JSON.stringify(suffix):'')+'}']);return;}
 if(n.type==='StringLiteral'){
 const value=n.value, norm=value.replace(/\s+/g,' ').trim();
 const attr=parent?.type==='JSXAttribute';
 const userAttr=attr&&['placeholder','title','aria-label','alt','label','description','aria-valuetext'].includes(parent.name?.name);
 const protectedContext=['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration','TSLiteralType','ObjectMethod','ImportSpecifier','ExportSpecifier'].includes(parent?.type) || (parent?.type==='ObjectProperty'&&parent.key===n&&!parent.computed);
 const known=Object.hasOwn(mapping,norm);
 if(!protectedContext && (userAttr||(!attr&&known&&component))) {replace(n,value,attr);return;}
 // Server-side user-visible errors and notification/status strings.
 if(!component&&known&&!protectedContext&&!attr && (parent?.type==='NewExpression'&&parent.callee?.name==='AuthError' || parent?.type==='ObjectProperty'&&['message','error','title','description','label'].includes(parent.key?.name??parent.key?.value))) {replace(n,value);return;}
 }
 if(n.type==='TemplateLiteral'&&component){const text=n.quasis.map((q,i)=>q.value.cooked+(i<n.expressions.length?'{'+i+'}':'')).join('');const norm=text.replace(/\s+/g,' ').trim();if(mapping[norm]&&norm.includes(' ')&&!text.startsWith('/')){const id=key(text);changes.push([n.start,n.end,'message('+JSON.stringify(id)+', ['+n.expressions.map(e=>source.slice(e.start,e.end)).join(', ')+'])']);return;}}
 for(const [k,v]of Object.entries(n))if(!['loc','extra','comments'].includes(k)){if(Array.isArray(v))v.forEach(x=>walk(x,n));else walk(v,n);}
 }walk(ast,null);
 if(!changes.length)continue;
 for(const [a,b,value]of changes.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+value+source.slice(b);
 const path=relative(dirname(file),'apps/web/lib/i18n/source').replaceAll('\\','/');const imp='import { message } from '+JSON.stringify(path.startsWith('.')?path:'./'+path)+';\n';
 const directive=/^["']use client["'];?/.exec(source);source=directive?source.slice(0,directive[0].length)+'\n'+imp+source.slice(directive[0].length):imp+source;
 await writeFile(file,source);
}
for(const filename of await readdir('apps/web/messages')){if(!filename.endsWith('.json')||filename==='en.json')continue;const old=JSON.parse(await readFile('apps/web/messages/'+filename,'utf8'));const next={};for(const [k,v]of Object.entries(old)){const id=mapping[k.replace(/\s+/g,' ').trim()];if(id)next[id]=v;}await writeFile('apps/web/messages/'+filename,JSON.stringify(next,null,2)+'\n');}
await writeFile('apps/web/messages/en.json',JSON.stringify(catalog,null,2)+'\n');
await writeFile('apps/web/messages/source-map.json',JSON.stringify(mapping,null,2)+'\n');
console.log('Migrated',Object.keys(catalog).length,'source keys.');
