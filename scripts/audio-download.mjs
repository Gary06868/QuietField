import {setTimeout as sleep} from 'node:timers/promises';

// Use the public download form and its advertised delay. No account is needed.
export async function downloadRecording(sound, {fetchImpl=fetch, wait=sleep}={}) {
  const request=async(url, options={})=>{
    const response=await fetchImpl(url,{...options,signal:AbortSignal.timeout(120000)});
    if(!response.ok)throw Error(`Download failed: ${sound.id} (${response.status})`);
    return response;
  };
  if(!sound.downloadMethod)return request(sound.downloadURL);
  if(sound.downloadMethod!=='bigsoundbank-form'||!/^\d{4}$/.test(sound.downloadId))throw Error(`Unknown download method: ${sound.id}`);
  const origin='https://bigsoundbank.com';
  const cookies=new Map();
  const remember=response=>{for(const cookie of response.headers.getSetCookie()){const pair=cookie.split(';',1)[0],split=pair.indexOf('=');cookies.set(pair.slice(0,split),pair.slice(split+1));}};
  const response=await request(origin+'/download.php', {method:'POST',body:new URLSearchParams({id:sound.downloadId,format:'wav',button:'Download'})});
  remember(response);
  const html=await response.text();
  const form=html.match(/<form\b[^>]*id=["']dl-form["'][^>]*>[\s\S]*?<\/form>/i)?.[0];
  if(!form||!/<form\b[^>]*action=["']\/modules\/telecharger\.php["']/i.test(form))throw Error(`Upstream download form changed: ${sound.id}; download WAV manually from the source page.`);
  const fields=new URLSearchParams();
  for(const input of form.matchAll(/<input\b[^>]*>/gi)){
    const attrs=Object.fromEntries([...input[0].matchAll(/([\w-]+)=["']([^"']*)["']/g)].map(m=>[m[1],m[2]]));
    if(attrs.name)fields.set(attrs.name,attrs.value||'');
  }
  if(fields.get('id')!==sound.downloadId||fields.get('format')!=='wav')throw Error(`Unexpected download form: ${sound.id}`);
  const delay=html.match(/var\s+delaiMs\s*=\s*(\d+)\s*\*\s*1000/);
  if(!delay||Number(delay[1])>60)throw Error(`Upstream download delay changed: ${sound.id}`);
  await wait(Number(delay[1])*1000+200);
  return request(origin+'/modules/telecharger.php',{method:'POST',body:fields,headers:{Cookie:[...cookies].map(([k,v])=>`${k}=${v}`).join('; '),Referer:origin+'/download.php'}});
}
