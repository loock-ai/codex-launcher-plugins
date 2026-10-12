// 插件侧 IPC 协议；实际桌面连接由宿主提供。
export class ControlError extends Error{constructor(public code:string,message:string){super(message)}}
export interface ControlEvent{id?:string|number;method:string;hostId?:string;params?:any}
export interface UserQuestionTarget{hostId:string;threadId:string}
export type DesktopControlChannel={connect():Promise<void>;close():Promise<void>;status():any;pendingApprovals():ControlEvent[];hosts():Promise<any>;request(hostId:string,method:string,params:any,timeoutMs?:number):Promise<any>;respond(id:string|number,result:unknown):Promise<any>;subscribe(fn:(event:ControlEvent)=>void):()=>void;setUserQuestionTargets(targets:UserQuestionTarget[]):void;refreshUserQuestions(targets:UserQuestionTarget[]):Promise<void>};
