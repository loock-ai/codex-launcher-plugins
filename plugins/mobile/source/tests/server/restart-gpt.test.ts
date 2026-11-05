// @vitest-environment node
import {it,expect,vi} from 'vitest';
import {createControlGateway} from '../../server/cdp/control-gateway.js';
it('手机重启接口校验口令和POST并返回202回执',async()=>{
 const restart=vi.fn(async()=>({accepted:true}));
 const channel={connect:async()=>{},close:async()=>{},status:()=>({connected:true,capabilities:{}}),pendingApprovals:()=>[],subscribe:()=>()=>{},setUserQuestionTargets:()=>{},refreshUserQuestions:async()=>{}} as any;
 const gateway=await createControlGateway({channel,restartGpt:restart,host:'127.0.0.1',port:0,token:'fixture-token'});
 const base='http://127.0.0.1:'+gateway.port;
 try{
  expect((await fetch(base+'/api/desktop/restart',{method:'POST'})).status).toBe(401);
  expect((await fetch(base+'/api/desktop/restart?token=fixture-token')).status).toBe(405);
  expect(restart).not.toHaveBeenCalled();
  expect((await fetch(base+'/api/desktop/restart?token=fixture-token',{method:'POST'})).status).toBe(202);
  await vi.waitFor(()=>expect(restart).toHaveBeenCalledOnce());
 }finally{await gateway.close();}
});
