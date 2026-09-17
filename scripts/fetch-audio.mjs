import {downloadRecording} from './audio-download.mjs';
import fs from 'node:fs/promises';import path from 'node:path';import {createHash} from 'node:crypto';
const sounds=JSON.parse(await fs.readFile(new URL('../src/catalog.public.json',import.meta.url),'utf8'));
for(const sound of sounds.filter(s=>!s.generated)){
 const dst=new URL('../public/'+sound.path.replace(/^\.\//,''),import.meta.url);
 let bytes;try{bytes=await fs.readFile(dst);}catch{}
 if(bytes&&createHash('sha256').update(bytes).digest('hex')===sound.sha256)continue;
 const response=await downloadRecording(sound);
 if(!response.ok)throw Error(`Download failed: ${sound.id} (${response.status})`);
 bytes=Buffer.from(await response.arrayBuffer());
 if(createHash('sha256').update(bytes).digest('hex')!==sound.sha256)throw Error(`Changed upstream audio: ${sound.id}; review before updating manifest.`);
 // fileURLToPath handles spaces and non-ASCII folder names correctly.
 const {fileURLToPath}=await import('node:url');await fs.mkdir(path.dirname(fileURLToPath(dst)),{recursive:true});
 await fs.writeFile(dst,bytes);console.log(`Downloaded ${sound.id}`);
}
