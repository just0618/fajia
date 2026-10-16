import { getStore } from '@edgeone/pages-blob';
const STORE_NAME='fajia-member-index',ALLOWED_GROUPS=new Set(['763220','761299','761356']),GROUP_NAMES={'763220':'一个月上七天班（贺嘉述专组）','761299':'法述进修学院（旧组）','761356':'法述修炼中'},MAX_IDENTITIES=5000;
const maxRecentForGroup=groupId=>String(groupId)==='761299'?30:20;

const SUPPLEMENTAL_TOPICS=new Set([
  '502292130',
  '502372097'
]);

const SUPPLEMENTAL_RECENT_MAX=10;
const json=(d,s=200)=>new Response(JSON.stringify(d),{status:s,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}}),clean=(v,n=500)=>String(v||'').trim().slice(0,n);
function cleanItem(x,groupId){
  const id=clean(x?.item_id,180);
  if(!id)return null;

  const base={
    item_id:id,
    source_label:clean(x?.source_label,160),
    source_type:clean(x?.source_type,40),
    published_at:clean(x?.published_at,80),
    text:clean(x?.text,520),
    page_start:
      Number.isInteger(Number(x?.page_start))
      && Number(x?.page_start)>=0
        ? Number(x?.page_start)
        : null
  };

  /*
   * 761299 is the large historical shard.
   *
   * These fields are redundant for the current member-check path:
   * - group_id is already determined by the shard
   * - source_label is always present, so source_key is not needed for display
   * - URLs are reconstructed from item_id + page_start
   * - reply_to_item_id is not displayed
   */
  if(String(groupId)==='761299'){
    return base;
  }

  return{
    ...base,
    group_id:groupId,
    source_key:clean(x?.source_key,120),
    source_url:clean(x?.source_url,600),
    reply_to_item_id:clean(x?.reply_to_item_id,180)
  };
}
function cleanEntity(
  rawKey,
  raw,
  membership,
  groupId
){
  const key=clean(rawKey,160);

  if(
    !key ||
    !raw ||
    typeof raw!=='object'
  ){
    return null;
  }

  const seen=new Set();
  const recent=[];

  for(
    const x of
    Array.isArray(raw.recent)
      ? raw.recent
      : []
  ){
    if(
      recent.length>=
      maxRecentForGroup(groupId)
    ){
      break;
    }

    const item=cleanItem(
      x,
      groupId
    );

    if(
      !item ||
      seen.has(item.item_id)
    ){
      continue;
    }

    seen.add(item.item_id);
    recent.push(item);
  }


  const supplemental={};

  if(
    String(groupId)==='761299' &&
    raw.supplemental &&
    typeof raw.supplemental==='object' &&
    !Array.isArray(raw.supplemental)
  ){
    for(
      const [topicId,section]
      of Object.entries(
        raw.supplemental
      )
    ){
      const topic=String(
        topicId||''
      );

      if(
        !SUPPLEMENTAL_TOPICS.has(
          topic
        )
      ){
        continue;
      }

      if(
        !section ||
        typeof section!=='object' ||
        Array.isArray(section)
      ){
        continue;
      }

      const sideSeen=new Set();
      const sideRecent=[];

      for(
        const x of
        Array.isArray(section.recent)
          ? section.recent
          : []
      ){
        if(
          sideRecent.length>=
          SUPPLEMENTAL_RECENT_MAX
        ){
          break;
        }

        const item=cleanItem(
          x,
          groupId
        );

        if(
          !item ||
          sideSeen.has(item.item_id)
        ){
          continue;
        }

        sideSeen.add(
          item.item_id
        );

        sideRecent.push(item);
      }

      const totalCount=Math.max(
        0,
        Number(
          section.total_count||0
        )||0
      );

      if(
        totalCount<=0 &&
        sideRecent.length===0
      ){
        continue;
      }

      supplemental[topic]={
        topic_id:topic,

        source_label:clean(
          section.source_label ||
          `补充楼 ${topic}`,
          160
        ),

        total_count:
          totalCount,

        latest_at:
          clean(
            section.latest_at,
            80
          ) || null,

        recent:
          sideRecent
      };
    }
  }


  const totalCount=Math.max(
    0,
    Number(
      raw.total_count||0
    )||0
  );

  const supplementalCount=
    Object.values(
      supplemental
    ).reduce(
      (n,x)=>
        n+
        Math.max(
          0,
          Number(
            x.total_count||0
          )||0
        ),
      0
    );

  return{
    key,

    value:{
      profile_key:
        clean(
          raw.profile_key,
          160
        ),

      display_name:
        clean(
          raw.display_name,
          160
        ),

      profile_url:
        clean(
          raw.profile_url,
          600
        ),

      author_uid:
        clean(
          raw.author_uid,
          80
        ),

      canonical_name:
        clean(
          raw.canonical_name,
          160
        ),

      canonical_profile_url:
        clean(
          raw.canonical_profile_url,
          600
        ),

      identity_match_method:
        clean(
          raw.identity_match_method,
          80
        ),

      membership_record_present:
        Boolean(membership),

      total_count:
        totalCount,

      all_total_count:
        totalCount+
        supplementalCount,

      latest_at:
        clean(
          raw.latest_at,
          80
        ) || null,

      recent,

      supplemental
    }
  };
}

export async function onRequestPost({request,env}){
let stage='start';
try{
stage='read_request';
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
    recent_items_per_identity:maxRecentForGroup(groupId),
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

stage='write_shard';
await store.setJSON(shardKey,index);

stage='completed';
return json({
  ok:true,
  schema_version:4,
  group_id:groupId,
  group_name:groupName,
  shard_key:shardKey,
  legacy_written:false,
  generated_at:index.generated_at,
  member_profiles_with_activity:Object.keys(members).length,
  historical_identities_with_activity:Object.keys(historical_identities).length,
  stored_recent_items:storedItems
});
}catch(err){
  console.error(
    'member activity upload failed',
    stage,
    err
  );
  return json({
    error:'server_error',
    stage,
    error_name:String(err?.name||'Error').slice(0,80),
    error_message:String(err?.message||'').slice(0,240)
  },500);
}}

export async function onRequestGet(){return json({ok:true,service:'fajia-member-activity-upload',schema_version:4,sharded:true,allowed_groups:[...ALLOWED_GROUPS]})}
