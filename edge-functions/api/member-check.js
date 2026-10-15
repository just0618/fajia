import { getStore } from '@edgeone/pages-blob';

const STORE_NAME='fajia-member-index';
const INDEX_KEY='member-index/latest.json';
const ACTIVITY_KEY='member-activity/latest.json';
const MAX_RESULTS=20;
const ALLOWED_GROUPS=new Set(['763220','761299','761356']);
const VALID_STATUSES=new Set(['CURRENT','MISSING','EXITED']);

const json=(data,status=200)=>new Response(JSON.stringify(data),{
  status,
  headers:{
    'content-type':'application/json; charset=utf-8',
    'cache-control':'no-store',
    'x-content-type-options':'nosniff',
    'referrer-policy':'no-referrer'
  }
});

const norm=v=>String(v||'').trim().toLowerCase();

function extractProfileKey(q){
  const m=String(q||'').trim().match(/douban\.com\/people\/([^/?#]+)/i);
  return m?decodeURIComponent(m[1]):'';
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
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  const status=String(x.status||'').toUpperCase();
  if(!VALID_STATUSES.has(status))return null;
  return{
    status,
    first_seen_at:x.first_seen_at||null,
    last_seen_at:x.last_seen_at||null,
    missing_since:x.missing_since||null,
    exit_confirmed_at:x.exit_confirmed_at||null,
    rejoined_count:Math.max(0,Number(x.rejoined_count||0)||0)
  };
}

function cleanActivity(x){
  if(!x||typeof x!=='object'||Array.isArray(x))return null;
  return{
    group_id:'761299',
    total_count:Math.max(0,Number(x.total_count||0)||0),
    latest_at:x.latest_at||null,
    recent:(Array.isArray(x.recent)?x.recent:[]).slice(0,20).map(i=>({
      item_id:String(i?.item_id||''),
      source_key:String(i?.source_key||''),
      source_label:String(i?.source_label||''),
      source_type:String(i?.source_type||''),
      published_at:i?.published_at||null,
      text:String(i?.text||''),
      source_url:String(i?.source_url||''),
      reply_to_item_id:String(i?.reply_to_item_id||'')
    }))
  };
}

function compactMember(m,meta={},activityIndex=null){
  const current=new Set(
    Array.isArray(m.groups)?m.groups.map(String).filter(id=>ALLOWED_GROUPS.has(id)):[]
  );
  const memberships={};

  if(m.memberships&&typeof m.memberships==='object'&&!Array.isArray(m.memberships)){
    for(const [id,x] of Object.entries(m.memberships)){
      if(!ALLOWED_GROUPS.has(String(id)))continue;
      const s=cleanState(x);
      if(s)memberships[String(id)]=s;
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
  return{
    profile_key:pk,
    display_name:String(m.display_name||m.name||''),
    username:String(m.username||''),
    profile_url:String(m.profile_url||''),
    groups:[...current].map(id=>({
      id,
      name:meta?.[id]?.name||id,
      is_member:true
    })),
    memberships,
    activity:cleanActivity(activityIndex?.members?.[pk])
  };
}

export async function onRequestPost({request,env}){
  try{
    const body=await request.json();
    const token=String(body.token||'');
    const query=String(body.query||'').trim();

    if(!env?.MEMBER_CHECK_TOKEN||token!==env.MEMBER_CHECK_TOKEN){
      return json({error:'unauthorized'},401);
    }
    if(!query||query.length>200)return json({error:'invalid_query'},400);

    const pk=extractProfileKey(query);
    if(!pk&&query.length<2)return json({error:'query_too_short'},400);

    const store=getStore({name:STORE_NAME,consistency:'strong'});
    const index=await store.get(INDEX_KEY,{type:'json',consistency:'strong'});
    if(!index||!Array.isArray(index.members))return json({error:'index_not_ready'},503);

    let activityIndex=null;
    try{
      activityIndex=await store.get(ACTIVITY_KEY,{type:'json',consistency:'strong'});
    }catch(_){
      activityIndex=null;
    }

    const q=norm(pk||query),scored=[];
    for(const m of index.members){
      const key=norm(m.profile_key);
      const name=norm(m.display_name||m.name);
      const username=norm(m.username);
      const url=norm(m.profile_url);
      let score=0;
      if(pk&&key===q)score=100;
      else if(key===q||username===q)score=95;
      else if(name===q)score=90;
      else if(name.startsWith(q)||username.startsWith(q)||key.startsWith(q))score=70;
      else if(name.includes(q)||username.includes(q)||key.includes(q)||url.includes(q))score=50;
      if(score)scored.push({score,member:m});
    }

    scored.sort((a,b)=>
      b.score-a.score||
      String(a.member.display_name||'').localeCompare(String(b.member.display_name||''),'zh-CN')
    );

    return json({
      ok:true,
      schema_version:Number(index.schema_version||1),
      query,
      generated_at:index.generated_at||null,
      activity_generated_at:activityIndex?.generated_at||null,
      tracked_groups:trackedGroups(index.groups||{}),
      total_matches:scored.length,
      truncated:scored.length>MAX_RESULTS,
      matches:scored
        .slice(0,MAX_RESULTS)
        .map(({member})=>compactMember(member,index.groups||{},activityIndex))
    });
  }catch(err){
    console.error('member check failed',err);
    return json({error:'server_error'},500);
  }
}

export async function onRequestGet(){
  return json({ok:true,service:'fajia-member-check',schema_version:3});
}
