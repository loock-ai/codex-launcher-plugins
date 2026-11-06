import {it,expect,vi} from 'vitest';
import {requestRestartGpt} from '../../src/backends/restart-gpt';
const local={id:'local',name:'本机',baseUrl:'http://127.0.0.1:19877',token:'fixture',enabled:true,order:0};
it('重启只发送一次带口令的POST，不把执行主机ID带到网关操作中',async()=>{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({capabilities:{restartGpt:true}}))).mockResolvedValueOnce(new Response('{}',{status:202}));
 await requestRestartGpt({...local,desktopHostId:'ssh:mini'},fetcher as any);
 expect(fetcher).toHaveBeenCalledTimes(2);
 const url=new URL(String(fetcher.mock.calls[1][0]));
 expect(url.pathname).toBe('/api/desktop/restart');expect(url.searchParams.get('token')).toBe('fixture');expect(url.searchParams.has('hostId')).toBe(false);
 expect(fetcher.mock.calls[1][1].method).toBe('POST');
});
it('不支持能力的旧设备不发送重启请求',async()=>{
 const fetcher=vi.fn().mockResolvedValue(new Response('{}'));
 await expect(requestRestartGpt(local,fetcher as any)).rejects.toThrow('更新');
 expect(fetcher).toHaveBeenCalledOnce();
});
it('重启已接受但旧桌面仍在线时继续loading，新的桌面就绪才完成',async()=>{
 const {restartGptAndWait}=await import('../../src/backends/restart-gpt');
 vi.useFakeTimers();
 try{
 const fetcher=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({backend:'desktop-control',appServerReady:true,desktopRestartGeneration:0,capabilities:{restartGpt:true}}))).mockResolvedValueOnce(new Response('{}',{status:202})).mockResolvedValueOnce(new Response(JSON.stringify({appServerReady:true,desktopRestartGeneration:0}))).mockResolvedValueOnce(new Response(JSON.stringify({appServerReady:false,desktopRestartGeneration:1}))).mockResolvedValueOnce(new Response(JSON.stringify({appServerReady:true,desktopRestartGeneration:1})));
 let done=false;const work=restartGptAndWait(local,fetcher as any).then(()=>{done=true;});
 await vi.advanceTimersByTimeAsync(0);expect(done).toBe(false);
 await vi.advanceTimersByTimeAsync(750);expect(done).toBe(false);
 await vi.advanceTimersByTimeAsync(750);await work;expect(done).toBe(true);
 expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 }finally{vi.useRealTimers();}
});
it('桌面未恢复时90秒内结束等待并提示未确认，不重复发送POST',async()=>{
 const {restartGptAndWait}=await import('../../src/backends/restart-gpt');vi.useFakeTimers();
 try{
 const fetcher=vi.fn(async(_url:any,options:any)=>new Response(JSON.stringify(options?.method==='POST'?{}:{backend:'desktop-control',appServerReady:true,desktopRestartGeneration:0,capabilities:{restartGpt:true}}),{status:options?.method==='POST'?202:200}));
 const result=expect(restartGptAndWait(local,fetcher as any)).rejects.toThrow('重连尚未确认');
 await vi.advanceTimersByTimeAsync(90001);await result;expect(fetcher.mock.calls.filter(c=>c[1]?.method==='POST')).toHaveLength(1);
 }finally{vi.useRealTimers();}
});
