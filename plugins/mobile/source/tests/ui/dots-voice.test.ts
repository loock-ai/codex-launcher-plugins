import {afterEach,expect,it,vi} from 'vitest';
import {DotVoiceCall,type VoiceState} from '../../src/features/dots/voice';
import {createElement} from 'react';
import {act,cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import {VoiceCallButton} from '../../src/features/dots/VoiceCallButton';

const calls:DotVoiceCall[]=[];
afterEach(async()=>{cleanup();await Promise.allSettled(calls.splice(0).map(call=>call.stop()));vi.unstubAllGlobals();vi.useRealTimers();});
function fixture(options:{secure?:boolean;media?:Promise<MediaStream>;connect?:boolean;rejectPlay?:boolean}={}){
 const track={enabled:true,stop:vi.fn()},stream={getTracks:()=>[track],getAudioTracks:()=>[track]} as unknown as MediaStream;
 class Peer extends EventTarget {
  connectionState='new';localDescription:RTCSessionDescriptionInit|null=null;
  channel=Object.assign(new EventTarget(),{readyState:'connecting',close:vi.fn()});
  addTrack(){}createDataChannel(){return this.channel;}
  async createOffer(){return {type:'offer',sdp:'v=0\r\noffer'};}
  async setLocalDescription(value:RTCSessionDescriptionInit){this.localDescription=value;}
  async setRemoteDescription(){if(options.connect!==false){this.connectionState='connected';this.channel.readyState='open';this.dispatchEvent(new Event('connectionstatechange'));this.channel.dispatchEvent(new Event('open'));}}
  close(){this.connectionState='closed';}
 }
 const peer=new Peer(),requests:{action:string;body:unknown}[]=[],states:VoiceState[]=[];
 const audio={srcObject:null,autoplay:false,play:async()=>{if(options.rejectPlay)throw Error('play denied');},pause:vi.fn()} as unknown as HTMLAudioElement;
 const getUserMedia=vi.fn(async()=>options.media??stream);
 const call=new DotVoiceCall({secure:options.secure!==false,getUserMedia,createPeer:()=>peer as unknown as RTCPeerConnection,createAudio:()=>audio,request:async(action,body)=>{requests.push({action,body});return action==='start'?{answerSdp:'v=0\r\nanswer'}:{};}},state=>states.push(state));calls.push(call);
 return {call,track,peer,stream,audio,requests,states,getUserMedia};
}
it('WebRTC、数据通道和关联就绪后才接通，挂断关闭麦克风并请求服务端清理',async()=>{
 const f=fixture();await f.call.start('dot','request-1');
 expect(f.states.at(-1)?.phase).toBe('active');expect(f.track.enabled).toBe(true);
 f.call.setMuted(true);expect(f.track.enabled).toBe(false);
 await f.call.stop();expect(f.states.at(-1)?.phase).toBe('ended');expect(f.track.stop).toHaveBeenCalledOnce();expect(f.peer.connectionState).toBe('closed');
 expect(f.requests.map(r=>r.action)).toEqual(['start','attach','stop']);
 expect(f.requests[0].body).toEqual({dotId:'dot',requestId:'request-1',sdp:'v=0\r\noffer'});
});
it('不安全网页不访问麦克风，也不创建通话',async()=>{
 const f=fixture({secure:false});await f.call.start('dot','request-1');
 expect(f.states.at(-1)?.phase).toBe('error');expect(f.getUserMedia).not.toHaveBeenCalled();expect(f.requests).toHaveLength(0);
});
it('取消后才获得麦克风权限时，关闭晚到的音轨且不拨号',async()=>{
 let release!:(stream:MediaStream)=>void;const media=new Promise<MediaStream>(resolve=>{release=resolve;});
 const f=fixture({media});const start=f.call.start('dot','request-1');await f.call.stop();release(f.stream);await start;
 expect(f.track.stop).toHaveBeenCalledOnce();expect(f.requests).toHaveLength(0);expect(f.states.at(-1)?.phase).toBe('ended');
});
it('连接超时清理通话和麦克风，不显示已接通',async()=>{
 vi.useFakeTimers();const f=fixture({connect:false});const start=f.call.start('dot','request-1');
 await vi.advanceTimersByTimeAsync(21000);await start;
 expect(f.states.some(state=>state.phase==='active')).toBe(false);expect(f.states.at(-1)?.phase).toBe('error');expect(f.track.stop).toHaveBeenCalledOnce();expect(f.requests.at(-1)?.action).toBe('stop');
});
it('活动通话连接丢失时立即释放音轨',async()=>{
 const f=fixture();await f.call.start('dot','request-1');f.peer.connectionState='failed';f.peer.dispatchEvent(new Event('connectionstatechange'));
 await vi.waitFor(()=>expect(f.requests.at(-1)?.action).toBe('stop'));expect(f.track.stop).toHaveBeenCalledOnce();expect(f.states.at(-1)?.phase).toBe('error');
});
it('浏览器阻止播放时结束通话并提示错误',async()=>{
 const f=fixture({rejectPlay:true});await f.call.start('dot','request-1');
 const event=Object.assign(new Event('track'),{streams:[f.stream]});f.peer.dispatchEvent(event);
 await vi.waitFor(()=>expect(f.states.at(-1)?.phase).toBe('error'));expect(f.track.stop).toHaveBeenCalledOnce();expect(f.audio.srcObject).toBe(null);
});
it('上一通话晚到的挂断错误不能覆盖新通话，也不能丢失卸载清理',async()=>{
 const a=fixture(),b=fixture();let nextPeer=0,nextAudio=0;
 vi.stubGlobal('isSecureContext',true);
 vi.stubGlobal('RTCPeerConnection',class{constructor(){return [a.peer,b.peer][nextPeer++];}});
 vi.stubGlobal('Audio',class{constructor(){return [a.audio,b.audio][nextAudio++];}});
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia:vi.fn().mockResolvedValueOnce(a.stream).mockResolvedValueOnce(b.stream)}});
 let release!:(r:Response)=>void,stops=0;
 vi.stubGlobal('fetch',async(url:string)=>{
  const action=new URL(url).pathname.split('/').at(-1);
  if(action==='stop'&&++stops===1)return new Promise<Response>(resolve=>{release=resolve;});
  return new Response(JSON.stringify(action==='start'?{answerSdp:'v=0\r\nanswer'}:{}));
 });
 const ui=render(createElement(VoiceCallButton,{backend:{id:'one',name:'Mac',baseUrl:'http://localhost',token:'test',enabled:true,order:0},dotId:'dot'}));
 fireEvent.click(screen.getByRole('button',{name:'语音通话'}));await screen.findByRole('button',{name:'静音'});
 fireEvent.click(screen.getByRole('button',{name:'挂断'}));fireEvent.click(screen.getByRole('button',{name:'语音通话'}));await screen.findByRole('button',{name:'静音'});
 await act(async()=>{release(new Response(JSON.stringify({error:'late stop failure'}),{status:502}));});
 await waitFor(()=>expect(screen.getByRole('button',{name:'挂断'})).toBeVisible());
 ui.unmount();expect(b.track.stop).toHaveBeenCalledOnce();expect(b.peer.connectionState).toBe('closed');
});
