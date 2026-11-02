import { supabase } from '@/integrations/supabase/client';
import type { EvidenceRef } from './hub';
// Cache references/hashes only, never home files or bearer tokens.
export async function cachedReferences(caseId?:string,sourceId?:string,recordId?:string):Promise<EvidenceRef[]> {
 const {data:{session}}=await supabase.auth.getSession();if(!session)return [];
 const key=`evidence-hub.refs.${session.user.id}.${caseId??'*'}.${sourceId??'*'}.${recordId??'*'}`;
 try{let query=supabase.from('evidence_refs').select('*');if(caseId)query=query.eq('case_id',caseId);if(sourceId)query=query.eq('source_id',sourceId);if(recordId)query=query.eq('record_id',recordId);const {data,error}=await query.order('linked_at');if(error)throw error;try{localStorage.setItem(key,JSON.stringify(data));}catch{}return data;}catch(error){if(typeof navigator!=='undefined'&&!navigator.onLine){try{return JSON.parse(localStorage.getItem(key)??'[]') as EvidenceRef[];}catch{return [];}}throw error;}
}