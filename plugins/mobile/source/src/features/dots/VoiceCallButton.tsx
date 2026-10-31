import {useEffect,useRef,useState} from 'react';
import type {BackendConfig} from '../../backends/types';
import {t} from '../../i18n';
import {createRequestId,dotsRequest} from './api';
import {DotVoiceCall,type VoiceState} from './voice';

export function VoiceCallButton({backend,dotId}:{backend:BackendConfig;dotId:string}){
 const [state,setState]=useState<VoiceState>({phase:'idle',muted:false});
 const [now,setNow]=useState(Date.now());
 const current=useRef<DotVoiceCall|null>(null),mounted=useRef(true);
 const supported=globalThis.isSecureContext===true&&typeof RTCPeerConnection!=='undefined'&&!!navigator.mediaDevices?.getUserMedia;
 useEffect(()=>{
  mounted.current=true;
  const end=()=>{void current.current?.stop();};window.addEventListener('pagehide',end);
  return()=>{mounted.current=false;window.removeEventListener('pagehide',end);end();};
 },[]);
 useEffect(()=>{if(state.phase!=='active')return;const timer=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(timer);},[state.phase]);
 const start=()=>{
  const call=new DotVoiceCall({secure:globalThis.isSecureContext===true,getUserMedia:()=>navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true,autoGainControl:true},video:false}),createPeer:()=>new RTCPeerConnection(),createAudio:()=>new Audio(),request:(action,body)=>dotsRequest(backend,`voice/${action}`,new AbortController().signal,body,undefined,{keepalive:action==='stop'})},value=>{if(mounted.current&&current.current===call){setState(value);setNow(Date.now());}});
  current.current=call;void call.start(dotId,createRequestId());
 };
 const busy=['preparing','connecting','active'].includes(state.phase);
 const seconds=Math.max(0,Math.floor((now-(state.startedAt??now))/1000));
 const elapsed=`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`;
 return <div className="dots-voice">
  {!busy?<button type="button" className="dots-icon-button" aria-label={t('语音通话')} disabled={!supported} title={!supported?t('请使用支持麦克风的浏览器，并通过 HTTPS 或本机安全地址打开页面'):t('语音通话')} onClick={start}>
   <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 3H4a1 1 0 0 0-1 1c0 9.4 7.6 17 17 17a1 1 0 0 0 1-1v-4l-5-2-2 2a14 14 0 0 1-6-6l2-2-2-5Z"/></svg>
  </button>:<div className="dots-voice-controls">
   <span role="status">{state.phase==='active'?elapsed:state.phase==='preparing'?t('等待麦克风…'):t('正在接通…')}</span>
   {state.phase==='active'&&<button type="button" aria-pressed={state.muted} onClick={()=>current.current?.setMuted(!state.muted)}>{state.muted?t('取消静音'):t('静音')}</button>}
   <button type="button" className="dots-voice-hangup" onClick={()=>void current.current?.stop()}>{t('挂断')}</button>
  </div>}
  {state.error&&<div className="dots-voice-error" role="alert">{t(state.error)}</div>}
 </div>;
}
