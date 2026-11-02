import { zipSync,strToU8 } from 'fflate';
import { supabase } from '@/integrations/supabase/client';
import type { Tables,Json } from '@/integrations/supabase/types';
import { csv,sha256,safeName,validHash,saveBytes,type Source } from './hub';
import { refFiles,verifiedHomeFile,logHome } from './home-vault';
import { itemResults,projectStats,type ProjectData } from './projects';

export type Output=Tables<'project_outputs'>;
function metadata(data:ProjectData){
 const brief=data.briefs[0];const criteria=brief?.project_criteria??[];
 const items=[['project_item_id','source','record','platform','published_at','files_sha256'],...data.items.map(i=>[i.id,i.item_kind,i.items?.item_code??i.evidence_refs?.record_id,i.items?.accounts?.platform??i.evidence_refs?.platform,i.items?.published_at??i.evidence_refs?.published_at,(i.items?.artefacts.map(f=>f.sha256)??(i.evidence_refs?refFiles(i.evidence_refs).map(f=>f.sha256):[])).join(';')])];
 const assessments=[['item','criterion','result','note','analyst','assessed_at'],...data.items.flatMap(i=>criteria.map(c=>{const a=data.assessments.find(a=>a.project_item_id===i.id&&a.criterion_id===c.id);return [i.id,c.label,itemResults(data,i.id)[c.id]??'not_assessed',a?.note,a?.assessed_by_name,a?.assessed_at];}))];
 return {brief,criteria,items,assessments};
}
export async function buildOutput(data:ProjectData,output:Output,sources:Source[]){
 const m=metadata(data);const entries:Record<string,Uint8Array>={};const problems:string[]=[];const manifest:string[]=[];const home=data.items.some(i=>i.item_kind==='home_ref');
 let bytes:Uint8Array;let filename:string;
 if(output.kind==='evidence_bundle'){
  for(const item of data.items){
   if(item.items)for(const file of item.items.artefacts){try{if(!validHash(file.sha256))throw new Error(`${file.filename}: NO_BASELINE`);const {data:blob,error}=await supabase.storage.from('evidence').download(file.storage_path);if(error||!blob)throw new Error(`${file.filename}: MISSING`);const content=new Uint8Array(await blob.arrayBuffer());const actual=await sha256(content);const {error:logError}=await supabase.from('custody_events').insert([{item_id:item.items.id,artefact_id:file.id,action:'accessed',sha256:file.sha256,filename:file.filename},{item_id:item.items.id,artefact_id:file.id,action:'re-hashed',sha256:actual,filename:file.filename,notes:actual===file.sha256?.toLowerCase()?'MATCH':'MISMATCH'}]);if(logError)throw logError;if(actual!==file.sha256?.toLowerCase())throw new Error(`${file.filename}: MISMATCH`);const path=`cloud/${item.items.id}/${file.id}_${safeName(file.filename)}`;entries[path]=content;manifest.push(`${actual}  ${path}`);}catch(e){problems.push(e instanceof Error?e.message:'File verification failed');}}
   if(item.evidence_refs){const ref=item.evidence_refs;const source=sources.find(s=>s.id===ref.source_id);if(!source){problems.push(`${ref.record_id}: source unavailable`);continue;}for(const f of refFiles(ref)){try{const content=await verifiedHomeFile(source,ref,f);const path=`home/${safeName(ref.record_id)}/${safeName(f.file_id)}_${safeName(f.filename)}`;entries[path]=content;manifest.push(`${f.sha256}  ${path}`);}catch(e){problems.push(e instanceof Error?e.message:'Home file unavailable');}}}
  }
  if(problems.length)throw new Error(`Nothing packed. Integrity problems:\n${problems.join('\n')}`);
  if(!data.items.length)throw new Error('Link evidence before building a bundle');
  entries['manifest.sha256']=strToU8(manifest.join('\n'));entries['brief.json']=strToU8(JSON.stringify(m.brief,null,2));entries['criteria.csv']=strToU8(csv([['id','kind','label','required','guidance','weight'],...m.criteria.map(c=>[c.id,c.kind,c.label,c.required,c.description,c.weight])]));entries['items.csv']=strToU8(csv(m.items));entries['assessments.csv']=strToU8(csv(m.assessments));entries['README.txt']=strToU8(`Evidence Hub — FridayAnalytics\nProject ${data.project.code}\nEach file verified against its capture/linking hash before packing.\nHome-containing bundles stay on the device.\nELEMENT CROP – not proof by itself\nRENDER – from API data, not a platform screenshot\nTranslations and machine transcripts need human verification.\n`);bytes=zipSync(entries);filename=`${data.project.code}_evidence.zip`;
 }else if(output.kind==='dataset'){bytes=strToU8(csv([['item','source','record','platform','published_at','file_hashes',...m.criteria.map(c=>c.label)],...data.items.map((i,index)=>[...(m.items[index+1]??[]),...m.criteria.map(c=>itemResults(data,i.id)[c.id]??'not_assessed')])]));filename=`${data.project.code}_dataset.csv`;
 }else if(output.kind==='dashboard'){bytes=strToU8(JSON.stringify({at:new Date().toISOString(),project:data.project.code,brief_version:m.brief?.version,counts:projectStats(data),criteria:m.criteria.map(c=>({label:c.label,results:data.items.map(i=>itemResults(data,i.id)[c.id]??'not_assessed')}))},null,2));filename=`${data.project.code}_dashboard.json`;
 }else {bytes=strToU8(`# ${data.project.name}\n\nFridayAnalytics — Evidence Hub\n\n## Question\n${m.brief?.question??''}\n\n## Background\n${m.brief?.background??''}\n\n## Scope\n${m.brief?.scope??''}\n\n## Criteria\n${m.criteria.map(c=>`- ${c.label}: ${c.description??''}`).join('\n')}\n\n## Evidence summary\n${JSON.stringify(projectStats(data),null,2)}\n\n## Findings\n[Attach final analyst report; distinguish stated, observed and assessed information.]\n\n## Limitations\n${m.brief?.constraints??''}\n\nMachine translations/transcripts require human verification.\n`);filename=`${data.project.code}_report.md`;}
 const hash=await sha256(bytes);const deviceOnly=home&&output.kind==='evidence_bundle';const location=deviceOnly?`device:${output.id}:${hash}`:`projects/${data.project.code}/outputs/${output.id}/${hash}_${safeName(filename)}`;
 if(!deviceOnly){const {error}=await supabase.storage.from('evidence').upload(location,new Blob([new Uint8Array(bytes).buffer]),{upsert:false});if(error)throw error;}
 const {error}=await supabase.from('project_outputs').update({location,file_name:filename,size_bytes:bytes.byteLength,sha256:hash,item_count:data.items.length,params:{brief_version:m.brief?.version??null,device_only:deviceOnly,snapshot_at:new Date().toISOString()} as Json}).eq('id',output.id);if(error)throw error;
 if(output.kind==='evidence_bundle')for(const item of data.items){if(item.evidence_refs)await logHome(item.evidence_refs,'exported',undefined,`Project ${data.project.code} verified bundle`);if(item.items){const {error}=await supabase.from('custody_events').insert(item.items.artefacts.map(f=>({item_id:item.items?.id??null,artefact_id:f.id,action:'exported',filename:f.filename,sha256:f.sha256,notes:`Project ${data.project.code} verified bundle`})));if(error)throw error;}}
 saveBytes(bytes,filename);return {bytes,filename,deviceOnly};
}
export async function attachOutput(data:ProjectData,output:Output,file:File){
 if(data.items.some(i=>i.item_kind==='home_ref')&&output.kind==='evidence_bundle')throw new Error('Home-containing bundles cannot be uploaded');
 const bytes=new Uint8Array(await file.arrayBuffer());const hash=await sha256(bytes);const location=`projects/${data.project.code}/outputs/${output.id}/${hash}_${safeName(file.name)}`;const {error}=await supabase.storage.from('evidence').upload(location,file,{upsert:false});if(error)throw error;const {error:update}=await supabase.from('project_outputs').update({location,file_name:file.name,size_bytes:file.size,sha256:hash,item_count:data.items.length}).eq('id',output.id);if(update)throw update;
}
export async function downloadOutput(output:Output,deviceBytes?:Uint8Array){
 if(!output.location||!validHash(output.sha256))throw new Error('Output has no verified file');let bytes:Uint8Array;
 if(output.location.startsWith('device:')){if(!deviceBytes)throw new Error('This home-vault bundle stays on its original device. Select the saved file to verify and download.');bytes=deviceBytes;}else {const {data,error}=await supabase.storage.from('evidence').download(output.location);if(error||!data)throw new Error('Output file unavailable');bytes=new Uint8Array(await data.arrayBuffer());}
 if(await sha256(bytes)!==output.sha256?.toLowerCase())throw new Error('Output download blocked: fingerprint MISMATCH');
 const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error('Sign in');const {error}=await supabase.from('project_events').insert({project_id:output.project_id,event:'output_downloaded',actor_id:user.id,details:{output_id:output.id,sha256:output.sha256}});if(error)throw error;saveBytes(bytes,output.file_name??'output');
}