import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
export function validateMobileAppIndex(data){
 if(!data||data.draft!==false||data.prerelease!==false||!/^v\d+\.\d+\.\d+$/.test(data.tag_name))throw Error('App索引必须指向正式版本');
 const repository='loock-ai/codex-launcher-plugins';
 const name=`CodexMobile-${data.tag_name}.apk`;
 const asset=data.assets?.find(item=>item.name===name);
 if(!asset||asset.browser_download_url!==`https://github.com/${repository}/releases/download/${data.tag_name}/${name}`||!/^sha256:[a-f0-9]{64}$/.test(asset.digest)||data.html_url!==`https://github.com/${repository}/releases/tag/${data.tag_name}`)throw Error('App索引的APK来源或哈希无效');
 return data.tag_name;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 console.log(`App索引验证通过：${validateMobileAppIndex(JSON.parse(readFileSync(new URL('../plugins/mobile/app/latest.json',import.meta.url),'utf8')))}`);
}
