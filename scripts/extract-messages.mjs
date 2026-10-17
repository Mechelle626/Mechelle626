// Incremental key extraction. Keeps stable IDs and existing translations.
import {createRequire} from 'node:module';import {readFile,writeFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import {join,dirname,relative} from 'node:path';
const parser=createRequire(import.meta.url)('next/dist/compiled/babel/bundle').parser();
const catalog=JSON.parse(await readFile('apps/web/messages/en.json','utf8'));
const report=[],write=process.argv.includes('--write');
async function files(root){let out=[];for(const d of await readdir(root,{withFileTypes:true})){if(d.name==='.next')continue;const p=join(root,d.name);if(d.isDirectory())out.push(...await files(p));else if(/\.tsx?$/.test(p))out.push(p);}return out;}
const words=/^[A-Z][a-z]+(?: |$)/;
const technical=new Set(['GET','POST','HEAD','OPTIONS','PUT','PATCH','DELETE','Content-Type','Cache-Control','Content-Length','Content-Disposition','Content-Security-Policy','X-Content-Type-Options','Content-Transfer-Encoding','UnknownError','AuthError','InvalidStateError','AbortError','NotAllowedError','NotFoundError','NotReadableError','OverconstrainedError','SecurityError','UnsupportedError']);
function human(v){return words.test(v)&&!technical.has(v)&&!/^SELECT |^UPDATE |^INSERT |^DELETE |^ALTER |^CREATE |^DROP |^BEGIN$|^COMMIT$|^ROLLBACK$/.test(v);}
for(const file of [...await files('apps/web/components'),...await files('apps/web/app'),...await files('apps/web/lib')]){
 if(file.endsWith('/i18n/source.ts')||file.endsWith('/i18n/config.ts'))continue;
 let source=await readFile(file,'utf8');const ast=parser.parse(source,{sourceType:'module',plugins:['typescript','jsx']});const changes=[];const ui=file.includes('/components/')||file.includes('/app/')&&!file.includes('/api/');
 function add(n,v,jsx=false){const normalized=v.replace(/\s+/g,' ').trim();if(!normalized)return;const key='ui.'+createHash('sha256').update(normalized).digest('hex').slice(0,16);catalog[key]=normalized;report.push({file,line:n.loc.start.line,key,source:normalized});changes.push([n.start,n.end,(jsx?'{':'')+'bcText('+JSON.stringify(key)+')'+(jsx?'}':'')]);}
 function walk(n,p){if(!n||typeof n!=='object')return;
 if(n.type==='JSXText'&&/[A-Za-z]/.test(n.value)){add(n,n.value,true);return;}
 if(n.type==='StringLiteral'){
 const attr=p?.type==='JSXAttribute',label=attr&&['title','description','label','placeholder','alt','aria-label','aria-valuetext'].includes(p.name?.name);
 const excluded=['ImportDeclaration','ImportSpecifier','ExportNamedDeclaration','ExportAllDeclaration','TSLiteralType'].includes(p?.type)||(p?.type==='ObjectProperty'&&p.key===n&&!p.computed);
 const codeValue=attr&&!label;
 const uiCopy=ui&&human(n.value)&&!excluded&&!codeValue;
 const serverCopy=!ui&&!excluded&&(p?.type==='NewExpression'&&p.callee?.name==='AuthError'&&p.arguments[1]===n||p?.type==='ObjectProperty'&&(['message','error','title','description','label','name','tag','button','note'].includes(p.key?.name??p.key?.value)||file.endsWith('/onboarding/contracts.ts'))||p?.type==='CallExpression'&&p.callee?.type==='MemberExpression'&&['min','max','regex'].includes(p.callee.property?.name)&&p.arguments.includes(n));
 if(label&&/[A-Za-z]/.test(n.value)||uiCopy||serverCopy&&human(n.value)){add(n,n.value,attr);return;}
 }
 for(const [k,v]of Object.entries(n))if(!['loc','extra','comments'].includes(k)){if(Array.isArray(v))v.forEach(x=>walk(x,n));else walk(v,n);}
 }walk(ast,null);
 if(write&&changes.length){
 for(const [a,b,v]of changes.sort((a,b)=>b[0]-a[0]))source=source.slice(0,a)+v+source.slice(b);
 if(!source.includes('message as bcText')){const path=relative(dirname(file),'apps/web/lib/i18n/source').replaceAll('\\','/');const imp='import { message as bcText } from '+JSON.stringify(path.startsWith('.')?path:'./'+path)+';\n';const directive=/^["']use client["'];?/.exec(source);source=directive?source.slice(0,directive[0].length)+'\n'+imp+source.slice(directive[0].length):imp+source;}
 await writeFile(file,source);
 }
}
if(write)await writeFile('apps/web/messages/en.json',JSON.stringify(catalog,null,2)+'\n');
await writeFile('docs/source-copy-audit.json',JSON.stringify({note:'Static audit covers JSX text/attributes, English-looking UI literals and selected server messages. Review dynamic copy and external vendor UI separately.',unextracted:write?[]:report},null,2)+'\n');
console.log(JSON.stringify({unextracted:report.length,sourceKeys:Object.keys(catalog).length,applied:write}));
if(!write&&report.length)process.exitCode=1;
