import {allocate} from './allocate.js';
const $=id=>document.getElementById(id),esc=v=>String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])), money=n=>'¥'+n.toFixed(2);
const cardPrice=(price,count,rate)=>Math.round(price*100/count*rate)/100;
function openCreate(){
 const d=$('dlg');
 d.innerHTML='<h2>新开一场拼车</h2><form id="create"><label>团体名称<input name="group" required maxlength="50" placeholder="填写团名"></label><label>卡种 / 批次<input name="card" required maxlength="60" placeholder="例如 WM 签售卡"></label><label>成员人数<input name="count" type="number" value="4" min="1" max="100" required></label><label>整套价格（元）<input name="price" type="number" min=".01" step=".01" required placeholder="例如 440"></label><p class="muted">每张卡价 = 整套价格 ÷ 人数 × 调价系数</p><div id="pricing"></div><p id="total" class="notice"></p><details><summary>开车上限（选填）</summary><label>最多购买几套<input name="cap" type="number" min="1" max="100" placeholder="留空，按接龙结果开车"></label></details><label>接龙截止<input name="end" type="datetime-local" required></label><button type="button" id="cancel">取消</button> <button class="primary">创建活动</button></form>';
 const form=$('create'),fields=form.elements,rows=$('pricing'),draft=[];
 function preview(){
  let sum=0;
  for(const row of rows.children){
   const price=cardPrice(Number(fields.price.value), rows.children.length, Number(row.querySelector('.factor').value));
   row.querySelector('output').textContent=money(price);
   sum+=price;
  }
  $('total').textContent='调价后合计 '+money(sum)+'　与套价差额 '+money(sum-Number(fields.price.value));
 }
 function resize(){
  const count=Number(fields.count.value);
  if(!Number.isInteger(count)||count<1||count>100)return;
  Array.from(rows.children).forEach((row,i)=>draft[i]=[row.querySelector('.member').value,row.querySelector('.factor').value]);
  rows.replaceChildren();
  for(let i=0;i<count;i++){
   const row=document.createElement('div');
   row.style='display:grid;grid-template-columns:1.3fr 1fr auto;align-items:end;gap:8px';
   row.innerHTML='<label>成员 '+(i+1)+'<input class="member" required maxlength="40"></label><label>调价系数<input class="factor" type="number" min=".01" step=".01" required></label><output style="padding-bottom:8px"></output>';
   row.querySelector('.member').value=draft[i]?.[0]||'';
   row.querySelector('.factor').value=draft[i]?.[1]??'1.00';
   rows.append(row);
  }
  preview();
 }
 fields.count.oninput=resize;fields.price.oninput=preview;rows.oninput=preview;
 $('cancel').onclick=()=>d.close();resize();d.showModal();
 form.onsubmit=async ev=>{
  ev.preventDefault();
  const group=fields.group.value.trim(),card=fields.card.value.trim(),deadline=Date.parse(fields.end.value);
  const members=Array.from(rows.querySelectorAll('.member'),v=>v.value.trim()),rates=Array.from(rows.querySelectorAll('.factor'),v=>Number(v.value));
  if(!group||!card||members.some(x=>!x)||new Set(members).size!==members.length||deadline<=Date.now())return alert('请填写团名、卡种、不重复的成员名，并选择未来的截止时间。');
  await busy(form,async()=>{const result=await post('api/events',{group,card,members,rates,price:Number(fields.price.value),cap:fields.cap.value?Number(fields.cap.value):null,deadline});location.href=eventUrl(result.id);});
 };
}
let me, modes, event, tab=0, intent, polling=false;
const pagePath = location.pathname.slice(new URL(document.baseURI).pathname.length);
const code = /^e\/([A-Z2-9]{10})$/.exec(pagePath)?.[1];
function eventUrl(id) {
 return new URL('e/' + id, document.baseURI).href;
}
function status(s){$('status').textContent=s}
async function api(path, opts) {
 const response = await fetch(path, opts);
 if (!response.ok) {
  const detail = await response.json().catch(() => null);
  throw Error(detail?.error || '小卡接口暂时不可用（HTTP ' + response.status + '），请稍后重试。');
 }
 return response.json();
}
const post=(p,b={})=>api(p,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(b)});
async function busy(form,fn){const btns=form.querySelectorAll('button');btns.forEach(x=>x.disabled=true);try{await fn()}catch(x){alert(x.message)}finally{btns.forEach(x=>x.disabled=false)}}
const safe=fn=>async ev=>{try{await fn(ev)}catch(e){alert(e.message)}};
async function load(){({user:me,modes}=await api('api/me'));$('account').textContent=me?me.nick:'登录';if(code){event=await api('api/events/'+code);render()}else await home()}
async function home(){const list=me?await api('api/events'):[];$('title').textContent='我的拼车';$('sub').textContent='输入活动码，或从车主分享的链接进入。';$('nav').innerHTML='';
$('body').innerHTML='<section class="panel"><h2>加入一场拼车</h2><form id="find"><label>活动码<input id="code" maxlength="10" required autocapitalize="characters" placeholder="10 位字母或数字"></label><button class="primary">进入活动</button></form></section><section class="panel"><h2>我开过或参加的活动</h2>'+list.map(v=>'<p><a href="e/'+v.id+'">'+esc(v.name)+'</a> · '+(v.owner?'我是车主':'已参与')+'</p>').join('')+(list.length?'':me?'还没有活动。':'登录后可在这里找回活动。')+'</section>';
$('find').onsubmit=safe(async ev=>{ev.preventDefault();const value=$('code').value.trim().toUpperCase();if(!/^[A-Z2-9]{10}$/.test(value))throw Error('请核对十位活动码');await api('api/events/'+value);location.href=eventUrl(value)})}
function account(bind=false){
 const d=$('dlg');if(me&&!bind){d.innerHTML='<h2>我的账号</h2><small>UID '+esc(me.uid)+'</small><p>已关联 '+me.methods.map(k=>({email:'邮箱',phone:'手机号',trial:'试用账号'})[k]).join('、')+'</p><form id="rename"><label>接龙昵称<input required maxlength="24" value="'+esc(me.nick)+'"></label><button>保存昵称</button></form><p id="links"></p><button id="logout">退出登录</button> <button id="back">返回</button>';
 $('rename').onsubmit=safe(async ev=>{ev.preventDefault();await post('api/nick',{nick:ev.target.querySelector('input').value});d.close();await load()});if((modes.email&&!me.methods.includes('email'))||(modes.phone&&!me.methods.includes('phone'))){$('links').innerHTML='<button id="bind">绑定手机号或邮箱</button>';$('bind').onclick=()=>account(true)}$('logout').onclick=safe(async()=>{await post('api/logout');d.close();intent=null;await load()});$('back').onclick=()=>d.close();if(!d.open)d.showModal();return}
 const choices=['email','phone','trial'].filter(k=>modes[k]&&(!bind||k!=='trial'&&!me.methods.includes(k)));d.innerHTML='<h2>'+(bind?'绑定账号':'登录小卡车站')+'</h2><form id="auth"><select id="mode">'+choices.map(k=>'<option value="'+k+'">'+({trial:'好友试用账号',email:'邮箱验证码',phone:'手机验证码'})[k]+'</option>').join('')+'</select><div id="credentials"></div><button class="primary" id="submitAuth">继续</button> <button type="button" id="cancelAuth">取消</button></form>';
 function fields(){const trial=$('mode').value==='trial',k=$('mode').value;
 $('credentials').innerHTML=!choices.length?'请联系车主开通登录渠道。':'<label>'+(trial?'试用账号':k==='email'?'邮箱':'中国大陆手机号')+'<input id="loginId" type="'+(k==='email'?'email':'text')+'" required></label>'+(trial?'<label>密码<input type="password" id="pw" minlength="8" maxlength="128" required></label><label><input type="checkbox" id="reg"> 首次使用，注册试用账号</label><div id="extra"></div>':'<button type="button" id="send">发送验证码</button><label>六位验证码<input inputmode="numeric" id="otp" required pattern="[0-9]{6}"></label>')+(!bind&&!trial?'<label>首次登录昵称（选填）<input id="nickname" maxlength="24"></label>':'');$('submitAuth').disabled=!choices.length;
 if($('reg'))$('reg').onchange=()=>{$('extra').innerHTML=$('reg').checked?'<label>好友邀请码<input id="invite" required></label><label>接龙昵称<input id="nickname" required maxlength="24"></label>':''};
 if($('send'))$('send').onclick=()=>busy($('auth'),async()=>{await post('api/auth/send',{kind:k,login:$('loginId').value,bind});$('send').textContent='已发送 · 60 秒后可重发'})}
 fields();$('mode').onchange=fields;$('cancelAuth').onclick=()=>{intent=null;d.close()};$('auth').onsubmit=ev=>{ev.preventDefault();busy($('auth'),async()=>{await post('api/auth/login',{kind:$('mode').value,login:$('loginId').value,password:$('pw')?.value,register:$('reg')?.checked,invite:$('invite')?.value,nick:$('nickname')?.value,code:$('otp')?.value,bind});d.close();const next=intent;intent=null;await load();if(next)next()})};if(!d.open)d.showModal()
}
function authFirst(fn){if(me)fn();else{intent=fn;account()}}
async function ensureSession() {
 if (!modes) await load();
}
$('account').onclick = safe(async () => {
 await ensureSession();
 account();
});
$('new').onclick = safe(async () => {
 await ensureSession();
 authFirst(openCreate);
});
function go(i){tab=i;render()}
function render(){const e=event, result=allocate(e);for(const h of e.holds){const c=result.cars[h.i];if(c&&!c[h.m])c[h.m]={o:{id:-1,name:'车主自留',t:h.t,mine:e.owner},m:h.m,random:false}}
 const full=result.cars.filter(c=>c.every(Boolean)).length,m=i=>esc(e.members[i]),time=t=>new Date(t).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'}),unit=i=>cardPrice(e.price,e.members.length,e.rates[i]);
 $('title').textContent=e.name;$('sub').textContent='车主 '+e.host+'　·　已拼满 '+full+' 套　·　'+(e.closed?'已截止':'接龙中');
 $('nav').innerHTML='<a href="./">我的活动</a> '+['车次看板','接龙记录','我的卡',...(e.owner?['车主管理']:[])].map((s,i)=>'<button data-tab="'+i+'" class="'+(tab===i?'on':'')+'">'+s+'</button>').join('');
 for(const button of $('nav').querySelectorAll('[data-tab]'))button.onclick=()=>go(+button.dataset.tab);
 const card=x=>m(x.m)+(x.random?'（随机）':''),sorted=c=>c.filter(Boolean).sort((a,b)=>a.o.t-b.o.t||a.o.id-b.o.id);
 const ticket=(c,i)=>'<article class="ticket '+(c.every(Boolean)?'':'pending')+'"><header><h3>第 '+(i+1)+' 车</h3><b>'+(c.every(Boolean)?'✓ 已成车':'待补 · 缺 '+c.flatMap((x,j)=>x?[]:[m(j)]).join('、'))+'</b></header><section>'+sorted(c).map(x=>'<div class="row"><span><small>'+time(x.o.t)+'</small>　'+esc(x.o.name)+'</span><b>'+card(x)+'</b></div>').join('')+'</section></article>';
 let body='<section class="panel"><div class="row"><b>活动码 '+e.id+'</b><button id="share">复制活动链接</button></div></section>';
 if(tab===0)body+='<div class="grid"><section class="panel"><h2>车次名单</h2><small>'+(e.closed?'截止排车结果':'实时预排，截止前结果可能变化')+'</small>'+result.cars.map(ticket).join('')+'</section><aside><section class="panel"><h2>参与接龙</h2>'+(e.closed?'本场已截止':!me?'<button id="joinLogin">登录后接龙</button>':'<form id="join"><p>接龙昵称　'+esc(me.nick)+'</p><label>指定成员</label><div class="chips">'+e.members.map((v,i)=>'<label class="chip"><input type="checkbox" value="'+i+'">'+m(i)+'</label>').join('')+'</div><label>再带几张随机卡<input type="number" id="rand" min="0" max="99" value="0" required></label><button class="primary">提交接龙</button></form>')+'</section><section class="panel"><h2>本场卡价</h2><p>整套 '+money(e.price)+'</p>'+e.members.map((_,i)=>'<div class="row">'+m(i)+'<b>'+money(unit(i))+'</b></div>').join('')+'</section></aside></div>';
 if(tab===1)body+='<section class="panel"><h2>接龙记录</h2>'+e.orders.map((o,i)=>'<div class="row"><span>'+time(o.t)+'　'+esc(o.name)+' · '+o.f.map(m).join('＋')+(o.r?'＋随机 × '+o.r:'')+'</span>'+ (result.wait.some(x=>x.id===i)?'候补':'已排位')+'</div>').join('')+'</section>';
 if(tab===2){let sum=0;body+='<section class="panel"><h2>我的卡</h2>'+(me?result.cars.map((c,i)=>{const x=c.filter(x=>x?.o.mine);if(!x.length)return '';const total=x.reduce((v,x)=>v+unit(x.m),0);if(c.every(Boolean))sum+=total;return '<p>第 '+(i+1)+' 车 · '+(c.every(Boolean)?'已成车':'待补位')+' · '+x.map(card).join('、')+' · '+money(total)+'</p>'}).join('')+'<p>已成车卡款 '+money(sum)+'</p>'+ (result.wait.some(x=>x.mine)?'有报名仍在候补。':''):'<button id="joinLogin">登录查看</button>')+'</section>'}
 if(tab===3&&e.owner)body+='<section class="panel"><h2>车主管理</h2><p>截止 '+new Date(e.deadline).toLocaleString('zh-CN')+' · 建议购买 '+full+' 套</p>'+(e.closed?'接龙已截止':'<button id="close">截止接龙</button>')+(e.closed?result.cars.map((c,i)=>c.every(Boolean)?'':'<p>第 '+(i+1)+' 车 · 缺 '+c.flatMap((x,j)=>x?[]:[m(j)]).join('、')+' <button data-hold="'+i+'">车主自留空位</button></p>').join(''):'')+'</section>';
 $('body').innerHTML=body;
 $('share').onclick=safe(async()=>{try{await navigator.clipboard.writeText(eventUrl(e.id));status('已复制本场活动链接')}catch{prompt('复制本场活动链接',eventUrl(e.id))}});
 if($('joinLogin'))$('joinLogin').onclick=()=>account();
 if($('join')){const key=crypto.randomUUID();$('join').onsubmit=ev=>{ev.preventDefault();busy(ev.target,async()=>{await post('api/events/'+code+'/join',{key,f:[...$('join').querySelectorAll(':checked')].map(x=>+x.value),r:+$('rand').value});tab=2;await load()})}}
 if($('close'))$('close').onclick=safe(async()=>{if(confirm('确认截止本场接龙？')){await post('api/events/'+code+'/close');await load()}});
 for(const btn of $('body').querySelectorAll('[data-hold]'))btn.onclick=safe(async()=>{if(confirm('确认车主自留这些空位？')){await post('api/events/'+code+'/hold',{i:+btn.dataset.hold});await load()}})
}
load().catch(e=>{$('title').textContent='暂时无法打开';$('body').innerHTML='<a href="./">返回我的活动</a>';status(e.message)});
setInterval(async()=>{if(!code||polling||document.hidden||$('dlg').open||$('join')?.querySelector(':checked')||$('rand')?.value>0)return;polling=true;try{const e=await api('api/events/'+code);if(JSON.stringify(e)!==JSON.stringify(event)){event=e;render()}}catch{}finally{polling=false}},6000);
