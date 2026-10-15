#!/usr/bin/env python3
from __future__ import annotations
import argparse,json,re,sqlite3
from collections import defaultdict
from datetime import datetime,timezone
from pathlib import Path

MEMBER=Path('/opt/fajia/runtime/douban_member_sync_v1/member_index.json')
CANON_DIR=Path('/opt/fajia/runtime/longitudinal_canonical_v1/frozen')
MASTER=Path('/opt/fajia/app/fajia_master_timeline_v1.sqlite')
OUT=Path('/opt/fajia/runtime/douban_member_sync_v1/member_activity_index.json')
GROUP_ID='761299'; GROUP_NAME='法述进修学院（旧组）'
RE_PROFILE=re.compile(r'/people/([^/?#]+)/?',re.I)

def now(): return datetime.now(timezone.utc).isoformat()
def slug(u):
    m=RE_PROFILE.search(str(u or '')); return m.group(1) if m else ''
def txt(v,n=500):
    s=str(v or '').strip(); return s if len(s)<=n else s[:n]+'…'
def latest_canon(explicit=None):
    if explicit:
        p=Path(explicit).expanduser().resolve()
        if not p.exists(): raise SystemExit(f'canonical db not found: {p}')
        return p
    xs=list(CANON_DIR.glob('douban_longitudinal_canonical_v1_FROZEN_*.sqlite'))
    if not xs: raise SystemExit(f'no canonical db under {CANON_DIR}')
    return max(xs,key=lambda p:(p.stat().st_mtime,p.name))
def live_label(k):
    m=re.match(r'DB_CHAT_(\d+)_0$',str(k or ''))
    return f'闲聊楼{m.group(1)}.0' if m else str(k or '豆瓣闲聊楼')

def load_members(p):
    d=json.loads(p.read_text(encoding='utf-8')); members={}; byslug={}
    for m in d.get('members',[]):
        pk=str(m.get('profile_key') or '').strip()
        if not pk: continue
        pu=str(m.get('profile_url') or '').strip(); s=slug(pu) or pk
        members[pk]={'profile_key':pk,'display_name':str(m.get('display_name') or m.get('name') or ''),'profile_url':pu,'profile_slug':s}
        byslug[s]=pk
    return members,byslug

def identity_indexes(con):
    byslug={}; byuid={}; sc=defaultdict(set); uc=defaultdict(set)
    for r in con.execute('SELECT author_hash,author_uid,latest_name,profile_url FROM identity_map'):
        d=dict(r); h=str(d.get('author_hash') or ''); u=str(d.get('author_uid') or ''); s=slug(d.get('profile_url'))
        if s:
            if s in byslug and str(byslug[s].get('author_uid') or '')!=u: sc[s].update([str(byslug[s].get('author_uid') or ''),u])
            else: byslug[s]=d
        if u:
            if u in byuid and str(byuid[u].get('author_hash') or '')!=h: uc[u].update([str(byuid[u].get('author_hash') or ''),h])
            else: byuid[u]=d
    return byslug,byuid,sc,uc

def resolve(members,byslug,byuid):
    matched={}; unmatched=[]
    for pk,m in members.items():
        i=byslug.get(m['profile_slug']); method='profile_slug'
        if not i and pk.isdigit(): i=byuid.get(pk); method='numeric_profile_key'
        if not i: unmatched.append(pk); continue
        matched[pk]={**m,'author_hash':str(i.get('author_hash') or ''),'author_uid':str(i.get('author_uid') or ''),'canonical_name':str(i.get('latest_name') or ''),'canonical_profile_url':str(i.get('profile_url') or ''),'identity_match_method':method}
    return matched,unmatched

def canonical_rows(con,matched,keep):
    hs=[x['author_hash'] for x in matched.values() if x['author_hash']]; h2pk={x['author_hash']:pk for pk,x in matched.items() if x['author_hash']}
    bucket=defaultdict(dict); totals=defaultdict(int)
    for st in range(0,len(hs),700):
        ch=hs[st:st+700]
        if not ch: continue
        qs=','.join('?'*len(ch))
        sql=f'''WITH r AS (
        SELECT author_hash,author_uid,canonical_key,topic_id,cid,topic_label,published_at,text,source_url,reply_to_id,
        ROW_NUMBER() OVER(PARTITION BY author_hash ORDER BY published_at DESC,canonical_key DESC) rn,
        COUNT(*) OVER(PARTITION BY author_hash) total_count
        FROM canonical_comments WHERE author_hash IN ({qs}))
        SELECT * FROM r WHERE rn<=? ORDER BY author_hash,rn'''
        for rr in con.execute(sql,[*ch,keep]):
            d=dict(rr); pk=h2pk.get(str(d['author_hash']))
            if not pk: continue
            totals[pk]=max(totals[pk],int(d['total_count'] or 0)); tid=str(d.get('topic_id') or ''); cid=str(d.get('cid') or '')
            iid=f'DB_{tid}_{cid}' if tid and cid else str(d.get('canonical_key') or '')
            bucket[pk][iid]={'item_id':iid,'group_id':GROUP_ID,'source_key':f'DB_TOPIC_{tid}' if tid else '','source_label':str(d.get('topic_label') or '豆瓣历史帖子'),'source_type':'reply' if str(d.get('reply_to_id') or '').strip() else 'comment','published_at':str(d.get('published_at') or ''),'text':txt(d.get('text')),'source_url':str(d.get('source_url') or ''),'reply_to_item_id':str(d.get('reply_to_id') or ''),'origin':'canonical'}
    return bucket,totals

def live_overlay(master,canon_max,members,matched,bucket,totals):
    stats={'identity_items_after_canonical':0,'joined_items':0,'new_items':0,'new_members_resolved':0}
    if not master.exists(): return stats,matched
    slug2pk={m['profile_slug']:pk for pk,m in members.items() if m.get('profile_slug')}; uid2pk={x['author_uid']:pk for pk,x in matched.items() if x.get('author_uid')}
    for pk in members:
        if pk.isdigit(): uid2pk.setdefault(pk,pk)
    c=sqlite3.connect(f'file:{master}?mode=ro',uri=True); c.row_factory=sqlite3.Row
    try:
        rows=c.execute('''WITH o AS (
        SELECT a.* FROM douban_author_identity_observations a JOIN (
          SELECT item_id,MAX(identity_observed_at) mx FROM douban_author_identity_observations GROUP BY item_id
        ) x ON x.item_id=a.item_id AND x.mx=a.identity_observed_at)
        SELECT ci.item_id,ci.source_key,ci.source_type,ci.published_at,ci.text_raw,ci.text_clean,ci.source_url,ci.reply_to_item_id,ci.deleted_seen_at,
               o.author_hash,o.author_platform_id,o.author_display_name,o.profile_url
        FROM content_items ci JOIN o ON o.item_id=ci.item_id
        WHERE ci.platform='douban' AND ci.source_layer='douban_chat' AND ci.published_at>? AND COALESCE(o.author_platform_id,'')<>''
        ORDER BY ci.published_at''',(canon_max or '',)).fetchall()
        stats['identity_items_after_canonical']=len(rows); newm=set()
        for rr in rows:
            r=dict(rr)
            if str(r.get('deleted_seen_at') or '').strip(): continue
            uid=str(r.get('author_platform_id') or '').strip(); pk=slug2pk.get(slug(r.get('profile_url'))) or uid2pk.get(uid)
            if not pk or pk not in members: continue
            stats['joined_items']+=1
            if pk not in matched:
                matched[pk]={**members[pk],'author_hash':str(r.get('author_hash') or ''),'author_uid':uid,'canonical_name':str(r.get('author_display_name') or ''),'canonical_profile_url':str(r.get('profile_url') or ''),'identity_match_method':'live_identity'}; newm.add(pk)
                if uid: uid2pk[uid]=pk
            iid=str(r.get('item_id') or '')
            if not iid: continue
            if iid not in bucket[pk]: totals[pk]+=1; stats['new_items']+=1
            bucket[pk][iid]={'item_id':iid,'group_id':GROUP_ID,'source_key':str(r.get('source_key') or ''),'source_label':live_label(r.get('source_key')),'source_type':str(r.get('source_type') or ''),'published_at':str(r.get('published_at') or ''),'text':txt(r.get('text_raw') or r.get('text_clean')),'source_url':str(r.get('source_url') or ''),'reply_to_item_id':str(r.get('reply_to_item_id') or ''),'origin':'live_overlay'}
        stats['new_members_resolved']=len(newm)
    finally: c.close()
    return stats,matched

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--member-index',default=str(MEMBER)); ap.add_argument('--canonical-db',default=None); ap.add_argument('--master-db',default=str(MASTER)); ap.add_argument('--output',default=str(OUT)); ap.add_argument('--keep-per-member',type=int,default=20); a=ap.parse_args()
    mp=Path(a.member_index); master=Path(a.master_db); out=Path(a.output); canon=latest_canon(a.canonical_db); keep=max(1,min(20,a.keep_per_member))
    members,_=load_members(mp)
    c=sqlite3.connect(f'file:{canon}?mode=ro',uri=True); c.row_factory=sqlite3.Row
    try:
        bs,bu,sc,uc=identity_indexes(c)
        if sc or uc: raise SystemExit(f'identity conflicts: slug={len(sc)} uid={len(uc)}')
        matched,unmatched=resolve(members,bs,bu); canon_matched=len(matched); canon_max=c.execute('SELECT MAX(published_at) FROM canonical_comments').fetchone()[0] or ''
        bucket,totals=canonical_rows(c,matched,keep)
    finally: c.close()
    live,matched=live_overlay(master,canon_max,members,matched,bucket,totals)
    rm={}; total=0
    for pk,i in matched.items():
        n=int(totals.get(pk,0)); rows=sorted(bucket.get(pk,{}).values(),key=lambda x:(x.get('published_at',''),x.get('item_id','')),reverse=True)[:keep]
        if n<=0: continue
        total+=n; rm[pk]={'profile_key':pk,'display_name':members[pk]['display_name'],'profile_url':members[pk]['profile_url'],'author_uid':i.get('author_uid',''),'canonical_name':i.get('canonical_name',''),'canonical_profile_url':i.get('canonical_profile_url',''),'identity_match_method':i.get('identity_match_method',''),'total_count':n,'latest_at':rows[0].get('published_at') if rows else None,'recent':rows}
    result={'schema_version':2,'generated_at':now(),'group':{'id':GROUP_ID,'name':GROUP_NAME},'source':{'canonical_db':str(canon),'canonical_max_published_at':canon_max,'live_overlay_db':str(master)},'policy':{'tracked_profiles_only':True,'recent_items_per_member':keep,'text_max_chars':500,'ip_location_uploaded':False,'identity_match':'profile_slug_then_numeric_uid'},'stats':{'tracked_profiles':len(members),'canonical_identity_matched':canon_matched,'profiles_with_activity':len(rm),'unmatched_profiles':len(members)-len(matched),'total_deduplicated_activity':total,'live_overlay':live},'members':rm}
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8'); sz=out.stat().st_size
    print(json.dumps({'ok':True,'schema_version':2,'canonical_db':str(canon),'canonical_max_published_at':canon_max,'output':str(out),'output_bytes':sz,'output_mib':round(sz/1024/1024,3),'tracked_profiles':len(members),'canonical_identity_matched':canon_matched,'profiles_with_activity':len(rm),'unmatched_profiles':len(members)-len(matched),'total_deduplicated_activity':total,'live_overlay':live,'keep_per_member':keep},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
