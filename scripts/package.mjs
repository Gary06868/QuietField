import {packager} from '@electron/packager';
import fs from 'node:fs/promises';import path from 'node:path';
const root=process.cwd(),pkg=JSON.parse(await fs.readFile('package.json','utf8'));
const edition=JSON.parse(await fs.readFile('dist/edition.json','utf8')).edition;
const stage=await fs.mkdtemp(path.join(root,'.build-assets-package-'));
const out=path.resolve(process.env.QUIET_FIELD_OUT||`releases/${pkg.version}-${edition}`);
try{
 for(const name of ['dist','electron.cjs','preload.cjs','window-state.cjs','window-geometry.cjs','LICENSE','THIRD_PARTY_NOTICES.md'])await fs.cp(path.join(root,name),path.join(stage,name),{recursive:true});
 await fs.writeFile(path.join(stage,'package.json'),JSON.stringify({...pkg,scripts:undefined,dependencies:undefined,devDependencies:undefined}));
 const electronVersion=JSON.parse(await fs.readFile('node_modules/electron/package.json','utf8')).version;
 const paths=await packager({dir:stage,name:'QuietField',executableName:process.platform==='win32'?'静野':'QuietField',platform:process.platform,arch:process.arch,electronVersion,out,overwrite:false,asar:false,icon:process.platform==='win32'?path.join(root,'public/icon.ico'):undefined,prune:false,win32metadata:{CompanyName:'Quiet Field',FileDescription:'静野 · 本地环境音播放器',ProductName:'静野'},appVersion:pkg.version});
 console.log(paths.join('\n'));
}finally{await fs.rm(stage,{recursive:true,force:true});}
