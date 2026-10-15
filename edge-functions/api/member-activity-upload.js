import { getStore } from '@edgeone/pages-blob';
const STORE_NAME='fajia-member-index',LEGACY_ACTIVITY_KEY='member-activity/latest.json',ALLOWED_GROUPS=new Set(['763220','761299','761356']),GROUP_NAMES={'763220':'一个月上七天班（贺嘉述专组）','761299':'法述进修学院（旧组）','761356':'法述修炼中'},MAX_IDENTITIES=5000,MAX_RECENT=20;
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}),clean=(v,n=500)=>String(v||'').trim().slice(0,n);
function cleanItem(x,groupId){const id=clean(x?.item_id,180);if(!id)return null;return{item_id:id,group_id:groupId,source_key:clean(x?.source_key,120),source_label:clean(x?.source_label,160),source_type:clean(x?.source_type,40),published_at:clean(x?.published_at,80),text:clean(x?.text,520),page_start:Number.isInteger(Number(x?.page_start))&&Number(x?.page_start)>=0?Number(x?.page_start):null,source_url:clean(x?.source_url,600),reply_to_item_id:clean(x?.reply_to_item_id,180)}}
function cleanEntity(rawKey,raw,membership,groupId){const key=clean(rawKey,160);if(!key||!raw||typeof raw!=='object')return null;const seen=new Set(),recent=[];for(const x of Array.isArray(raw.recent)?raw.recent:[]){if(recent.length>=MAX_RECENT)break;const item=cleanItem(x,groupId);if(!item||seen.has(item.item_id))continue;seen.add(item.item_id);recent.push(item)}return{key,value:{profile_key:clean(raw.profile_key,160),display_name:clean(raw.display_name,160),profile_url:clean(raw.profile_url,600),author_uid:clean(raw.author_uid,80),canonical_name:clean(raw.canonical_name,160),canonical_profile_url:clean(raw.canonical_profile_url,600),identity_match_method:clean(raw.identity_match_method,80),membership_record_present:Boolean(membership),total_count:Math.max(0,Number(raw.total_count||0)||0),latest_at:clean(raw.latest_at,80)||null,recent}}}
export async function onRequestPost({request,env}){try{
const text=await request.text();
if(text.length>8_000_000)return json({error:'payload_too_large'},413);

const body=JSON.parse(text||'{}'),token=String(body.token||'');
if(!env?.MEMBER_INDEX_UPLOAD_TOKEN||token!==env.MEMBER_INDEX_UPLOAD_TOKEN)
  return json({error:'unauthorized'},401);

const incoming=body.index;
if(!incoming||!incoming.members||typeof incoming.members!=='object'||Array.isArray(incoming.members))
  return json({error:'invalid_index'},400);

const groupId=clean(incoming?.group?.id,40);
if(!ALLOWED_GROUPS.has(groupId))
  return json({error:'invalid_group'},400);

const groupName=GROUP_NAMES[groupId]||clean(incoming?.group?.name,160)||groupId;
const hist=(incoming.historical_identities&&typeof incoming.historical_identities==='object'&&!Array.isArray(incoming.historical_identities))?incoming.historical_identities:{};
const me=Object.entries(incoming.members),he=Object.entries(hist);

if(me.length+he.length>MAX_IDENTITIES)
  return json({error:'too_many_identities'},400);

const members={},historical_identities={};
let storedItems=0;

for(const[k,r]of me){
  const c=cleanEntity(k,r,true,groupId);
  if(!c)continue;
  members[c.key]=c.value;
  storedItems+=c.value.recent.length;
}

for(const[k,r]of he){
  const c=cleanEntity(k,r,false,groupId);
  if(!c)continue;
  historical_identities[c.key]=c.value;
  storedItems+=c.value.recent.length;
}

const index={
  schema_version:4,
  generated_at:clean(incoming.generated_at,80)||new Date().toISOString(),
  group:{id:groupId,name:groupName},
  policy:{
    recent_items_per_identity:MAX_RECENT,
    ip_location_uploaded:false,
    membership_and_history_separated:true,
    historical_identity_does_not_imply_membership:true
  },
  stats:{
    member_profiles_with_activity:Object.keys(members).length,
    historical_identities_with_activity:Object.keys(historical_identities).length,
    stored_recent_items:storedItems
  },
  members,
  historical_identities
};

const store=getStore({name:STORE_NAME,consistency:'strong'});
const shardKey=`member-activity/${groupId}.json`;

await store.setJSON(shardKey,index);

/* Migration safety:
   old group continues to feed the legacy key until member-check
   has been migrated to shard-aware reads. */
if(groupId==='761299'){
  await store.setJSON(LEGACY_ACTIVITY_KEY,index);
}

return json({
  ok:true,
  schema_version:4,
  group_id:groupId,
  group_name:groupName,
  shard_key:shardKey,
  legacy_written:groupId==='761299',
  generated_at:index.generated_at,
  member_profiles_with_activity:Object.keys(members).length,
  historical_identities_with_activity:Object.keys(historical_identities).length,
  stored_recent_items:storedItems
});
}catch(err){
  console.error('member activity upload failed',err);
  return json({error:'server_error'},500);
}}

export async function onRequestGet(){return json({ok:true,service:'fajia-member-activity-upload',schema_version:4,sharded:true,allowed_groups:[...ALLOWED_GROUPS]})}
