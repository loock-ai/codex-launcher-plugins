import type {IncomingMessage,ServerResponse} from 'node:http';

export function handleRestartGpt(req:IncomingMessage,res:ServerResponse,restart:(()=>Promise<unknown>)|undefined,onError?:(error:unknown)=>void){
 if(req.method!=='POST'){res.writeHead(405);res.end();return;}
 if(!restart){res.writeHead(501,{'content-type':'application/json'});res.end(JSON.stringify({error:'当前启动器不支持重启GPT，请先更新'}));return;}
 res.once('finish',()=>{void Promise.resolve().then(restart).catch(error=>onError?.(error));});
 res.writeHead(202,{'content-type':'application/json','cache-control':'no-store'});
 res.end(JSON.stringify({accepted:true}));
}
