import { getStore } from '@edgeone/pages-blob';

const STORE_NAME='fajia-member-index';
const DIRECTORY_KEY='member-activity/identity-directory.json';

const ALLOWED_GROUPS=new Set(['763220','761299','761356']);
const VALID_BUCKETS=new Set(['member','historical_identity']);

const MAX_IDENTITIES=20000;
const MAX_PROFILE_KEYS=20;

const json=(d,s=200)=>new Response(
  JSON.stringify(d),
  {
    status:s,
    headers:{
      'content-type':'application/json; charset=utf-8',
      'cache-control':'no-store',
      'x-content-type-options':'nosniff'
    }
  }
);

const clean=(v,n=500)=>String(v||'').trim().slice(0,n);

function cleanGroupMap(raw){
  const out={};

  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return out;

  for(const [rawId,meta] of Object.entries(raw)){
    const id=clean(rawId,40);

    if(!ALLOWED_GROUPS.has(id))
      continue;

    out[id]={
      id,
      name:clean(meta?.name,160)||id,
      generated_at:clean(meta?.generated_at,80)||null
    };
  }

  return out;
}

function cleanIdentity(rawKey,raw){
  if(!raw||typeof raw!=='object'||Array.isArray(raw))
    return null;

  const uid=clean(raw?.author_uid||rawKey,80);

  if(!uid)
    return null;

  const profileKeys=[
    ...new Set(
      (Array.isArray(raw?.profile_keys)?raw.profile_keys:[])
        .map(x=>clean(x,160))
        .filter(Boolean)
    )
  ].slice(0,MAX_PROFILE_KEYS);

  const groups={};

  if(raw?.groups&&typeof raw.groups==='object'&&!Array.isArray(raw.groups)){
    for(const [rawId,link] of Object.entries(raw.groups)){
      const id=clean(rawId,40);

      if(!ALLOWED_GROUPS.has(id))
        continue;

      const bucket=clean(link?.bucket,40);
      const key=clean(link?.key,160);

      if(!VALID_BUCKETS.has(bucket)||!key)
        continue;

      groups[id]={bucket,key};
    }
  }

  return {
    key:uid,
    value:{
      author_uid:uid,
      display_name:clean(raw?.display_name,160),
      profile_url:clean(raw?.profile_url,600),
      profile_keys:profileKeys,
      groups
    }
  };
}

export async function onRequestPost({request,env}){
  try{
    const text=await request.text();

    if(text.length>2_000_000)
      return json({error:'payload_too_large'},413);

    const body=JSON.parse(text||'{}');
    const token=String(body.token||'');

    if(
      !env?.MEMBER_INDEX_UPLOAD_TOKEN ||
      token!==env.MEMBER_INDEX_UPLOAD_TOKEN
    ){
      return json({error:'unauthorized'},401);
    }

    const incoming=body.directory;

    if(
      !incoming ||
      !incoming.identities ||
      typeof incoming.identities!=='object' ||
      Array.isArray(incoming.identities)
    ){
      return json({error:'invalid_directory'},400);
    }

    const entries=Object.entries(incoming.identities);

    if(entries.length>MAX_IDENTITIES)
      return json({error:'too_many_identities'},400);

    const identities={};
    let groupLinks=0;

    for(const [key,raw] of entries){
      const c=cleanIdentity(key,raw);

      if(!c)
        continue;

      identities[c.key]=c.value;
      groupLinks+=Object.keys(c.value.groups).length;
    }

    const directory={
      schema_version:1,
      generated_at:clean(incoming.generated_at,80)
        ||new Date().toISOString(),

      groups:cleanGroupMap(incoming.groups),

      stats:{
        identities:Object.keys(identities).length,
        group_links:groupLinks
      },

      identities
    };

    const store=getStore({
      name:STORE_NAME,
      consistency:'strong'
    });

    await store.setJSON(DIRECTORY_KEY,directory);

    return json({
      ok:true,
      schema_version:1,
      directory_key:DIRECTORY_KEY,
      generated_at:directory.generated_at,
      identities:Object.keys(identities).length,
      group_links:groupLinks,
      groups:Object.keys(directory.groups)
    });

  }catch(err){
    console.error('member activity directory upload failed',err);
    return json({error:'server_error'},500);
  }
}

export async function onRequestGet(){
  return json({
    ok:true,
    service:'fajia-member-activity-directory-upload',
    schema_version:1,
    directory_key:DIRECTORY_KEY
  });
}
