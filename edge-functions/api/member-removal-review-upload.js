import { getStore } from '@edgeone/pages-blob';

const STORE_NAME='fajia-member-index';

const REVIEW_KEY=
  'member-review/738719/latest.json';

const GROUP_ID='738719';

const ALLOWED_REASONS=new Set([
  'INACTIVE_72H',
  'DUAL_MEMBERSHIP_HJS_SOLO'
]);

const MAX_MEMBERS=2000;

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

const clean=(v,n=500)=>
  String(v??'').trim().slice(0,n);

const nullable=(v,n=120)=>{
  const x=clean(v,n);
  return x||null;
};

function cleanProfileUrl(v){
  const x=clean(v,600);

  if(
    /^https:\/\/www\.douban\.com\/people\/[^/?#]+\/?/i
      .test(x)
  ){
    return x;
  }

  return '';
}

function cleanGate(x){
  return {
    status:
      clean(x?.status,80)||'UNKNOWN',

    ready:
      Boolean(x?.ready)
  };
}

function cleanInactiveDetail(x){
  return {
    current_streak_start:
      nullable(x?.current_streak_start),

    matures_at:
      nullable(x?.matures_at),

    verified_current_run_id:
      nullable(
        x?.verified_current_run_id,
        180
      ),

    verified_current_at:
      nullable(x?.verified_current_at),

    activity_window_start:
      nullable(x?.activity_window_start),

    latest_activity_at:
      nullable(x?.latest_activity_at)
  };
}

function cleanDualDetail(x){
  const order=clean(
    x?.observed_join_order,
    60
  );

  const allowedOrders=new Set([
    'HJS_AFTER_NEW_GROUP',
    'HJS_BEFORE_NEW_GROUP',
    'SAME_FIRST_OBSERVATION'
  ]);

  return {
    new_group_first_seen_at:
      nullable(
        x?.new_group_first_seen_at
      ),

    hjs_group_first_seen_at:
      nullable(
        x?.hjs_group_first_seen_at
      ),

    observed_join_order:
      allowedOrders.has(order)
        ? order
        : null,

    verified_new_group_run_id:
      nullable(
        x?.verified_new_group_run_id,
        180
      ),

    verified_hjs_group_run_id:
      nullable(
        x?.verified_hjs_group_run_id,
        180
      )
  };
}

function cleanMember(raw){
  if(
    !raw ||
    typeof raw!=='object' ||
    Array.isArray(raw)
  ){
    return null;
  }

  const profileKey=clean(
    raw.profile_key,
    160
  );

  if(!profileKey)
    return null;

  const reasons=[
    ...new Set(
      (
        Array.isArray(raw.reasons)
          ? raw.reasons
          : []
      )
        .map(x=>clean(x,80))
        .filter(
          x=>ALLOWED_REASONS.has(x)
        )
    )
  ];

  if(!reasons.length)
    return null;

  const rawDetails=
    raw.reason_details &&
    typeof raw.reason_details==='object' &&
    !Array.isArray(raw.reason_details)
      ? raw.reason_details
      : {};

  const reasonDetails={};

  if(reasons.includes('INACTIVE_72H')){
    reasonDetails.INACTIVE_72H=
      cleanInactiveDetail(
        rawDetails.INACTIVE_72H
      );
  }

  if(
    reasons.includes(
      'DUAL_MEMBERSHIP_HJS_SOLO'
    )
  ){
    reasonDetails
      .DUAL_MEMBERSHIP_HJS_SOLO=
        cleanDualDetail(
          rawDetails
            .DUAL_MEMBERSHIP_HJS_SOLO
        );
  }

  return {
    profile_key:
      profileKey,

    display_name:
      clean(
        raw.display_name,
        160
      ),

    profile_url:
      cleanProfileUrl(
        raw.profile_url
      ),

    reasons,

    reason_details:
      reasonDetails,

    automatic_removal:
      false
  };
}

export async function onRequestPost({
  request,
  env
}){
  try{
    const text=await request.text();

    if(text.length>2_000_000)
      return json(
        {error:'payload_too_large'},
        413
      );

    const body=JSON.parse(
      text||'{}'
    );

    const token=String(
      body.token||''
    );

    if(
      !env?.MEMBER_INDEX_UPLOAD_TOKEN ||
      token!==
        env.MEMBER_INDEX_UPLOAD_TOKEN
    ){
      return json(
        {error:'unauthorized'},
        401
      );
    }

    const incoming=body.review;

    if(
      !incoming ||
      typeof incoming!=='object' ||
      Array.isArray(incoming)
    ){
      return json(
        {error:'invalid_review'},
        400
      );
    }

    if(
      String(
        incoming?.group?.id||''
      )!==GROUP_ID
    ){
      return json(
        {error:'invalid_group'},
        400
      );
    }

    const rawMembers=
      Array.isArray(
        incoming.members
      )
        ? incoming.members
        : [];

    if(
      rawMembers.length>
      MAX_MEMBERS
    ){
      return json(
        {error:'too_many_members'},
        400
      );
    }

    const merged=new Map();

    for(const raw of rawMembers){
      const m=cleanMember(raw);

      if(!m)
        continue;

      const key=
        m.profile_key.toLowerCase();

      const old=merged.get(key);

      if(!old){
        merged.set(
          key,
          m
        );
        continue;
      }

      old.reasons=[
        ...new Set([
          ...old.reasons,
          ...m.reasons
        ])
      ];

      old.reason_details={
        ...old.reason_details,
        ...m.reason_details
      };

      if(
        !old.display_name &&
        m.display_name
      ){
        old.display_name=
          m.display_name;
      }

      if(
        !old.profile_url &&
        m.profile_url
      ){
        old.profile_url=
          m.profile_url;
      }
    }

    const members=[
      ...merged.values()
    ];

    const inactive=members.filter(
      x=>x.reasons.includes(
        'INACTIVE_72H'
      )
    ).length;

    const dual=members.filter(
      x=>x.reasons.includes(
        'DUAL_MEMBERSHIP_HJS_SOLO'
      )
    ).length;

    const both=members.filter(
      x=>
        x.reasons.includes(
          'INACTIVE_72H'
        ) &&
        x.reasons.includes(
          'DUAL_MEMBERSHIP_HJS_SOLO'
        )
    ).length;

    const incomingGates=
      incoming.rule_gates &&
      typeof incoming.rule_gates==='object' &&
      !Array.isArray(
        incoming.rule_gates
      )
        ? incoming.rule_gates
        : {};

    const ruleGates={
      INACTIVE_72H:
        cleanGate(
          incomingGates
            .INACTIVE_72H
        ),

      DUAL_MEMBERSHIP_HJS_SOLO:
        cleanGate(
          incomingGates
            .DUAL_MEMBERSHIP_HJS_SOLO
        )
    };

    const review={
      schema_version:1,

      generated_at:
        clean(
          incoming.generated_at,
          80
        ) ||
        new Date().toISOString(),

      group:{
        id:GROUP_ID,
        name:
          '比奇堡守护爱情专案组'
      },

      policy:{
        purpose:
          'manual removal review',

        automatic_removal:
          false,

        rules_independent:
          true,

        provisional_activity_silent_included:
          false
      },

      rule_gates:
        ruleGates,

      summary:{
        review_members:
          members.length,

        inactive_72h:
          inactive,

        dual_membership_hjs_solo:
          dual,

        both_reasons:
          both,

        ready_rules:
          Object.values(
            ruleGates
          ).filter(
            x=>x.ready
          ).length
      },

      members
    };

    const store=getStore({
      name:STORE_NAME,
      consistency:'strong'
    });

    await store.setJSON(
      REVIEW_KEY,
      review
    );

    return json({
      ok:true,
      schema_version:1,
      review_key:REVIEW_KEY,
      generated_at:
        review.generated_at,
      ...review.summary
    });

  }catch(err){
    console.error(
      'member removal review upload failed',
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
    service:
      'fajia-member-removal-review-upload',
    schema_version:1,
    review_key:REVIEW_KEY
  });
}
