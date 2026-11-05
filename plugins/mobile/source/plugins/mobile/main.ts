import {randomBytes} from 'node:crypto';
import {networkInterfaces,hostname} from 'node:os';
import {join} from 'node:path';
import QRCode from 'qrcode';
import {createGateway} from '../../server/gateway.js';
import {createControlGateway} from '../../server/cdp/control-gateway.js';
import {ControlError,type DesktopControlChannel,type ControlEvent} from '../../server/cdp/control-channel.js';
import {DotsAdapter} from '../../server/dots/adapter.js';
import {DotsError} from '../../server/dots/types.js';
import {startManagedAppServer} from '../../server/app-server-manager.js';

interface Config {mode:'cdp'|'native'|'managed'|'external'|'remote-control';remoteControlEnvironmentId?:string;gatewayPort:number;appServerPort:number;host:'127.0.0.1'|'0.0.0.0';token:string;upstreamUrl:string}
interface Context {pluginDir:string;dataDir:string;signal:AbortSignal;config:{read(defaults:Config):Promise<Config>;write(config:Config):Promise<unknown>};actions:{register(name:string,handler:(params:any)=>unknown):void};host:{call(method:string,params?:any):Promise<any>;subscribe(listener:(event:any)=>void):()=>void};status:{publish(status:any):void};onDispose(fn:()=>unknown):void;log(message:string):void}
const defaults=():Config=>({mode:'cdp',gatewayPort:19877,appServerPort:19876,host:'0.0.0.0',token:randomBytes(24).toString('hex'),upstreamUrl:'ws://127.0.0.1:18765'});
function validate(c:Config):Config {
 const mode=c.mode==='remote-control'?'native':c.mode;
 if(c.mode==='remote-control'&&c.remoteControlEnvironmentId&&c.remoteControlEnvironmentId!=='local')throw new Error('旧云端设备配置不能自动改成本机原生连接');
 if(!['cdp','native','managed','external'].includes(mode))throw new Error('连接模式无效');
 if(!Number.isInteger(c.gatewayPort)||c.gatewayPort<1||c.gatewayPort>65535)throw new Error('Web端口必须是1到65535的整数');
 if(mode==='managed'&&(!Number.isInteger(c.appServerPort)||c.appServerPort<1||c.appServerPort>65535||c.appServerPort===c.gatewayPort))throw new Error('托管服务内部端口无效或与Web端口重复');
 if(!['127.0.0.1','0.0.0.0'].includes(c.host))throw new Error('监听地址无效');
 if(typeof c.token!=='string'||c.token.length<16||c.token.length>256)throw new Error('访问口令需要16到256个字符');
 if(mode==='external'){
  const url=new URL(c.upstreamUrl);
  if(!['ws:','wss:'].includes(url.protocol)||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)||url.username||url.password||url.hash)throw new Error('上游必须是本机WebSocket地址');
 }
 return {mode,gatewayPort:c.gatewayPort,appServerPort:c.appServerPort,host:c.host,token:c.token,upstreamUrl:c.upstreamUrl};
}
async function controlProxy(ctx:Context,leaseId:string){
 let status=await ctx.host.call('desktop.control.status',{leaseId}),pending:ControlEvent[]=await ctx.host.call('desktop.control.pendingApprovals',{leaseId}),closed=false;
 const listeners=new Set<(event:ControlEvent)=>void>();
 const call=async(method:string,params:any={})=>{try{return await ctx.host.call('desktop.control.'+method,{leaseId,...params});}catch(error:any){throw new ControlError(error.code??'DESKTOP_UNAVAILABLE',error.message);}};
 const unsubscribe=ctx.host.subscribe(message=>{if(message.type!=='desktop.event'||message.leaseId!==leaseId)return;const event=message.event as ControlEvent;
 if(event.method==='desktop/disconnected')status={...status,connected:false};
 if(event.id!==undefined){pending=pending.filter(p=>p.id!==event.id);pending.push(event);}if(event.method==='desktop/approval/resolved')pending=pending.filter(p=>p.id!==event.params?.id);
 for(const fn of listeners)fn(event);
 });
 return {connect:async()=>{},status:()=>status,pendingApprovals:()=>pending,hosts:()=>call('hosts'),request:(hostId:string,method:string,params:any,timeoutMs?:number)=>call('request',{hostId,method,params,timeoutMs}),respond:async(approvalId:string|number,result:unknown)=>{const value=await call('respond',{approvalId,result});pending=pending.filter(p=>p.id!==approvalId);return value;},subscribe:(fn:(event:ControlEvent)=>void)=>{listeners.add(fn);return()=>listeners.delete(fn);},setUserQuestionTargets:(targets:unknown)=>{void call('setUserQuestionTargets',{targets}).catch(e=>ctx.log(e.message));},refreshUserQuestions:async(targets:unknown)=>{await call('refreshUserQuestions',{targets});pending=await call('pendingApprovals');status=await call('status');},close:async()=>{if(closed)return;closed=true;unsubscribe();listeners.clear();await ctx.host.call('desktop.release',{leaseId});}} as unknown as DesktopControlChannel;
}
export async function activate(ctx:Context){
 let config=validate(await ctx.config.read(defaults()));
 await ctx.config.write(config);
 let state='stopped',error='',clients=0,approvals=0,port=config.gatewayPort;
 let service:{close():Promise<void>;port:number}|undefined,managed:Awaited<ReturnType<typeof startManagedAppServer>>|undefined,channel:DesktopControlChannel|undefined;
 const logs:string[]=[];
 const log=(message:string)=>{logs.push(`${new Date().toISOString()} ${message}`);if(logs.length>200)logs.shift();ctx.log(message);};
 const getStatus=()=>({state,mode:config.mode,clients,approvals,error,port,canApplyConfig:true});
 const publish=()=>ctx.status.publish(getStatus());
 const safeConfig=()=>({...config,token:'',hasToken:!!config.token});
 let queue:Promise<unknown>=Promise.resolve();
 const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const task=queue.then(fn,fn);queue=task.catch(()=>{});return task;};
 const close=async()=>{const s=service,m=managed,c=channel;service=undefined;managed=undefined;channel=undefined;try{await s?.close();}finally{try{await c?.close();}finally{await m?.close();}}clients=0;approvals=0;};
 const stopService=async()=>{state='stopping';publish();try{await close();state='stopped';error='';log('Mobile 已停止');}catch(e:any){state='error';error=e.message;throw e;}finally{publish();}};
 const stop=()=>serial(stopService);
 const startService=async()=>{
 if(service&&state!=='waiting')return getStatus();
 if(service)await close();if(ctx.signal.aborted)throw new Error('插件已卸载');state='starting';error='';publish();
 try{
  const nativeLocal=config.mode==='native';
  if(config.mode==='cdp'||nativeLocal){
   const {leaseId}=await ctx.host.call(nativeLocal?'desktop.native.acquire':'desktop.acquire');
   try{channel=await controlProxy(ctx,leaseId);}catch(e){await ctx.host.call('desktop.release',{leaseId});throw e;}
   const dots=new DotsAdapter({status:()=>ctx.host.call('desktop.dots.status',{leaseId}),request:async(request)=>{try{return await ctx.host.call('desktop.dots.request',{leaseId,request});}catch(e:any){throw new DotsError(e.code??'DOTS_UNAVAILABLE',e.message);}},close:async()=>{}});
   service=await createControlGateway({channel,dots,host:config.host,port:config.gatewayPort,token:config.token,staticDir:join(ctx.pluginDir,'web'),onStatus:s=>{clients=s.clients;approvals=s.approvals;error=s.error;if(!s.connected&&s.error)state='waiting';publish();}});
  }else{
   const upstream=config.mode==='managed'?`ws://127.0.0.1:${config.appServerPort}`:config.upstreamUrl;
   if(config.mode==='managed'){const details=await ctx.host.call('desktop.details');managed=await startManagedAppServer(config.appServerPort,details.cliPath);const child=managed;void child.exited.then(code=>{if(managed===child){void serial(async()=>{if(managed!==child)return;await close();state='error';error=`app-server 意外退出：${code}`;publish();});}});}
   service=await createGateway({host:config.host,port:config.gatewayPort,mode:config.mode as 'managed'|'external',upstreamUrl:upstream,staticDir:join(ctx.pluginDir,'web'),accessToken:config.token,uploadDir:join(ctx.dataDir,'uploads'),hostId:hostname(),displayName:'Codex Mobile',onClientCount:count=>{clients=count;publish();},appServerReady:async()=>{try{const url=new URL(upstream);url.protocol=url.protocol==='wss:'?'https:':'http:';url.pathname='/readyz';return (await fetch(url,{signal:AbortSignal.timeout(2000)})).ok;}catch{return false;}}});
  }
  port=service.port;state='running';log(`Mobile 已启动（${config.mode}，端口 ${port}）`);publish();return getStatus();
 }catch(e:any){await close().catch(()=>{});state='error';error=e.message;log(error);publish();throw e;}
 };
 const start=()=>serial(startService);
 const urls=()=>{const address=config.host==='127.0.0.1'?'127.0.0.1':Object.values(networkInterfaces()).flatMap(n=>n??[]).filter(n=>n.family==='IPv4'&&!n.internal).sort((a,b)=>Number(!a.address.startsWith('192.168.'))-Number(!b.address.startsWith('192.168.')))[0]?.address??'127.0.0.1';const suffix=`:${port}/?token=${encodeURIComponent(config.token)}`;return {accessUrl:`http://${address}${suffix}`,localUrl:`http://127.0.0.1${suffix}`};};
 const register=ctx.actions.register.bind(ctx.actions);
 register('status.get',getStatus);register('logs.read',()=>[...logs]);register('config.read',safeConfig);
 register('config.save',input=>serial(async()=>{if(service||state==='starting')throw new Error('请先停止 Mobile，再修改配置');if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('配置格式无效');const next=validate({...config,...input,token:input.token||config.token});await ctx.config.write(next);config=next;port=config.gatewayPort;publish();return safeConfig();}));
 register('config.apply',input=>serial(async()=>{
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('配置格式无效');
  const previous=config,next=validate({...config,...input,token:input.token||config.token});
  if(JSON.stringify(previous)===JSON.stringify(next))return safeConfig();
  if(next.mode==='native'){
   const details=await ctx.host.call('desktop.details');
   if(!details.nativeControlApi)throw new Error('请先更新启动器后台，以启用本机原生API');
  }
  const wasRunning=!!service||state==='running'||state==='waiting';
  try{await ctx.config.write(next);}catch(saveError:any){throw new Error('设置未保存，当前连接继续运行：'+saveError.message);}
  try{
   if(wasRunning)await stopService();
   config=next;port=config.gatewayPort;
   if(wasRunning)await startService();
  }catch(changeError:any){
   try{
    await close();config=previous;port=previous.gatewayPort;await ctx.config.write(previous);
    if(wasRunning)await startService();
   }catch(restoreError:any){
    state='error';error='切换失败且原连接恢复失败：'+restoreError.message;publish();throw new Error(error);
   }
   throw new Error('切换未成功，原连接已恢复：'+changeError.message);
  }
  publish();return safeConfig();
 }));
 register('connection.read',async()=>{const u=urls();return {...u,qrDataUrl:await QRCode.toDataURL(u.accessUrl,{width:240,margin:2}),desktop:await ctx.host.call('desktop.details')};});
 register('open-web',async()=>{await start();await ctx.host.call('system.openExternal',{url:urls().localUrl});return {opened:true};});
 register('copy-url',async()=>{await ctx.host.call('clipboard.writeText',{text:urls().accessUrl});return {copied:true};});
 register('approvals.list',()=>channel?.pendingApprovals()??[]);
 register('approvals.respond',async input=>{if(!channel)throw new Error('Desktop 控制通道未启动');await channel.respond(input.approvalId,input.result);return {submitted:true};});
 ctx.onDispose(stop);publish();return {start,stop,getStatus,deactivate:stop};
}
