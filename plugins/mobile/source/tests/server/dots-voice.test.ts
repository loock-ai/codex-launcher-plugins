// @vitest-environment node
import {afterEach,expect,it,vi} from 'vitest';
import {DotsVoice} from '../../server/dots/voice.js';
import {DotsError,type DesktopHttpRequest,type DesktopHttpTransport} from '../../server/dots/types.js';
import {createServer} from 'node:http';
import {createDotsHttp} from '../../server/dots/http.js';
import type {DotsAdapter} from '../../server/dots/adapter.js';
import {createControlGateway} from '../../server/cdp/control-gateway.js';
import type {DesktopControlChannel} from '../../server/cdp/control-channel.js';

const services:DotsVoice[]=[];
afterEach(async()=>{await Promise.allSettled(services.splice(0).map(service=>service.close()));vi.useRealTimers();});
function fixture(reply?:(request:DesktopHttpRequest)=>Promise<{status:number;body:unknown;headers?:Record<string,string>}>){
 const requests:DesktopHttpRequest[]=[];
 let identity='account-1';
 const transport:DesktopHttpTransport={status:async()=>({available:true,voiceSignaling:true,identityKey:identity}),close:async()=>{},request:async request=>{requests.push(request);return reply?reply(request):{status:201,body:'v=0\r\nanswer',headers:{location:'/tbo/dot/voice/calls/rtc_test','openai-root-thread-id':'thread'}};}};
 const voice=new DotsVoice(transport,async id=>({id,name:'Dot',roomId:'room',threadId:'thread'}));services.push(voice);
 return {voice,requests,changeAccount:()=>{identity='account-2';}};
}
const input={requestId:'request-1',dotId:'dot',sdp:'v=0\r\noffer'};
it('复用相同创建请求，只关联并挂断该请求绑定的原生通话',async()=>{
 const {voice,requests}=fixture();
 expect(await voice.start(input)).toEqual({requestId:'request-1',answerSdp:'v=0\r\nanswer'});
 await voice.start(input);
 await expect(voice.start({...input,sdp:'v=0\r\nother'})).rejects.toMatchObject({code:'DOTS_INVALID_INPUT'});
 await voice.attach('request-1');await voice.stop('request-1');
 expect(requests.map(r=>r.path)).toEqual(['/tbo/dot/voice/calls','/tbo/dot/voice/calls/rtc_test/attach','/tbo/dot/voice/calls/rtc_test/stop']);
 await expect(voice.attach('not-owned')).rejects.toMatchObject({code:'DOTS_VOICE_NOT_FOUND'});
});
it('创建未返回时取消，晚到的通话会被补偿挂断',async()=>{
 let release!:(value:{status:number;body:unknown;headers?:Record<string,string>})=>void;
 const waiting=new Promise<{status:number;body:unknown;headers?:Record<string,string>}>(resolve=>{release=resolve;});
 const {voice,requests}=fixture(async r=>r.path.endsWith('/calls')?waiting:{status:204,body:''});
 const started=voice.start(input);const rejected=expect(started).rejects.toMatchObject({code:'DOTS_VOICE_CANCELLED'});
 await vi.waitFor(()=>expect(requests).toHaveLength(1));
 const stopped=voice.stop('request-1');
 release({status:201,body:'v=0\r\nanswer',headers:{location:'/tbo/dot/voice/calls/rtc_test'}});
 await rejected;await stopped;
 expect(requests.map(r=>r.path)).toEqual(['/tbo/dot/voice/calls','/tbo/dot/voice/calls/rtc_test/stop']);
});
it('创建结果未知时禁止新通话，也不自动重发创建请求',async()=>{
 const {voice,requests}=fixture(async()=>{throw Error('network timeout');});
 await expect(voice.start(input)).rejects.toMatchObject({code:'DOTS_VOICE_UNKNOWN'});
 await expect(voice.start({...input,requestId:'request-2'})).rejects.toMatchObject({code:'DOTS_VOICE_BUSY'});
 await expect(voice.start(input)).rejects.toMatchObject({code:'DOTS_VOICE_UNKNOWN'});
 expect(requests).toHaveLength(1);
});
it('明确拒绝后允许新请求，账户变化时不关联旧通话',async()=>{
 let rejected=true;
 const {voice,requests,changeAccount}=fixture(async()=>rejected?{status:409,body:''}:{status:201,body:'v=0\r\nanswer',headers:{location:'/tbo/dot/voice/calls/rtc_test'}});
 await expect(voice.start(input)).rejects.toMatchObject({code:'DOTS_VOICE_REJECTED'});
 rejected=false;await voice.start({...input,requestId:'request-2'});changeAccount();
 await expect(voice.attach('request-2')).rejects.toMatchObject({code:'DOTS_ACCOUNT_CHANGED'});
 expect(requests).toHaveLength(2);
});
it('旧请求重放必须校验账户，已挂断或服务关闭后不能返回旧应答',async()=>{
 const a=fixture();await a.voice.start(input);a.changeAccount();
 await expect(a.voice.start(input)).rejects.toMatchObject({code:'DOTS_ACCOUNT_CHANGED'});
 const b=fixture();await b.voice.start(input);await b.voice.stop(input.requestId);
 await expect(b.voice.start(input)).rejects.toMatchObject({code:'DOTS_VOICE_CANCELLED'});
 const c=fixture();await c.voice.start(input);await c.voice.close();
 await expect(c.voice.start(input)).rejects.toMatchObject({code:'DOTS_VOICE_CANCELLED'});
});
it('无心跳时到期挂断，有心跳时续租',async()=>{
 vi.useFakeTimers();const {voice,requests}=fixture();await voice.start(input);
 await vi.advanceTimersByTimeAsync(40000);await voice.heartbeat('request-1');
 await vi.advanceTimersByTimeAsync(40000);expect(requests).toHaveLength(1);
 await vi.advanceTimersByTimeAsync(25000);expect(requests.at(-1)?.path).toBe('/tbo/dot/voice/calls/rtc_test/stop');
});
it('SDP 损坏但已知通话ID时清理，挂断失败保留阻塞状态',async()=>{
 const {voice,requests}=fixture(async r=>r.path.endsWith('/calls')?{status:201,body:'invalid',headers:{location:'/tbo/dot/voice/calls/rtc_test'}}:{status:503,body:''});
 await expect(voice.start(input)).rejects.toBeInstanceOf(DotsError);
 await expect(voice.start({...input,requestId:'request-2'})).rejects.toMatchObject({code:'DOTS_VOICE_BUSY'});
 expect(requests.at(-1)?.path).toBe('/tbo/dot/voice/calls/rtc_test/stop');
});
it('HTTP 提供通话接口，仅接受本次请求ID，不接收任意原生callId',async()=>{
 const {voice}=fixture(),handler=createDotsHttp({voice} as DotsAdapter);
 const server=createServer((req,res)=>void handler(req,res,new URL(req.url!,'http://localhost')));
 await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${(server.address() as {port:number}).port}`;
 const post=(path:string,body:unknown)=>fetch(base+'/api/dots/voice/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
 try{
  const started=await post('start',input);expect(started.status).toBe(200);expect(await started.json()).toMatchObject({answerSdp:'v=0\r\nanswer'});
  expect((await post('attach',{requestId:'request-1',callId:'rtc_someone_else'})).status).toBe(400);
  expect((await post('heartbeat',{requestId:'request-1'})).status).toBe(200);
  expect((await post('stop',{requestId:'request-1'})).status).toBe(200);
  expect((await fetch(base+'/api/dots/voice/start')).status).toBe(405);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
it('关闭网关先清理通话，清理失败也释放桌面租约',async()=>{
 const order:string[]=[];
 const channel={connect:async()=>{},close:async()=>{order.push('release');},setUserQuestionTargets:()=>{},refreshUserQuestions:async()=>{},subscribe:()=>()=>{},pendingApprovals:()=>[],status:()=>({connected:true})} as unknown as DesktopControlChannel;
 const dots={close:async()=>{order.push('stop');throw Error('stop failed');}} as unknown as DotsAdapter;
 const gateway=await createControlGateway({channel,dots,host:'127.0.0.1',port:0,token:'test-token'});
 await expect(gateway.close()).rejects.toThrow('stop failed');expect(order).toEqual(['stop','release']);
});
