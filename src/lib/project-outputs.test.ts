import { beforeEach,expect,it,vi } from 'vitest';
const calls=vi.hoisted(()=>({upload:vi.fn(),update:vi.fn(),eq:vi.fn(),save:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>({upload:calls.upload})},from:()=>({update:calls.update})}}));
vi.mock('./hub',async()=>({...await vi.importActual<typeof import('./hub')>('./hub'),saveBytes:calls.save}));
import { buildOutput,type Output } from './project-outputs';
import type { ProjectData } from './projects';
beforeEach(()=>{vi.clearAllMocks();calls.upload.mockResolvedValue({error:null});calls.update.mockReturnValue({eq:calls.eq});calls.eq.mockResolvedValue({error:null});});
it('builds a report from its recorded brief version, not a newer brief',async()=>{
 const data={project:{code:'TEST-2026-01',name:'Test'},briefs:[{id:'new',version:2,question:'New question',project_criteria:[]},{id:'old',version:1,question:'Original question',project_criteria:[]}],items:[],assessments:[]} as unknown as ProjectData;
 const result=await buildOutput(data,{id:'output',brief_id:'old',kind:'report'} as Output,[]);
 const text=new TextDecoder().decode(result.bytes);expect(text).toContain('Original question');expect(text).not.toContain('New question');expect(calls.update).toHaveBeenCalledWith(expect.objectContaining({params:expect.objectContaining({brief_version:1})}));
});