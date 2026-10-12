import {test} from 'node:test';import assert from 'node:assert/strict';import {readFile,mkdtemp} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createHash} from 'node:crypto';
import {packagePlugin} from '../scripts/release-plugin.mjs';
test('独立ZIP与manifest一致并返回真实SHA256',async()=>{
 const out=await mkdtemp(join(tmpdir(),'plugin-release-'));const p=await packagePlugin('desktop-thread-time',out);
 const bytes=await readFile(p.file);assert.equal(p.sha256,createHash('sha256').update(bytes).digest('hex'));assert.match(p.file,/desktop-thread-time-[\d.]+\.zip$/);
 assert.equal(p.id,'desktop-thread-time');assert.ok(bytes.length>100);
});
