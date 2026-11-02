import { beforeEach, describe, expect, it, vi } from 'vitest';
const api=vi.hoisted(()=>({insert:vi.fn(),getSession:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{auth:{getSession:api.getSession},from:()=>({insert:api.insert})}}));
import { verifiedHomeFile,homeBundle } from './home-vault';
import { sha256,type Source,type EvidenceRef } from './hub';
const source={id:'darknight',enabled:true,gateway_url:'https://vault.example'} as Source;
describe('home file integrity and locality',()=>{
 beforeEach(()=>{vi.restoreAllMocks();api.insert.mockResolvedValue({error:null});api.getSession.mockResolvedValue({data:{session:{access_token:'test-token'}}});});
 async function fixture(match=true){const bytes=new TextEncoder().encode('original evidence');const hash=await sha256(bytes);const file={file_id:'1',filename:'original.txt',kind:'text',sha256:hash,path_status:'OK'};const ref={id:'ref',source_id:'darknight',record_id:'finding.1',files:[file]} as unknown as EvidenceRef;vi.stubGlobal('fetch',vi.fn(async(url:string)=>url.endsWith('/files/1')?new Response(match?bytes:new TextEncoder().encode('changed evidence')):Response.json({id:'finding.1',files:[file]})));return {bytes,file,ref};}
 it('returns only bytes matching the linking hash and logs access and rehash',async()=>{const {bytes,file,ref}=await fixture();expect(await verifiedHomeFile(source,ref,file)).toEqual(bytes);expect(api.insert.mock.calls.map(c=>c[0].action)).toEqual(['accessed','re-hashed']);});
 it('blocks a mismatched file rather than replacing the linking baseline',async()=>{const {file,ref}=await fixture(false);await expect(verifiedHomeFile(source,ref,file)).rejects.toThrow('MISMATCH');expect(file.sha256).toBe(await sha256(new TextEncoder().encode('original evidence')));});
 it('packs nothing when any home file fails verification',async()=>{const {ref}=await fixture(false);await expect(homeBundle([ref],[source])).rejects.toThrow('Export blocked');expect(api.insert.mock.calls.some(c=>c[0].action==='exported')).toBe(false);});
 it('sends the user bearer only to the configured HTTPS gateway without redirects',async()=>{const {file,ref}=await fixture();await verifiedHomeFile(source,ref,file);expect(fetch).toHaveBeenCalledWith('https://vault.example/v1/records/finding.1',expect.objectContaining({redirect:'error',credentials:'omit',headers:{Authorization:'Bearer test-token'}}));});
});