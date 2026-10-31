import {t} from '../i18n';

export const VOICE_BACKGROUND_EVENT='codex-mobile-voice-background';
export interface VoiceBackgroundLease {
 start(sessionId:string,onEnded:(message?:string)=>void):Promise<void>;
 pulse(sessionId:string):void;
 stop(sessionId:string):void;
}
interface AndroidVoiceBackgroundBridge {
 voiceBackgroundStart(sessionId:string):void;
 voiceBackgroundStop(sessionId:string):void;
 voiceBackgroundPulse(sessionId:string):boolean|void;
}
interface Session {
 id:string;ready:boolean;onEnded:(message?:string)=>void;
 resolve:()=>void;reject:(error:Error)=>void;timer:ReturnType<typeof setTimeout>;
}
function failureMessage(reason?:string){
 switch(reason){
  case 'permission':return t('请先允许麦克风权限，再发起通话。');
  case 'not_foreground':return t('请回到 App 发起语音通话，再切到后台。');
  case 'untrusted':return t('请从 App 内的对话页发起语音通话。');
  case 'busy':return t('已有后台通话，请先挂断。');
  case 'timeout':return t('后台通话保活已中断，请回到 App 重新拨号。');
  case 'destroyed':return t('后台通话服务已结束，请重新拨号。');
  default:return t('无法启动后台通话服务，请返回 App 后重试。');
 }
}
/** 只持有会话id，不向原生层传递网关地址和访问口令。 */
export class NativeVoiceBackground implements VoiceBackgroundLease {
 private current?:Session;
 constructor(private bridge:AndroidVoiceBackgroundBridge,private events:EventTarget){}
 private handle=(event:Event)=>{
  const detail=(event as CustomEvent).detail,session=this.current;
  if(!session||!detail||detail.sessionId!==session.id)return;
  if(detail.type==='started'){
   session.ready=true;clearTimeout(session.timer);session.resolve();return;
  }
  if(detail.type!=='stopped'&&detail.type!=='error')return;
  this.detach(session);
  if(detail.type==='error')try{this.bridge.voiceBackgroundStop(session.id);}catch{/* Native watchdog 最终释放资源。 */}
  const message=detail.type==='error'||['timeout','destroyed'].includes(detail.reason)?failureMessage(detail.reason):undefined;
  if(session.ready)session.onEnded(message);
  else session.reject(Error(message??t('后台通话已取消')));
 };
 start(id:string,onEnded:(message?:string)=>void){
  if(this.current)return Promise.reject(Error(t('已有后台通话，请先挂断。')));
  return new Promise<void>((resolve,reject)=>{
   const session={id,ready:false,onEnded,resolve,reject} as Session;
   this.current=session;this.events.addEventListener(VOICE_BACKGROUND_EVENT,this.handle);
   session.timer=setTimeout(()=>{
    if(this.current!==session)return;
    this.detach(session);try{this.bridge.voiceBackgroundStop(id);}catch{/* 不遮盖启动失败。 */}
    reject(Error(t('后台通话服务启动超时，请重试。')));
   },8000);
   try{this.bridge.voiceBackgroundStart(id);}catch{
    this.detach(session);try{this.bridge.voiceBackgroundStop(id);}catch{/* 保留启动错误。 */}
    reject(Error(failureMessage()));
   }
  });
 }
 private detach(session:Session){
  if(this.current!==session)return;
  clearTimeout(session.timer);this.events.removeEventListener(VOICE_BACKGROUND_EVENT,this.handle);this.current=undefined;
 }
 pulse(id:string){
  if(this.current?.id!==id||!this.current.ready)return;
  if(this.bridge.voiceBackgroundPulse(id)===false)throw Error(t('后台通话服务已失效，请重新拨号。'));
 }
 stop(id:string){
  const session=this.current;if(!session||session.id!==id)return;
  this.detach(session);if(!session.ready)session.reject(Error(t('后台通话已取消')));
  this.bridge.voiceBackgroundStop(id);
 }
}
export function readNativeVoiceBackground(scope:Window=window):VoiceBackgroundLease|undefined {
 const bridge=(scope as Window&{JsBridge?:Partial<AndroidVoiceBackgroundBridge>}).JsBridge;
 if(typeof bridge?.voiceBackgroundStart!=='function'||typeof bridge.voiceBackgroundStop!=='function'||typeof bridge.voiceBackgroundPulse!=='function')return;
 return new NativeVoiceBackground(bridge as AndroidVoiceBackgroundBridge,scope);
}
