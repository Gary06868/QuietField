import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'vite';
const root=process.cwd(),personal=process.argv.includes('--personal');
const catalogFile=path.join(root,`src/catalog${personal?'':'.public'}.json`);
const catalog=JSON.parse(await fs.readFile(catalogFile,'utf8'));
// A fresh directory prevents excluded audio from leaking into a public build.
const stage=await fs.mkdtemp(path.join(root,'.build-assets-'));
try{
 for(const name of ['art','fonts','icon.png','icon.ico'])await fs.cp(path.join(root,'public',name),path.join(stage,name),{recursive:true});
 await fs.mkdir(path.join(stage,'licenses'),{recursive:true});
 for(const name of await fs.readdir(path.join(root,'public/licenses'))){
  if(!personal&&(name.startsWith('Moodist')||name==='音源与授权.md'))continue;
  await fs.cp(path.join(root,'public/licenses',name),path.join(stage,'licenses',name),{recursive:true});
 }
 for(const sound of catalog.filter(s=>!s.generated)){
  if(!personal&&(!sound.sha256||!sound.license||!sound.source))throw Error(`Missing provenance: ${sound.id}`);
  const rel=sound.path.replace(/^\.\//,''),src=path.join(root,'public',rel),dst=path.join(stage,rel);
  const data=await fs.readFile(src);
  if(sound.sha256&&createHash('sha256').update(data).digest('hex')!==sound.sha256)throw Error(`Audio checksum mismatch: ${sound.id}`);
  await fs.mkdir(path.dirname(dst),{recursive:true});await fs.writeFile(dst,data);
 }
 await fs.writeFile(path.join(stage,'catalog.json'),JSON.stringify(catalog,null,2));
 await fs.writeFile(path.join(stage,'edition.json'),JSON.stringify({edition:personal?'personal':'public',sounds:catalog.length}));
 await fs.copyFile(path.join(root,'THIRD_PARTY_NOTICES.md'),path.join(stage,'licenses/THIRD_PARTY_NOTICES.md'));
 await build({configFile:false,base:'./',publicDir:stage,resolve:{alias:{'#catalog':catalogFile}},define:{__PUBLIC_LIBRARY__:JSON.stringify(!personal)},build:{target:'es2022'}});
}finally{await fs.rm(stage,{recursive:true,force:true});}
