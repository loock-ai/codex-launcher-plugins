import {afterEach,expect,it,vi} from 'vitest';
import {NativeVoiceBackground,readNativeVoiceBackground,VOICE_BACKGROUND_EVENT} from '../../src/audio/native-voice-background';

afterEach(()=>vi.useRealTimers());
function fixture(){
 const events=new EventTarget();
 const bridge={voiceBackgroundStart:vi.fn(),voiceBackgroundStop:vi.fn(),voiceBackgroundPulse:vi.fn(()=>true)};
 const send=(type:string,sessionId='call-a',reason?:string)=>events.dispatchEvent(new CustomEvent(VOICE_BACKGROUND_EVENT,{detail:{type,sessionId,reason}}));
 return {bridge,send,lease:new NativeVoiceBackground(bridge,events)};
}
it('等待原生前台服务就绪后才成功，旧会话事件和脉冲不能作用于新会话',async()=>{
 const f=fixture(),ended=vi.fn();let ready=false;
 const opening=f.lease.start('call-a',ended).then(()=>{ready=true;});
 f.send('started','old-call');await Promise.resolve();expect(ready).toBe(false);
 f.send('started');await opening;expect(ready).toBe(true);
 f.lease.pulse('old-call');expect(f.bridge.voiceBackgroundPulse).not.toHaveBeenCalled();
 f.lease.pulse('call-a');expect(f.bridge.voiceBackgroundPulse).toHaveBeenCalledWith('call-a');
 f.send('stopped','old-call','user');expect(ended).not.toHaveBeenCalled();
 f.send('stopped','call-a','user');expect(ended).toHaveBeenCalledWith(undefined);
});
it('取消尚未完成的启动会停止对应原生会话，迟到事件不再生效',async()=>{
 const f=fixture(),ended=vi.fn(),opening=f.lease.start('call-a',ended);
 const rejected=expect(opening).rejects.toThrow();f.lease.stop('call-a');await rejected;
 f.send('started');f.send('stopped');expect(ended).not.toHaveBeenCalled();
 expect(f.bridge.voiceBackgroundStop).toHaveBeenCalledTimes(1);
});
it('启动超时清理原生服务，而非继续创建网关通话',async()=>{
 vi.useFakeTimers();const f=fixture();const opening=f.lease.start('call-a',()=>{});const rejected=expect(opening).rejects.toThrow();
 await vi.advanceTimersByTimeAsync(8001);await rejected;
 expect(f.bridge.voiceBackgroundStop).toHaveBeenCalledWith('call-a');
});
it('原生服务拒绝启动会失败，活动服务丢失会通知通话结束',async()=>{
 const a=fixture();const pending=a.lease.start('call-a',()=>{});const rejected=expect(pending).rejects.toThrow();a.send('error','call-a','permission');await rejected;
 const b=fixture(),ended=vi.fn();const opening=b.lease.start('call-a',ended);b.send('started');await opening;
 b.send('stopped','call-a','timeout');expect(ended).toHaveBeenCalledWith(expect.any(String));
});
it('非原生浏览器不启用后台服务，原生返回失效脉冲会报错',async()=>{
 expect(readNativeVoiceBackground({} as Window)).toBeUndefined();
 const f=fixture();const opening=f.lease.start('call-a',()=>{});f.send('started');await opening;
 f.bridge.voiceBackgroundPulse.mockReturnValue(false);expect(()=>f.lease.pulse('call-a')).toThrow();f.lease.stop('call-a');
});
