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
