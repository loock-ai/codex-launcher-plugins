import {execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {resolve,join} from 'node:path';
const root=fileURLToPath(new URL('../',import.meta.url));
export function buildMobileWeb({outDir=join(root,'dist/mobile-web'),version=process.env.VITE_APP_VERSION}={}){
 execFileSync(process.execPath,[join(root,'node_modules/vite/bin/vite.js'),'build','--outDir',resolve(outDir),'--emptyOutDir'],{
  cwd:join(root,'plugins/mobile/source'),stdio:'inherit',env:{...process.env,...(version?{VITE_APP_VERSION:version}:{})}
 });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)buildMobileWeb();
