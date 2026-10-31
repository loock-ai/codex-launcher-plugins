// @vitest-environment node
import {expect,it} from 'vitest';
import {chromium} from 'playwright-core';
import {resolve} from 'node:path';
import {DotsAdapter} from '../../server/dots/adapter.js';
import {createControlGateway} from '../../server/cdp/control-gateway.js';
import type {DesktopControlChannel} from '../../server/cdp/control-channel.js';
/** 真实 Chromium、麦克风模拟设备及双向音频；远端信令使用受控 WebRTC 对端，不访问真实 Dot。 */
it.skipIf(process.env.RUN_VOICE_BROWSER_TEST!=='1')('网页电话按钮建立双向音频，静音并挂断释放两端连接',async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.VOICE_TEST_BROWSER,args:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream']});
 const context=await browser.newContext({locale:'zh-CN',viewport:{width:390,height:780},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (Linux; Android 13; Mobile) AppleWebKit/537.36 Chrome/143.0.0.0 Mobile Safari/537.36'}),remote=await browser.newPage();
 const progress=(stage:string)=>{if(process.env.DEBUG_VOICE_TEST==='1')console.log('voice-test:',stage);};
 await remote.setContent('<button id="audio">启用受控音频</button><script>document.getElementById("audio").onclick=()=>{window.remoteAudio=new AudioContext();window.remoteAudio.resume();};</script>');
 await remote.getByRole('button',{name:'启用受控音频'}).click();
 const paths:string[]=[];
 const dots=new DotsAdapter({status:async()=>({available:true,voiceSignaling:true,identityKey:'test-account'}),close:async()=>{},request:async request=>{
  paths.push(request.path);
  if(request.path.endsWith('/voice/calls')){
   progress('allocate');
   const answer=await remote.evaluate(async(sdp:string)=>{
    const w=window as any,pc=w.remotePeer=new RTCPeerConnection();
    const ac=w.remoteAudio as AudioContext,osc=ac.createOscillator(),dest=ac.createMediaStreamDestination();osc.connect(dest);osc.start();await ac.resume();
    for(const track of dest.stream.getTracks())pc.addTrack(track,dest.stream);
    pc.ondatachannel=(event:RTCDataChannelEvent)=>{w.remoteChannel=event.channel;};
    await pc.setRemoteDescription({type:'offer',sdp});await pc.setLocalDescription(await pc.createAnswer());
    if(pc.iceGatheringState!=='complete')await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('ICE gathering timeout')),5000);pc.addEventListener('icegatheringstatechange',()=>{if(pc.iceGatheringState==='complete'){clearTimeout(timer);resolve();}});});
    return pc.localDescription.sdp;
   },(request.body as {sdp:string}).sdp);
   progress('answer');return {status:201,body:answer,headers:{location:'/tbo/dot/voice/calls/rtc_test','openai-root-thread-id':'thread'}};
  }
  if(request.path.endsWith('/attach'))return {status:204,body:''};
  if(request.path.endsWith('/stop')){await remote.evaluate(async()=>{(window as any).remotePeer.close();await (window as any).remoteAudio.close();});return {status:204,body:''};}
  if(request.path.startsWith('/tbo?'))return {status:200,body:{items:[{id:'dot',display_name:'语音测试 Dot',aeon_kind:'orbit',messaging_room_id:'room',active_root_thread_id:'thread'}]}};
  if(request.path==='/tbo/primary')return {status:200,body:{selection:null}};
  if(request.path.endsWith('/room'))return {status:200,body:{members:[]}};
  return {status:200,body:{items:[]}};
 }});
 const channel:DesktopControlChannel={connect:async()=>{},close:async()=>{},status:()=>({connected:true,capabilities:{}}),pendingApprovals:()=>[],hosts:async()=>[],request:async()=>({data:[],nextCursor:null}),respond:async()=>({}),subscribe:()=>()=>{},setUserQuestionTargets:()=>{},refreshUserQuestions:async()=>{}};
 const gateway=await createControlGateway({channel,dots,host:'127.0.0.1',port:0,token:'voice-test-token',staticDir:resolve('dist')}).catch(async error=>{await browser.close();await dots.close();throw error;});
 const phone=await context.newPage();
 phone.setDefaultTimeout(5000);remote.setDefaultTimeout(5000);
 await phone.addInitScript(()=>{
  const w=window as any,Native=RTCPeerConnection;w.voicePeers=[];
  w.RTCPeerConnection=class extends Native{constructor(config?:RTCConfiguration){super(config);w.voicePeers.push(this);}};
 });
 try{
  const root=`http://127.0.0.1:${gateway.port}`;
  expect((await fetch(root+'/api/dots/voice/start',{method:'POST',body:'{}'})).status).toBe(401);
  await phone.goto(root+'/?token=voice-test-token#dots');
  progress('page-ready');
  await phone.getByRole('button',{name:'语音通话',exact:true}).click();
  progress('dial');
  await phone.getByRole('button',{name:'静音',exact:true}).waitFor({timeout:25000});
  progress('active');
  await phone.waitForFunction(async()=>{
   const pc=(window as any).voicePeers[0],stats=await pc.getStats();let received=0,sent=0;
   stats.forEach((s:any)=>{if(s.type==='inbound-rtp'&&s.kind==='audio')received+=s.bytesReceived;if(s.type==='outbound-rtp'&&s.kind==='audio')sent+=s.bytesSent;});return received>0&&sent>0;
  });
  expect(await remote.evaluate(async()=>{let received=0;const stats=await (window as any).remotePeer.getStats();stats.forEach((s:any)=>{if(s.type==='inbound-rtp'&&s.kind==='audio')received+=s.bytesReceived;});return received>0;})).toBe(true);
  progress('audio-stats');
  await phone.getByRole('button',{name:'静音',exact:true}).click();
  expect(await phone.evaluate(()=>(window as any).voicePeers[0].getSenders().filter((sender:RTCRtpSender)=>sender.track?.kind==='audio').every((sender:RTCRtpSender)=>!sender.track?.enabled))).toBe(true);
  expect(await phone.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await phone.setViewportSize({width:320,height:690});
  const hangup=await phone.getByRole('button',{name:'挂断',exact:true}).boundingBox();
  expect(hangup!.x).toBeGreaterThanOrEqual(0);expect(hangup!.x+hangup!.width).toBeLessThanOrEqual(320);
  await phone.setViewportSize({width:390,height:780});
  await phone.screenshot({path:'/tmp/dot-voice-browser-active.png'});
  progress('screenshot');
  await phone.getByRole('button',{name:'挂断',exact:true}).click();
  await phone.waitForFunction(()=>(window as any).voicePeers[0].connectionState==='closed');
  await remote.waitForFunction(()=>(window as any).remotePeer.connectionState==='closed');
  expect(await phone.evaluate(()=>(window as any).voicePeers[0].getSenders().every((sender:RTCRtpSender)=>!sender.track||sender.track.readyState==='ended'))).toBe(true);
  expect(paths.filter(path=>path.endsWith('/voice/calls'))).toHaveLength(1);
  expect(paths).toContain('/tbo/dot/voice/calls/rtc_test/attach');expect(paths).toContain('/tbo/dot/voice/calls/rtc_test/stop');
  progress('stopped');
 }catch(error){
  const state=await phone.evaluate(()=>({voice:document.querySelector('.dots-voice')?.textContent,peers:(window as any).voicePeers?.map((pc:RTCPeerConnection)=>({connection:pc.connectionState,ice:pc.iceConnectionState}))}));
  const remoteState=await remote.evaluate(()=>({peer:(window as any).remotePeer?.connectionState,channel:(window as any).remoteChannel?.readyState}));
  throw new Error(JSON.stringify({error:String(error),state,remoteState,paths}));
 }finally{try{await gateway.close();}finally{await browser.close();}}
},45000);
