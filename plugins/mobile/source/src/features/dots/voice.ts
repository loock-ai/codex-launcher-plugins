import type {VoiceBackgroundLease} from '../../audio/native-voice-background';
export type VoicePhase='idle'|'preparing'|'connecting'|'active'|'ended'|'error';
export interface VoiceState {phase:VoicePhase;muted:boolean;startedAt?:number;error?:string}
type Action='start'|'attach'|'heartbeat'|'stop';
export interface VoiceEnvironment {
 secure:boolean;
 getUserMedia():Promise<MediaStream>;
 createPeer():RTCPeerConnection;
 createAudio():HTMLAudioElement;
 request(action:Action,body:Record<string,string>):Promise<{answerSdp?:string}>;
 background?:VoiceBackgroundLease;
}
/** 每个实例只负责一次通话；取消不丢弃晚到的创建回执。 */
export class DotVoiceCall {
 private state:VoiceState={phase:'idle',muted:false};
 private finished=false;
 private stream?:MediaStream;
 private peer?:RTCPeerConnection;
 private channel?:RTCDataChannel;
 private audio?:HTMLAudioElement;
 private requestId='';
 private requested=false;
 private allocated=false;
 private heartbeat?:ReturnType<typeof setInterval>;
 private deadline?:ReturnType<typeof setTimeout>;
 private rejectReady?:(error:Error)=>void;
 private stopping?:Promise<void>;
 private backgroundRequested=false;
 constructor(private env:VoiceEnvironment,private onChange:(state:VoiceState)=>void){}
 private publish(update:Partial<VoiceState>){this.state={...this.state,...update};this.onChange(this.state);}
 async start(dotId:string,requestId:string){
  if(this.state.phase!=='idle'||this.finished)return;
  this.requestId=requestId;
  if(!this.env.secure){await this.finish('请通过 HTTPS 或本机安全地址打开页面，再使用语音通话。');return;}
  this.publish({phase:'preparing'});
  try{
   const stream=await this.env.getUserMedia();
   if(this.finished){stream.getTracks().forEach(track=>track.stop());return;}
   this.stream=stream;stream.getAudioTracks().forEach(track=>{track.enabled=false;});
   if(this.env.background){
    this.backgroundRequested=true;
    await this.env.background.start(requestId,message=>{void this.finish(message);});
    if(this.finished)return;
   }
   const peer=this.peer=this.env.createPeer(),audio=this.audio=this.env.createAudio();audio.autoplay=true;
   for(const track of stream.getTracks())peer.addTrack(track,stream);
   const channel=this.channel=peer.createDataChannel('oai-events');
   const ready=new Promise<void>((resolve,reject)=>{
    this.rejectReady=reject;
    const changed=()=>{
     if(this.finished)return;
     if(['failed','closed','disconnected'].includes(peer.connectionState)){reject(Error('语音连接已中断'));void this.finish('语音连接已中断，请检查网络。');}
     else if(peer.connectionState==='connected'&&channel.readyState==='open')resolve();
    };
    peer.addEventListener('connectionstatechange',changed);channel.addEventListener('open',changed);
    channel.addEventListener('close',()=>{if(!this.finished){reject(Error('语音数据连接已关闭'));void this.finish('语音数据连接已关闭。');}});
    channel.addEventListener('message',event=>{
     if(this.finished)return;
     try{if(JSON.parse(event.data).type==='session.closed')void this.finish();}catch{/* 忽略非会话结束事件。 */}
    });
    this.deadline=setTimeout(()=>{reject(Error('语音连接超时'));void this.finish('语音连接超时，请检查网络后重试。');},20000);
   });
   void ready.catch(()=>{});
   peer.addEventListener('track',event=>{
    if(this.finished)return;
    audio.srcObject=event.streams[0]??new MediaStream([event.track]);
    void audio.play().catch(()=>this.finish('浏览器未能播放通话声音，请检查声音权限后重试。'));
   });
   this.publish({phase:'connecting'});
   const offer=await peer.createOffer();if(this.finished)return;
   await peer.setLocalDescription(offer);if(this.finished)return;
   const sdp=peer.localDescription?.sdp??offer.sdp;
   if(!sdp)throw Error('浏览器未能生成语音连接信息');
   this.requested=true;
   const result=await this.env.request('start',{dotId,requestId,sdp});this.allocated=true;
   if(this.finished){await this.cleanupRemote();return;}
   if(!result.answerSdp?.startsWith('v=0'))throw Error('未收到有效的语音连接应答');
   this.startHeartbeat();
   await peer.setRemoteDescription({type:'answer',sdp:result.answerSdp});
   if(this.finished){await this.cleanupRemote();return;}
   await Promise.all([ready,this.env.request('attach',{requestId})]);
   if(this.finished)return;
   clearTimeout(this.deadline);
   stream.getAudioTracks().forEach(track=>{track.enabled=!this.state.muted;});
   this.publish({phase:'active',startedAt:Date.now()});
  }catch(error){
   if(!this.finished)await this.finish(error instanceof Error?error.message:'无法建立语音通话');
  }
 }
 private startHeartbeat(){
  let pending=false;
  this.heartbeat=setInterval(()=>{
   if(pending||this.finished)return;pending=true;
   try{this.env.background?.pulse(this.requestId);}catch{pending=false;void this.finish('后台通话服务已失效，请重新拨号。');return;}
   void this.env.request('heartbeat',{requestId:this.requestId}).catch(()=>this.finish('通话服务连接中断，麦克风已关闭。')).finally(()=>{pending=false;});
  },15000);
 }
 setMuted(muted:boolean){
  if(this.finished)return;
  this.stream?.getAudioTracks().forEach(track=>{track.enabled=this.state.phase==='active'&&!muted;});
  this.publish({muted});
 }
 private async cleanupRemote(){
  if(!this.requested)return;
  if(!this.stopping)this.stopping=this.env.request('stop',{requestId:this.requestId}).then(()=>{}).catch(error=>{
   // stop 可能先于 start 到达；晚到创建成功后会再次清理，服务端另有租约兜底。
   if(!this.allocated&&(error as {status?:number})?.status===404)return;
   this.publish({phase:'error',error:'麦克风已关闭，但服务端挂断尚未确认。请在 ChatGPT 核对通话状态。'});
  }).finally(()=>{this.stopping=undefined;});
  return this.stopping;
 }
 private async finish(error?:string){
  if(this.finished)return this.stopping;
  this.finished=true;clearInterval(this.heartbeat);clearTimeout(this.deadline);
  this.rejectReady?.(Error('通话已结束'));
  this.stream?.getTracks().forEach(track=>track.stop());this.stream=undefined;
  this.channel?.close();this.peer?.close();
  if(this.audio){this.audio.pause();this.audio.srcObject=null;}
  if(this.backgroundRequested){
   this.backgroundRequested=false;
   try{this.env.background?.stop(this.requestId);}catch{error??='麦克风已关闭，但后台通话服务停止未确认。';}
  }
  this.publish({phase:error?'error':'ended',error});
  await this.cleanupRemote();
 }
 stop(){return this.finish();}
}
