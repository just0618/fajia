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
    d=json.loads(p.read_text(encoding='utf-8')); members={}; byslug={}; bynum={}
    for m in d.get('members',[]):
        pk=str(m.get('profile_key') or '').strip()
        if not pk: continue
        pu=str(m.get('profile_url') or '').strip(); s=slug(pu) or pk
        members[pk]={'profile_key':pk,'display_name':str(m.get('display_name') or m.get('name') or ''),'profile_url':pu,'profile_slug':s}
        if s: byslug[s]=pk
        if pk.isdigit(): bynum[pk]=pk
    return members,byslug,bynum

def load_identities(c):
    ids={}; byslug={}; byuid={}; sc=defaultdict(set); uc=defaultdict(set)
    for r in c.execute("SELECT author_hash,author_uid,latest_name,profile_url FROM identity_map WHERE COALESCE(author_uid,'')<>''"):
        d=dict(r); h=str(d.get('author_hash') or '').strip(); u=str(d.get('author_uid') or '').strip(); pu=str(d.get('profile_url') or '').strip(); s=slug(pu)
        if not h or not u: continue
        x={'author_hash':h,'author_uid':u,'canonical_name':str(d.get('latest_name') or '').strip(),'canonical_profile_url':pu,'profile_slug':s}
        ids[h]=x
        if s:
            if s in byslug and byslug[s]['author_uid']!=u: sc[s].update([byslug[s]['author_uid'],u])
            else: byslug[s]=x
        if u:
            if u in byuid and byuid[u]['author_hash']!=h: uc[u].update([byuid[u]['author_hash'],h])
            else: byuid[u]=x
    return ids,sc,uc

def split_identities(members,member_slug,member_num,ids):
    matched={}; hist={}
    for h,x in ids.items():
        pk=member_slug.get(x['profile_slug']) if x.get('profile_slug') else None
        if not pk: pk=member_num.get(x['author_uid'])
        if pk and pk in members:
            if pk in matched and matched[pk]['author_hash']!=h: raise SystemExit(f'member identity collision: {pk}')
            method='profile_slug' if x.get('profile_slug') and member_slug.get(x['profile_slug'])==pk else 'numeric_profile_key'
            matched[pk]={**members[pk],**x,'identity_match_method':method}
        else:
            u=x['author_uid']
            hist[u]={**x,'history_key':u,'profile_key':x.get('profile_slug') or u,'display_name':x.get('canonical_name') or '','profile_url':x.get('canonical_profile_url') or '','identity_match_method':'canonical_history_only'}
    return matched,hist

def fetch_recent(c,h2key,keep):
    bucket=defaultdict(dict); totals=defaultdict(int); hs=list(h2key)
    for st in range(0,len(hs),700):
        ch=hs[st:st+700]
        if not ch: continue
        qs=','.join('?' for _ in ch)
        sql=f'''WITH r AS (
          SELECT author_hash,author_uid,canonical_key,topic_id,cid,topic_label,published_at,text,source_url,reply_to_id,
                 ROW_NUMBER() OVER(PARTITION BY author_hash ORDER BY published_at DESC,canonical_key DESC) rn,
                 COUNT(*) OVER(PARTITION BY author_hash) total_count
          FROM canonical_comments WHERE author_hash IN ({qs})
        ) SELECT * FROM r WHERE rn<=? ORDER BY author_hash,rn'''
        for rr in c.execute(sql,[*ch,keep]):
            d=dict(rr); key=h2key.get(str(d.get('author_hash') or ''))
            if not key: continue
            totals[key]=max(totals[key],int(d.get('total_count') or 0)); tid=str(d.get('topic_id') or ''); cid=str(d.get('cid') or '')
            iid=f'DB_{tid}_{cid}' if tid and cid else str(d.get('canonical_key') or '')
            bucket[key][iid]={'item_id':iid,'group_id':GROUP_ID,'source_key':f'DB_TOPIC_{tid}' if tid else '','source_label':str(d.get('topic_label') or '豆瓣历史帖子'),'source_type':'reply' if str(d.get('reply_to_id') or '').strip() else 'comment','published_at':str(d.get('published_at') or ''),'text':txt(d.get('text')),'source_url':str(d.get('source_url') or ''),'reply_to_item_id':str(d.get('reply_to_id') or ''),'origin':'canonical'}
    return bucket,totals

def live_overlay(master,canon_max,members,member_slug,member_num,matched,hist,mb,mt,hb,ht):
    stats={'identity_items_after_canonical':0,'member_joined_items':0,'history_joined_items':0,'new_items':0,'new_member_identities_resolved':0,'new_history_identities':0}
    if not master.exists(): return stats
    uid2m={x['author_uid']:pk for pk,x in matched.items() if x.get('author_uid')}; uid2m.update({u:pk for u,pk in member_num.items() if u not in uid2m})
    uid2h={u:u for u in hist}; slug2h={x['profile_slug']:u for u,x in hist.items() if x.get('profile_slug')}
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
        stats['identity_items_after_canonical']=len(rows); newm=set(); newh=set()
        for rr in rows:
            r=dict(rr)
            if str(r.get('deleted_seen_at') or '').strip(): continue
            uid=str(r.get('author_platform_id') or '').strip(); pu=str(r.get('profile_url') or '').strip(); ps=slug(pu); h=str(r.get('author_hash') or '').strip(); name=str(r.get('author_display_name') or '').strip()
            pk=member_slug.get(ps) or uid2m.get(uid)
            if pk and pk in members:
                stats['member_joined_items']+=1
                if pk not in matched:
                    matched[pk]={**members[pk],'author_hash':h,'author_uid':uid,'canonical_name':name,'canonical_profile_url':pu,'profile_slug':ps,'identity_match_method':'live_identity'}; newm.add(pk)
                    if uid: uid2m[uid]=pk
                key=pk; b=mb; t=mt
            else:
                hu=uid2h.get(uid) or slug2h.get(ps)
                if not hu:
                    hu=uid
                    hist[hu]={'author_hash':h,'author_uid':uid,'canonical_name':name,'canonical_profile_url':pu,'profile_slug':ps,'history_key':hu,'profile_key':ps or uid,'display_name':name,'profile_url':pu,'identity_match_method':'live_history_only'}
                    uid2h[uid]=hu
                    if ps: slug2h[ps]=hu
                    newh.add(hu)
                stats['history_joined_items']+=1; key=hu; b=hb; t=ht
            iid=str(r.get('item_id') or '')
            if not iid: continue
            if iid not in b[key]: t[key]+=1; stats['new_items']+=1
            b[key][iid]={'item_id':iid,'group_id':GROUP_ID,'source_key':str(r.get('source_key') or ''),'source_label':live_label(r.get('source_key')),'source_type':str(r.get('source_type') or ''),'published_at':str(r.get('published_at') or ''),'text':txt(r.get('text_raw') or r.get('text_clean')),'source_url':str(r.get('source_url') or ''),'reply_to_item_id':str(r.get('reply_to_item_id') or ''),'origin':'live_overlay'}
        stats['new_member_identities_resolved']=len(newm); stats['new_history_identities']=len(newh)
    finally: c.close()
    return stats

def finalize(x,rows,n,keep,membership):
    recent=sorted(rows.values(),key=lambda r:(str(r.get('published_at') or ''),str(r.get('item_id') or '')),reverse=True)[:keep]
    return {'profile_key':str(x.get('profile_key') or ''),'display_name':str(x.get('display_name') or x.get('canonical_name') or ''),'profile_url':str(x.get('profile_url') or x.get('canonical_profile_url') or ''),'author_uid':str(x.get('author_uid') or ''),'canonical_name':str(x.get('canonical_name') or ''),'canonical_profile_url':str(x.get('canonical_profile_url') or ''),'identity_match_method':str(x.get('identity_match_method') or ''),'membership_record_present':bool(membership),'total_count':int(n or 0),'latest_at':recent[0].get('published_at') if recent else None,'recent':recent}

def main():
    ap=argparse.ArgumentParser(); ap.add_argument('--member-index',default=str(MEMBER)); ap.add_argument('--canonical-db',default=None); ap.add_argument('--master-db',default=str(MASTER)); ap.add_argument('--output',default=str(OUT)); ap.add_argument('--keep-per-member',type=int,default=20); a=ap.parse_args()
    mp=Path(a.member_index); master=Path(a.master_db); out=Path(a.output); canon=latest_canon(a.canonical_db); keep=max(1,min(20,a.keep_per_member))
    members,member_slug,member_num=load_members(mp)
    c=sqlite3.connect(f'file:{canon}?mode=ro',uri=True); c.row_factory=sqlite3.Row
    try:
        ids,sc,uc=load_identities(c)
        if sc or uc: raise SystemExit(f'identity conflicts: slug={len(sc)} uid={len(uc)}')
        matched,hist=split_identities(members,member_slug,member_num,ids); cm=len(matched); ch=len(hist)
        canon_max=c.execute('SELECT MAX(published_at) FROM canonical_comments').fetchone()[0] or ''
        mb,mt=fetch_recent(c,{x['author_hash']:pk for pk,x in matched.items() if x.get('author_hash')},keep)
        hb,ht=fetch_recent(c,{x['author_hash']:u for u,x in hist.items() if x.get('author_hash')},keep)
    finally: c.close()
    live=live_overlay(master,canon_max,members,member_slug,member_num,matched,hist,mb,mt,hb,ht)
    rm={}; rh={}; mtotal=0; htotal=0
    for pk,x in matched.items():
        n=int(mt.get(pk,0))
        if n<=0: continue
        rm[pk]=finalize(x,mb.get(pk,{}),n,keep,True); mtotal+=n
    for u,x in hist.items():
        n=int(ht.get(u,0))
        if n<=0: continue
        rh[u]=finalize(x,hb.get(u,{}),n,keep,False); htotal+=n
    result={'schema_version':3,'generated_at':now(),'group':{'id':GROUP_ID,'name':GROUP_NAME},'source':{'canonical_db':str(canon),'canonical_max_published_at':canon_max,'live_overlay_db':str(master)},'policy':{'recent_items_per_identity':keep,'text_max_chars':500,'ip_location_uploaded':False,'membership_and_history_separated':True,'historical_identity_does_not_imply_membership':True},'stats':{'tracked_profiles':len(members),'canonical_member_identity_matched':cm,'canonical_history_only_identities':ch,'member_profiles_with_activity':len(rm),'historical_identities_with_activity':len(rh),'member_activity_count':mtotal,'historical_only_activity_count':htotal,'total_activity_count':mtotal+htotal,'live_overlay':live},'members':rm,'historical_identities':rh}
    out.parent.mkdir(parents=True,exist_ok=True); out.write_text(json.dumps(result,ensure_ascii=False,separators=(',',':')),encoding='utf-8'); sz=out.stat().st_size
    print(json.dumps({'ok':True,'schema_version':3,'canonical_db':str(canon),'canonical_max_published_at':canon_max,'output':str(out),'output_bytes':sz,'output_mib':round(sz/1024/1024,3),'tracked_profiles':len(members),'canonical_member_identity_matched':cm,'canonical_history_only_identities':ch,'member_profiles_with_activity':len(rm),'historical_identities_with_activity':len(rh),'member_activity_count':mtotal,'historical_only_activity_count':htotal,'total_activity_count':mtotal+htotal,'live_overlay':live,'keep_per_identity':keep},ensure_ascii=False,indent=2))

if __name__=='__main__': main()
