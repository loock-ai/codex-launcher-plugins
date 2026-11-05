import * as managedServer from '../../server/app-server-manager.js';
import {afterEach,expect,it,vi} from 'vitest';
import {createServer} from 'node:net';
import {mkdtemp,mkdir,writeFile,rm,chmod} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {activate} from '../../plugins/mobile/main.js';
const cleanup:Array<()=>Promise<unknown>>=[];
afterEach(async()=>{vi.unstubAllEnvs();for(const fn of cleanup.splice(0).reverse())await fn();});
async function setup(mode='external'){
 const dir=await mkdtemp(join(tmpdir(),'mobile-plugin-'));cleanup.push(()=>rm(dir,{recursive:true,force:true}));await mkdir(join(dir,'web'));await writeFile(join(dir,'web/index.html'),'独立插件网页');
 const port=await new Promise<number>(resolve=>{const s=createServer();s.listen(0,'127.0.0.1',()=>{const p=(s.address() as any).port;s.close(()=>resolve(p));});});
 let config:any={mode,gatewayPort:port,appServerPort:port+1,host:'127.0.0.1',token:'a'.repeat(24),upstreamUrl:'ws://127.0.0.1:18765'};
 const actions=new Map<string,Function>(),calls:any[]=[];let listener=(event:any)=>{};
 const ctx:any={pluginDir:dir,dataDir:dir,signal:new AbortController().signal,config:{read:async()=>config,write:async(v:any)=>{config=v;}},actions:{register:(n:string,h:Function)=>actions.set(n,h)},status:{publish:()=>{}},onDispose:()=>{},log:()=>{},host:{subscribe:(fn:any)=>{listener=fn;return()=>{}},call:async(method:string,p:any)=>{calls.push([method,p]);if(method==='desktop.details')return {appPath:'/Applications/ChatGPT.app',cdpPort:9333,cliPath:'/unused',nativeControlApi:true};if(method==='desktop.acquire'||method==='desktop.native.acquire')return {leaseId:'mobile-lease'};if(method==='desktop.control.status')return {connected:true,capabilities:{}};if(method==='desktop.control.pendingApprovals')return [];if(method==='desktop.control.hosts')return [{hostId:'local'}];return {};}}};
 vi.stubEnv('CODEX_HOME',join(dir,'desktop-auth-fixture'));
 const runtime=await activate(ctx);cleanup.push(()=>runtime.deactivate());return {runtime,actions,calls,port,ctx,dir,emit:(event:any)=>listener(event)};
}
it('插件自己提供静态网页、鉴权和停止端口，同时配置隐藏口令',async()=>{
 const {runtime,actions,port}=await setup();expect((await actions.get('config.read')!()).token).toBe('');await runtime.start();
 expect(await (await fetch(`http://127.0.0.1:${port}/`)).text()).toBe('独立插件网页');expect((await fetch(`http://127.0.0.1:${port}/api/status`)).status).toBe(401);
 expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).status).toBe(200);
 await expect(actions.get('config.save')!({gatewayPort:12345})).rejects.toThrow('停止');await runtime.stop();await expect(fetch(`http://127.0.0.1:${port}/`)).rejects.toThrow();
 await actions.get('config.save')!({token:''});expect((await actions.get('config.read')!()).hasToken).toBe(true);
});
it('CDP模式使用宿主租约并只释放自身，不关闭共享桌面',async()=>{const {runtime,calls,port}=await setup('cdp');await runtime.start();expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).status).toBe(200);await runtime.stop();expect(calls.filter(c=>c[0]==='desktop.release')).toEqual([['desktop.release',{leaseId:'mobile-lease'}]]);});
it('CDP WebSocket通过共享通道初始化与RPC，HTTP Dots走宿主代理',async()=>{
 const {runtime,port,calls}=await setup('cdp');await runtime.start();
 const {default:WebSocket}=await import('ws');const socket=new WebSocket(`ws://127.0.0.1:${port}/ws?token=${'a'.repeat(24)}`);cleanup.push(async()=>{socket.terminate();});await new Promise<void>((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
 const request=(value:any)=>new Promise<any>(resolve=>{socket.once('message',raw=>resolve(JSON.parse(String(raw))));socket.send(JSON.stringify(value));});
 expect((await request({id:1,method:'initialize'})).result.backend).toBe('desktop-control');await request({id:2,method:'thread/list',params:{limit:1}});expect(calls.find(c=>c[0]==='desktop.control.request')?.[1]).toMatchObject({leaseId:'mobile-lease',hostId:'local',method:'thread/list',params:{limit:1}});
 await fetch(`http://127.0.0.1:${port}/api/dots/status?token=${'a'.repeat(24)}`);expect(calls.some(c=>c[0]==='desktop.dots.status')).toBe(true);
});
it('监听失败后释放Mobile租约，外部占用端口不受影响',async()=>{const {runtime,port,calls}=await setup('cdp');const occupied=createServer();await new Promise<void>(resolve=>occupied.listen(port,'127.0.0.1',resolve));cleanup.push(()=>new Promise<void>(resolve=>occupied.close(()=>resolve())));await expect(runtime.start()).rejects.toThrow();expect(runtime.getStatus().state).toBe('error');expect(calls.filter(c=>c[0]==='desktop.release')).toHaveLength(1);expect(occupied.listening).toBe(true);});
it('首次激活即持久化生成口令，重启不会悄悄改变设备链接',async()=>{
 let saved:any;const writes:any[]=[];const ctx:any={config:{read:async(defaults:any)=>({...defaults,...saved}),write:async(value:any)=>{saved=value;writes.push(value);}},actions:{register:()=>{}},status:{publish:()=>{}},onDispose:()=>{},log:()=>{},host:{},signal:new AbortController().signal};
 const first=await activate(ctx);expect(writes.length).toBeGreaterThan(0);const token=saved.token;await first.deactivate();const second=await activate(ctx);expect(saved.token).toBe(token);await second.deactivate();
});
it('managed模式启动插件拥有的子进程并在停止时回收',async()=>{
 const {runtime,ctx,dir,port,actions}=await setup('managed');const cli=join(dir,'codex-fixture.cjs');
 await writeFile(cli,`#!${process.execPath}\nconst http=require('node:http');const url=new URL(process.argv[process.argv.indexOf('--listen')+1]);http.createServer((req,res)=>res.end('ready')).listen(Number(url.port),'127.0.0.1');`);await chmod(cli,0o700);
 const original=ctx.host.call;ctx.host.call=(method:string,params:any)=>method==='desktop.details'?Promise.resolve({cliPath:cli}):original(method,params);
 const config=await actions.get('config.read')!();await runtime.start();expect((await fetch(`http://127.0.0.1:${config.appServerPort}/readyz`)).ok).toBe(true);expect((await fetch(`http://127.0.0.1:${port}/api/host?token=${'a'.repeat(24)}`)).ok).toBe(true);await runtime.stop();await expect(fetch(`http://127.0.0.1:${config.appServerPort}/readyz`)).rejects.toThrow();
});

it('断线进入等待后重试重新申请桌面租约并重建HTTP服务',async()=>{const {runtime,calls,emit,port}=await setup('cdp');await runtime.start();emit({type:'desktop.event',leaseId:'mobile-lease',event:{method:'desktop/disconnected',params:{reason:'断线'}}});expect(runtime.getStatus().state).toBe('waiting');await runtime.start();expect(calls.filter(c=>c[0]==='desktop.acquire')).toHaveLength(2);expect(runtime.getStatus().state).toBe('running');expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);});
it('本机原生模式直接取得桌面现有API租约，项目和会话沿用前端协议且不要求云端授权',async()=>{
 const {runtime,actions,calls,port}=await setup('native');
 await runtime.start();
 expect(calls.some(c=>c[0]==='desktop.native.acquire')).toBe(true);
 expect(calls.some(c=>c[0]==='desktop.acquire')).toBe(false);
 expect((await actions.get('config.read')!()).mode).toBe('native');
 expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);
 expect(runtime.getStatus()).toMatchObject({state:'running',mode:'native'});
});

it('切换原生后端沿用同一Web端口和口令，只更新实际连接模式',async()=>{
 const {runtime,actions,port}=await setup('cdp');await runtime.start();
 const before=await actions.get('connection.read')!();
 await actions.get('config.apply')!({mode:'native',token:''});
 const after=await actions.get('connection.read')!();
 expect(after.localUrl).toBe(before.localUrl);expect(after.qrDataUrl).toBe(before.qrDataUrl);
 expect(runtime.getStatus()).toMatchObject({state:'running',mode:'native',port});
 expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);
});
it('新连接失败时回滚原模式和服务，不留下半套配置',async()=>{
 const {runtime,actions,ctx,port}=await setup('cdp');await runtime.start();
 const hostCall=ctx.host.call;ctx.host.call=async(method:string,p:any)=>{if(method==='desktop.native.acquire')throw Error('native fixture refused');return hostCall(method,p);};
 await expect(actions.get('config.apply')!({mode:'native'})).rejects.toThrow('原连接已恢复');
 expect((await actions.get('config.read')!()).mode).toBe('cdp');
 expect(runtime.getStatus()).toMatchObject({state:'running',mode:'cdp',port});
 expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);
});
it('模式只校验自身使用的后端字段，兼容旧本机模式名称',async()=>{
 const {runtime,actions}=await setup('cdp');
 await actions.get('config.save')!({mode:'native',upstreamUrl:'unused',appServerPort:0});
 expect((await actions.get('config.read')!()).mode).toBe('native');
 await actions.get('config.save')!({mode:'remote-control',remoteControlEnvironmentId:'local'});
 expect((await actions.get('config.read')!()).mode).toBe('native');
 await runtime.stop();
});

it('配置落盘失败在关闭原服务前返回错误',async()=>{
 const {runtime,actions,ctx,calls,port}=await setup('cdp');await runtime.start();
 ctx.config.write=async()=>{throw Error('disk fixture');};
 await expect(actions.get('config.apply')!({mode:'native'})).rejects.toThrow('当前连接继续运行');
 expect(calls.some(c=>c[0]==='desktop.release')).toBe(false);
 expect(runtime.getStatus()).toMatchObject({state:'running',mode:'cdp'});
 expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);
});

it('旧托管进程在切换期间退出，迟到的故障回调不会关闭新后端',async()=>{
 let exit!:(code:number)=>void;
 const exited=new Promise<number>(resolve=>{exit=resolve;});
 const mock=vi.spyOn(managedServer,'startManagedAppServer').mockResolvedValue({exited,close:async()=>{}} as any);
 try{
  const {runtime,actions,ctx,port}=await setup('managed');await runtime.start();
  const write=ctx.config.write;
  ctx.config.write=async(value:any)=>{if(value.mode==='native'){exit(1);await Promise.resolve();}await write(value);};
  await actions.get('config.apply')!({mode:'native'});
  await new Promise(resolve=>setTimeout(resolve,25));
  expect(runtime.getStatus()).toMatchObject({state:'running',mode:'native'});
  expect((await fetch(`http://127.0.0.1:${port}/api/status?token=${'a'.repeat(24)}`)).ok).toBe(true);
 }finally{mock.mockRestore();}
});
