// One-time additive wrapping. Localization returns fragments and preserves interactive props.
import {createRequire} from 'node:module';import {readFile,writeFile,readdir} from 'node:fs/promises';import {relative,dirname,join} from 'node:path';
const require=createRequire(import.meta.url),parser=require('next/dist/compiled/babel/bundle').parser();
async function files(root){const all=[];for(const d of await readdir(root,{withFileTypes:true})){const p=join(root,d.name);if(d.isDirectory()){if(!['api'].includes(d.name))all.push(...await files(p));}else if(p.endsWith('.tsx'))all.push(p);}return all;}
for(const file of [...await files('apps/web/components'),...await files('apps/web/app')]){
 if(file.endsWith('/localization.tsx')||file.endsWith('/app/layout.tsx'))continue;
 let source=await readFile(file,'utf8');if(source.includes('import { Localized }'))continue;
 const ast=parser.parse(source,{sourceType:'module',plugins:['typescript','jsx']});const changes=[];
 function containsJSX(n){if(!n||typeof n!=='object')return false;if(['JSXElement','JSXFragment'].includes(n.type))return true;if(['FunctionExpression','ArrowFunctionExpression'].includes(n.type))return false;return Object.entries(n).some(([k,v])=>!['loc','extra','comments'].includes(k)&&(Array.isArray(v)?v.some(containsJSX):containsJSX(v)));}
 function walk(n){if(!n||typeof n!=='object')return;
  if(n.type==='ReturnStatement'&&containsJSX(n.argument)){
   const a=n.argument;changes.push([a.start,a.end,`<Localized>{${source.slice(a.start,a.end)}}</Localized>`]);return;
  }
  for(const [key,value] of Object.entries(n))if(!['loc','comments','extra'].includes(key)){if(Array.isArray(value))value.forEach(walk);else walk(value);}
 }
 walk(ast);if(!changes.length)continue;
 for(const [start,end,text] of changes.sort((a,b)=>b[0]-a[0]))source=source.slice(0,start)+text+source.slice(end);
 const path=relative(dirname(file),'apps/web/components/localization').replaceAll('\\','/');const statement=`import { Localized } from '${path.startsWith('.')?path:'./'+path}';\n`;
 const directive=/^["']use client["'];?/.exec(source);source=directive?source.slice(0,directive[0].length)+'\n'+statement+source.slice(directive[0].length):statement+source;
 await writeFile(file,source);
}
