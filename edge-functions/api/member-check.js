import { getStore } from '@edgeone/pages-blob';

const STORE_NAME='fajia-member-index';
const INDEX_KEY='member-index/latest.json';
const DIRECTORY_KEY='member-activity/identity-directory.json';

const MAX_RESULTS=20;

const ALLOWED_GROUPS=new Set([
  '763220',
  '761299',
  '761356'
]);

const VALID_STATUSES=new Set([
  'CURRENT',
  'MISSING',
  'EXITED'
]);

const json=(d,s=200)=>new Response(
  JSON.stringify(d),
  {
    status:s,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff',
      'referrer-policy':'no-referrer'
    }
  }
);

const norm=v=>String(v||'').trim().toLowerCase();

function extractProfileKey(q){
  const m=String(q||'')
    .trim()
    .match(/douban\.com\/people\/([^/?#]+)/i);

  return m ? decodeURIComponent(m[1]) : '';
}

function trackedGroups(meta={}){
  return Object.entries(meta)
    .filter(([id])=>ALLOWED_GROUPS.has(String(id)))
    .map(([id,x])=>({
      id:String(id),
      name:String(x?.name||id),
      member_count:Number(x?.member_count||0)
    }))
    .sort((a,b)=>a.id.localeCompare(b.id));
}

function cleanState(x){
  if(!x||typeof x!=='object'||Array.isArray(x))
    return null;

  const status=String(x.status||'').toUpperCase();

  if(!VALID_STATUSES.has(status))
    return null;

  return {
    status,
    first_seen_at:x.first_seen_at||null,
    last_seen_at:x.last_seen_at||null,
    missing_since:x.missing_since||null,
    exit_confirmed_at:x.exit_confirmed_at||null,
    rejoined_count:Math.max(
      0,
      Number(x.rejoined_count||0)||0
    )
  };
}

function cleanActivity(x,groupId,groupName){
  if(!x||typeof x!=='object'||Array.isArray(x))
    return null;

  return {
    group_id:String(groupId||''),
    group_name:String(groupName||groupId||''),

    author_uid:String(x.author_uid||''),
    canonical_name:String(x.canonical_name||''),
    canonical_profile_url:String(
      x.canonical_profile_url||''
    ),

    total_count:Math.max(
      0,
      Number(x.total_count||0)||0
    ),

    latest_at:x.latest_at||null,

    recent:(Array.isArray(x.recent)?x.recent:[])
      .slice(0,20)
      .map(i=>({
        item_id:String(i?.item_id||''),
        source_key:String(i?.source_key||''),
        source_label:String(i?.source_label||''),
        source_type:String(i?.source_type||''),
        published_at:i?.published_at||null,
        text:String(i?.text||''),

        page_start:
          Number.isInteger(Number(i?.page_start))
          && Number(i?.page_start)>=0
            ? Number(i?.page_start)
            : null,

        source_url:String(i?.source_url||''),

        reply_to_item_id:String(
          i?.reply_to_item_id||''
        )
      }))
  };
}

function score(q,pq,f){
  const key=norm(f.profile_key);
  const name=norm(f.display_name);
  const username=norm(f.username);
  const url=norm(f.profile_url);
  const uid=norm(f.author_uid);

  const cn=norm(f.canonical_name);
  const cu=norm(f.canonical_profile_url);
  const cs=norm(
    extractProfileKey(
      f.canonical_profile_url||''
    )
  );

  if(pq&&(key===q||cs===q))
    return 100;

  if(uid&&uid===q)
    return 99;

  if(key===q||username===q||cs===q)
    return 95;

  if(name===q||cn===q)
    return 90;

  if(
    name.startsWith(q) ||
    cn.startsWith(q) ||
    username.startsWith(q) ||
    key.startsWith(q) ||
    uid.startsWith(q)
  ){
    return 70;
  }

  if(
    name.includes(q) ||
    cn.includes(q) ||
    username.includes(q) ||
    key.includes(q) ||
    uid.includes(q) ||
    url.includes(q) ||
    cu.includes(q)
  ){
    return 50;
  }

  return 0;
}

function buildDirectoryLookups(directory){
  const byUid=new Map();
  const byProfileKey=new Map();

  const identities=(
    directory?.identities &&
    typeof directory.identities==='object' &&
    !Array.isArray(directory.identities)
  )
    ? directory.identities
    : {};

  for(const raw of Object.values(identities)){
    if(!raw||typeof raw!=='object')
      continue;

    const uid=String(raw.author_uid||'').trim();

    if(!uid)
      continue;

    byUid.set(uid,raw);

    const keys=new Set(
      Array.isArray(raw.profile_keys)
        ? raw.profile_keys.map(String)
        : []
    );

    const urlKey=extractProfileKey(
      raw.profile_url||''
    );

    if(urlKey)
      keys.add(urlKey);

    for(const key of keys){
      const k=String(key||'').trim();

      if(k)
        byProfileKey.set(k,raw);
    }
  }

  return {
    identities,
    byUid,
    byProfileKey
  };
}

function directoryForMember(
  m,
  byUid,
  byProfileKey
){
  const pk=String(m?.profile_key||'').trim();

  if(pk&&byProfileKey.has(pk))
    return byProfileKey.get(pk);

  const urlKey=extractProfileKey(
    m?.profile_url||''
  );

  if(urlKey&&byProfileKey.has(urlKey))
    return byProfileKey.get(urlKey);

  if(pk&&byUid.has(pk))
    return byUid.get(pk);

  return null;
}

async function loadShard(
  store,
  groupId,
  cache
){
  if(cache.has(groupId))
    return cache.get(groupId);

  let shard=null;

  try{
    shard=await store.get(
      `member-activity/${groupId}.json`,
      {
        type:'json',
        consistency:'strong'
      }
    );
  }catch(_){
    shard=null;
  }

  cache.set(groupId,shard);

  return shard;
}

async function activitiesForIdentity(
  identity,
  store,
  directory,
  cache
){
  const out={};

  if(
    !identity?.groups ||
    typeof identity.groups!=='object' ||
    Array.isArray(identity.groups)
  ){
    return out;
  }

  for(const [groupId,link] of Object.entries(
    identity.groups
  )){
    if(!ALLOWED_GROUPS.has(String(groupId)))
      continue;

    const shard=await loadShard(
      store,
      String(groupId),
      cache
    );

    if(!shard)
      continue;

    const bucket=String(link?.bucket||'');
    const key=String(link?.key||'');

    let raw=null;

    if(bucket==='member'){
      raw=shard?.members?.[key]||null;
    }else if(bucket==='historical_identity'){
      raw=shard?.historical_identities?.[key]||null;
    }

    if(!raw)
      continue;

    const groupName=
      String(shard?.group?.name||'') ||
      String(
        directory?.groups?.[groupId]?.name||''
      ) ||
      String(groupId);

    const a=cleanActivity(
      raw,
      String(groupId),
      groupName
    );

    if(a)
      out[String(groupId)]=a;
  }

  return out;
}

function compactMember(
  m,
  meta={},
  identity=null,
  activities={}
){
  const current=new Set(
    Array.isArray(m.groups)
      ? m.groups
          .map(String)
          .filter(id=>ALLOWED_GROUPS.has(id))
      : []
  );

  const memberships={};

  if(
    m.memberships &&
    typeof m.memberships==='object' &&
    !Array.isArray(m.memberships)
  ){
    for(const [id,x] of Object.entries(
      m.memberships
    )){
      if(!ALLOWED_GROUPS.has(String(id)))
        continue;

      const s=cleanState(x);

      if(s)
        memberships[String(id)]=s;
    }
  }

  for(const id of current){
    if(!memberships[id]){
      memberships[id]={
        status:'CURRENT',
        first_seen_at:null,
        last_seen_at:null,
        missing_since:null,
        exit_confirmed_at:null,
        rejoined_count:0
      };
    }
  }

  const pk=String(m.profile_key||'');

  return {
    record_type:'member',
    membership_record_present:true,
    historical_identity_only:false,

    profile_key:pk,
    author_uid:String(
      identity?.author_uid||''
    ),

    display_name:String(
      m.display_name||m.name||''
    ),

    username:String(m.username||''),
    profile_url:String(m.profile_url||''),

    groups:[...current].map(id=>({
      id,
      name:meta?.[id]?.name||id,
      is_member:true
    })),

    memberships,

    activities,

    // Temporary compatibility for the current frontend/API
    activity:activities['761299']||null
  };
}

function compactHistory(
  raw,
  activities={}
){
  const profileKeys=Array.isArray(raw?.profile_keys)
    ? raw.profile_keys
    : [];

  return {
    record_type:'historical_identity',
    membership_record_present:false,
    historical_identity_only:true,

    profile_key:String(
      profileKeys[0] ||
      extractProfileKey(raw?.profile_url||'') ||
      raw?.author_uid ||
      ''
    ),

    author_uid:String(raw?.author_uid||''),

    display_name:String(
      raw?.display_name||'未记录昵称'
    ),

    username:'',
    profile_url:String(raw?.profile_url||''),

    groups:[],
    memberships:{},

    activities,

    activity:activities['761299']||null
  };
}

function candidateKey(c){
  const uid=norm(c.identity?.author_uid);

  if(uid)
    return `uid:${uid}`;

  if(c.type==='member'){
    const url=norm(c.member?.profile_url);
    const pk=norm(c.member?.profile_key);

    if(url)
      return `url:${url}`;

    return `pk:${pk}`;
  }

  return `history:${norm(c.identity?.profile_url)}`;
}

export async function onRequestPost({
  request,
  env
}){
  try{
    const body=await request.json();

    const token=String(body.token||'');
    const query=String(body.query||'').trim();

    if(
      !env?.MEMBER_CHECK_TOKEN ||
      token!==env.MEMBER_CHECK_TOKEN
    ){
      return json({error:'unauthorized'},401);
    }

    if(!query||query.length>200)
      return json({error:'invalid_query'},400);

    const pq=extractProfileKey(query);

    if(!pq&&query.length<2)
      return json({error:'query_too_short'},400);

    const store=getStore({
      name:STORE_NAME,
      consistency:'strong'
    });

    const index=await store.get(
      INDEX_KEY,
      {
        type:'json',
        consistency:'strong'
      }
    );

    if(!index||!Array.isArray(index.members))
      return json({error:'index_not_ready'},503);

    let directory=null;

    try{
      directory=await store.get(
        DIRECTORY_KEY,
        {
          type:'json',
          consistency:'strong'
        }
      );
    }catch(_){
      directory=null;
    }

    if(
      !directory ||
      !directory.identities ||
      typeof directory.identities!=='object'
    ){
      return json(
        {error:'activity_directory_not_ready'},
        503
      );
    }

    const {
      identities,
      byUid,
      byProfileKey
    }=buildDirectoryLookups(directory);

    const q=norm(pq||query);
    const rows=[];

    const memberDirectoryUids=new Set();

    for(const m of index.members){
      const identity=directoryForMember(
        m,
        byUid,
        byProfileKey
      );

      if(identity?.author_uid){
        memberDirectoryUids.add(
          String(identity.author_uid)
        );
      }

      const s=score(
        q,
        pq,
        {
          profile_key:m.profile_key,
          display_name:m.display_name||m.name,
          username:m.username,
          profile_url:m.profile_url,

          author_uid:identity?.author_uid,

          canonical_name:identity?.display_name,
          canonical_profile_url:identity?.profile_url
        }
      );

      if(s){
        rows.push({
          score:s,
          priority:1,
          type:'member',
          member:m,
          identity
        });
      }
    }

    for(const raw of Object.values(identities)){
      const uid=String(
        raw?.author_uid||''
      );

      if(!uid||memberDirectoryUids.has(uid))
        continue;

      const profileKeys=
        Array.isArray(raw?.profile_keys)
          ? raw.profile_keys
          : [];

      const s=score(
        q,
        pq,
        {
          profile_key:profileKeys[0]||'',
          display_name:raw?.display_name,
          username:'',
          profile_url:raw?.profile_url,
          author_uid:uid,
          canonical_name:raw?.display_name,
          canonical_profile_url:raw?.profile_url
        }
      );

      if(s){
        rows.push({
          score:s,
          priority:0,
          type:'history',
          identity:raw
        });
      }
    }

    rows.sort(
      (a,b)=>
        b.score-a.score ||
        b.priority-a.priority ||
        String(
          a.type==='member'
            ? a.member?.display_name||a.member?.name||''
            : a.identity?.display_name||''
        ).localeCompare(
          String(
            b.type==='member'
              ? b.member?.display_name||b.member?.name||''
              : b.identity?.display_name||''
          ),
          'zh-CN'
        )
    );

    const unique=[];
    const seen=new Set();

    for(const r of rows){
      const k=candidateKey(r);

      if(seen.has(k))
        continue;

      seen.add(k);
      unique.push(r);
    }

    const selected=unique.slice(
      0,
      MAX_RESULTS
    );

    const shardCache=new Map();
    const out=[];

    for(const r of selected){
      const activities=r.identity
        ? await activitiesForIdentity(
            r.identity,
            store,
            directory,
            shardCache
          )
        : {};

      if(r.type==='member'){
        out.push(
          compactMember(
            r.member,
            index.groups||{},
            r.identity,
            activities
          )
        );
      }else{
        out.push(
          compactHistory(
            r.identity,
            activities
          )
        );
      }
    }

    return json({
      ok:true,

      schema_version:Number(
        index.schema_version||1
      ),

      query,

      generated_at:index.generated_at||null,

      activity_generated_at:
        directory.generated_at||null,

      activity_schema_version:4,

      activity_directory_schema_version:
        Number(directory.schema_version||0),

      activity_groups_loaded:
        [...shardCache.keys()],

      tracked_groups:
        trackedGroups(index.groups||{}),

      total_matches:unique.length,
      truncated:unique.length>MAX_RESULTS,

      matches:out
    });

  }catch(err){
    console.error(
      'member check failed',
      err
    );

    return json(
      {error:'server_error'},
      500
    );
  }
}

export async function onRequestGet(){
  return json({
    ok:true,
    service:'fajia-member-check',
    schema_version:6,
    activity_mode:'directory_shards'
  });
}
