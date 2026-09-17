import test from 'node:test';
import assert from 'node:assert/strict';
import {downloadRecording} from '../scripts/audio-download.mjs';
const sound={id:'bsb-3598',downloadId:'3598',downloadMethod:'bigsoundbank-form'};
const html=`<form id="dl-form" action="/modules/telecharger.php" method="POST"><input name="id" value="3598"><input name="format" value="wav"><input name="antibot_hp" value=""><input name="antibot_n" value="fixture-nonce"></form><script>var delaiMs = 5 * 1000;</script>`;
test('public WAV download preserves form fields, session and advertised delay',async()=>{
  let call=0,waited=false;
  const result=await downloadRecording(sound,{wait:async ms=>{assert.equal(ms,5200);waited=true;},fetchImpl:async(url,options)=>{
    call++;
    if(call===1){assert.equal(url,'https://bigsoundbank.com/download.php');assert.equal(options.body.get('id'),'3598');return new Response(html,{headers:{'Set-Cookie':'PHPSESSID=fixture; Path=/; HttpOnly'}});}
    assert.equal(call,2);assert.ok(waited);assert.equal(url,'https://bigsoundbank.com/modules/telecharger.php');assert.equal(options.headers.Cookie,'PHPSESSID=fixture');assert.equal(options.body.get('antibot_n'),'fixture-nonce');assert.equal(options.body.get('antibot_hp'),'');return new Response('RIFFfixture');
  }});
  assert.equal(await result.text(),'RIFFfixture');
});
test('changed form or different recording aborts without a second request',async()=>{
  for(const page of ['<h1>Unavailable</h1>',html.replace('value="3598"','value="0001"')]){
    let calls=0;await assert.rejects(downloadRecording(sound,{wait:async()=>assert.fail('must not wait'),fetchImpl:async()=>{calls++;return new Response(page);}}),/form/);assert.equal(calls,1);
  }
});
test('direct downloads retain the original URL and reject HTTP errors',async()=>{
  await assert.rejects(downloadRecording({id:'example',downloadURL:'https://example.invalid/file.wav'},{fetchImpl:async url=>{assert.equal(url,'https://example.invalid/file.wav');return new Response('',{status:404});}}),/404/);
});
