const STORAGE_KEY = 'fajia_private_feedback_v1';
const ID_KEY = 'fajia_feedback_submission_id_v1';
const API_URL = '/api/feedback';

const form = document.getElementById('feedbackForm');
const success = document.getElementById('success');
const submitBtn = document.getElementById('submitBtn');
const submitState = document.getElementById('submitState');
const reopenDetail = document.getElementById('gameReopenDetail');
const archiveFollowups = document.getElementById('archiveFollowups');
let saveTimer;

function uid(){
  if (localStorage.getItem(ID_KEY)) return localStorage.getItem(ID_KEY);
  const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
  const id = 'fb_' + Array.from(bytes, b => b.toString(16).padStart(2,'0')).join('');
  localStorage.setItem(ID_KEY,id); return id;
}

function serialize(){
  const fd = new FormData(form); const out = {};
  for (const [k,v] of fd.entries()){
    if (out[k] === undefined) out[k] = v;
    else if (Array.isArray(out[k])) out[k].push(v);
    else out[k] = [out[k], v];
  }
  return out;
}

function restore(data){
  if (!data) return;
  Object.entries(data).forEach(([name,value])=>{
    const els = form.querySelectorAll(`[name="${CSS.escape(name)}"]`);
    const values = Array.isArray(value) ? value : [value];
    els.forEach(el=>{
      if (el.type === 'checkbox' || el.type === 'radio') el.checked = values.includes(el.value);
      else el.value = value ?? '';
    });
  });
}

function saveLocal(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(serialize())); }
  catch(e){}
  document.querySelectorAll('[data-save-status]').forEach(el=>{
    el.textContent='已自动保存到当前设备';
  });
}

function scheduleSave(){
  document.querySelectorAll('[data-save-status]').forEach(el=>el.textContent='正在保存…');
  clearTimeout(saveTimer); saveTimer=setTimeout(saveLocal,180);
}

function updateConditional(){
  const reopen = form.querySelector('input[name="game_reopen"]:checked')?.value;
  reopenDetail.hidden = !(reopen === 'yes' || reopen === 'maybe');
  const archiveRole = form.querySelector('input[name="archive_role"]:checked')?.value;
  archiveFollowups.classList.toggle('is-hidden', archiveRole === 'not_seen');
}

function enforceLimit(group){
  const limit = Number(group.dataset.limit || 99);
  const checked = [...group.querySelectorAll('input[type="checkbox"]:checked')];
  if (checked.length <= limit) return;
  checked[checked.length-1].checked = false;
  const hint = group.parentElement.querySelector('.hint');
  if (hint){ const old=hint.textContent; hint.textContent=`最多选 ${limit} 项哦`; setTimeout(()=>hint.textContent=old,1400); }
}

function go(id){
  const target=document.getElementById(id); if(!target) return;
  target.scrollIntoView({behavior:'smooth',block:'start'});
}

document.querySelectorAll('[data-go]').forEach(btn=>btn.addEventListener('click',()=>go(btn.dataset.go)));

document.querySelectorAll('.limit-group').forEach(group=>{
  group.addEventListener('change',()=>enforceLimit(group));
});

form.addEventListener('input',()=>{updateConditional();scheduleSave();});
form.addEventListener('change',()=>{updateConditional();scheduleSave();});

const observer=new IntersectionObserver(entries=>{
  const visible=entries.filter(e=>e.isIntersecting).sort((a,b)=>b.intersectionRatio-a.intersectionRatio)[0];
  if(!visible) return;
  document.querySelectorAll('.step').forEach(s=>s.classList.toggle('active',s.dataset.go===visible.target.id));
},{rootMargin:'-25% 0px -55% 0px',threshold:[0,.2,.5]});
document.querySelectorAll('.panel').forEach(p=>observer.observe(p));

form.addEventListener('submit', async (e)=>{
  e.preventDefault(); saveLocal();
  submitBtn.disabled=true; submitState.textContent='正在提交…';
  const payload={
    submission_id: uid(),
    answers: serialize(),
    client_version:'feedback-page-v1',
    submitted_at_client:new Date().toISOString(),
    honeypot:''
  };
  try{
    const res=await fetch(API_URL,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
    const data=await res.json().catch(()=>({}));
    if(!res.ok) throw new Error(data.error || '提交失败');
    localStorage.setItem('fajia_feedback_last_submitted',new Date().toISOString());
    form.hidden=true; document.querySelector('.step-nav').hidden=true; success.hidden=false;
    success.scrollIntoView({behavior:'smooth',block:'start'});
    submitState.textContent='';
  }catch(err){
    submitState.textContent='暂时没有提交成功，填写内容还保存在当前设备，可以稍后再试。';
  }finally{submitBtn.disabled=false;}
});

document.getElementById('editAgain').addEventListener('click',()=>{
  success.hidden=true; form.hidden=false; document.querySelector('.step-nav').hidden=false; go('game');
});

try{restore(JSON.parse(localStorage.getItem(STORAGE_KEY)||'{}'));}catch(e){}
updateConditional(); uid();
