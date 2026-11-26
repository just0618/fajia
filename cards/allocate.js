function pack(e,cap,orders){const n=e.members.length,used=Array(n).fill(0),yes=[],wait=[];let total=0;const byTime=(x,y)=>x.t-y.t||x.id-y.id;
const sorted=orders.map(o=>({...o,k:o.f.length+o.r})).sort((x,y)=>y.k-x.k||Number(y.r>0)-Number(x.r>0)||byTime(x,y));
for(const o of sorted){if(total+o.k>cap*n||o.f.some(m=>used[m]>=cap)){wait.push(o);continue}o.f.forEach(m=>used[m]++);total+=o.k;yes.push(o)}
const cars=[], counts=Array(n).fill(0);
function put(o,m,random){const i=counts[m]++;cars[i]??=Array(n).fill(null);cars[i][m]={o,m,random}}
for(const o of yes)for(const m of o.f)put(o,m,false);
for(const o of yes)for(let j=0;j<o.r;j++){const candidates=counts.map((c,m)=>({c,m})).filter(x=>x.c<cap).sort((x,y)=>x.c-y.c||x.m-y.m);put(o,candidates[0].m,true)}
return {cars,wait}}
function allocate(e){
 const orders=e.orders.map((o,id)=>({...o,id}));
 if(e.cap!=null)return pack(e,e.cap,orders);
 const n=e.members.length,counts=Array(n).fill(0);
 let random=0;
 for(const o of orders){o.f.forEach(m=>counts[m]++);random+=o.r}
 const total=counts.reduce((a,b)=>a+b,random);
 let full={cars:[],wait:orders};
 for(let k=Math.min(Math.floor(total/n),Math.min(...counts)+random);k>0;k--){
  if(counts.reduce((d,c)=>d+Math.max(0,k-c),0)>random)continue;
  const trial=pack(e,k,orders);
  if(trial.cars.length===k&&trial.cars.every(c=>c.every(Boolean))){full=trial;break}
 }
 const tail=pack(e,1,full.wait);
 return {cars:full.cars.concat(tail.cars),wait:tail.wait};
}

export {allocate};
