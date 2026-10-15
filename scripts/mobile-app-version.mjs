import {readFileSync,appendFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
function parse(value){
 const match=/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/.exec(value);
 if(!match||!match.slice(1).map(Number).every(Number.isSafeInteger))throw Error(`无效App版本：${value}`);
 return match.slice(1).map(Number);
}
function compare(a,b){const x=parse(a),y=parse(b);return x[0]-y[0]||x[1]-y[1]||x[2]-y[2]}
export function resolveAppVersion({baseline,tags,requested=''}){
 parse(baseline);
 const versions=tags.filter(tag=>/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(tag)).map(tag=>tag.slice(1));
 const highest=[baseline,...versions].sort(compare).at(-1);
 if(requested){const version=requested.replace(/^v/,'');parse(version);if(compare(version,highest)<=0)throw Error(`App版本必须高于 ${highest}`);return version;}
 const [major,minor,patch]=parse(highest);return `${major}.${minor}.${patch+1}`;
}
export function shouldPublishApp(publish,event){return event==='push'||publish==='true';}
export function androidVersionCode(version,base=200000000){
 const [major,minor,patch]=parse(version);
 const code=base+major*1000000+minor*1000+patch;
 if(minor>999||patch>999||!Number.isSafeInteger(code)||code>2100000000)throw Error('Android版本超出版本码范围');
 return code;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const config=JSON.parse(readFileSync(new URL('../plugins/mobile/app/version.json',import.meta.url),'utf8'));
 const repository=process.env.GITHUB_REPOSITORY||'loock-ai/codex-launcher-plugins';
 // 分页查询全部版本；API失败直接退出，不猜测版本，不拿插件latest当App版本。
 const result=execFileSync('gh',['api',`repos/${repository}/releases`,'--paginate','--jq','.[] | .tag_name'],{encoding:'utf8'});
 const version=resolveAppVersion({baseline:config.version,tags:result.split('\n'),requested:process.env.REQUESTED_VERSION||''});
 const code=androidVersionCode(version,config.androidVersionCodeBase);
 const values={app_version:version,app_version_code:code,release_tag:`v${version}`,build_ios:process.env.ENABLE_IOS_BUILD==='true',publish:shouldPublishApp(process.env.PUBLISH_APP,process.env.GITHUB_EVENT_NAME)};
 if(process.env.GITHUB_OUTPUT)appendFileSync(process.env.GITHUB_OUTPUT,Object.entries(values).map(([k,v])=>`${k}=${v}\n`).join(''));
 console.log(JSON.stringify(values));
}
