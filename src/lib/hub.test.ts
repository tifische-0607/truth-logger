import { describe,it,expect } from 'vitest';
import { verdict,validHash,safeName } from './hub';
import { fileProblem,gatewayBase,recordFrom } from './home-vault';
import type { Source } from './hub';
describe('project brief verdicts',()=>{
 const inclusion={id:'include',kind:'inclusion',required:true}; const exclusion={id:'exclude',kind:'exclusion',required:false};
 it('meets only when every inclusion and required criterion is met and exclusions are not met',()=>{expect(verdict([inclusion,exclusion],{include:'meets',exclude:'does_not_meet'})).toBe('meets the brief');expect(verdict([inclusion,exclusion],{include:'not_applicable',exclude:'does_not_meet'})).toBe('to assess');});
 it('excludes a required inclusion failure',()=>expect(verdict([inclusion],{include:'does_not_meet'})).toBe('excluded'));
 it('excludes an exclusion that is met',()=>expect(verdict([inclusion,exclusion],{include:'meets',exclude:'meets'})).toBe('excluded'));
 it('unassessed or unclear evidence stays to assess',()=>{expect(verdict([inclusion],{})).toBe('to assess');expect(verdict([inclusion],{include:'unclear'})).toBe('to assess');});
 it('optional inclusion still must be met',()=>expect(verdict([{...inclusion,required:false}],{})).toBe('to assess'));
});
describe('home-vault evidence safety',()=>{
 const hash='a'.repeat(64);const file={file_id:'1',filename:'evidence.png',kind:'screenshot',sha256:hash,path_status:'OK'};
 it('requires exactly 64 hex characters for a linking fingerprint',()=>{expect(validHash(hash)).toBe(true);expect(validHash('g'.repeat(64))).toBe(false);expect(validHash('a'.repeat(63))).toBe(false);});
 it.each(['MISSING','AMBIGUOUS','UNSAFE','UNKNOWN'])('blocks %s files',status=>expect(fileProblem({...file,path_status:status})).toBe(status));
 it('blocks files without a baseline',()=>expect(fileProblem({...file,sha256:''})).toBe('NO_BASELINE'));
 it('accepts OK files with a valid baseline',()=>expect(fileProblem(file)).toBe(null));
 it('requires collection.row record IDs',()=>{expect(recordFrom({id:'finding.42',files:[]}).id).toBe('finding.42');expect(()=>recordFrom({id:'42'})).toThrow();});
 it('prevents unsafe ZIP paths',()=>expect(safeName('../../secrets.txt')).toBe('_.._secrets.txt'));
 it('rejects non-HTTPS and credential-bearing gateways',()=>{const source={enabled:true,gateway_url:'http://vault.local'} as Source;expect(()=>gatewayBase(source)).toThrow();expect(()=>gatewayBase({...source,gateway_url:'https://user:password@vault.local'})).toThrow();});
});