// RENOVA · progreso
// Mediciones, racha, día del ciclo, exportar/importar respaldo fotos de progreso (M3) y ciclo calculado según tu meta de peso.
function saveProgress(){
 const w=parseFloat(document.getElementById('weight').value),wa=parseFloat(document.getElementById('waist').value);
 if(!(w>0)||!(wa>0)){toast('Completa peso y cintura');return}
 const m={date:today(),weight:w,waist:wa};
 data.measurements=(data.measurements||[]).filter(x=>x.date!==m.date);data.measurements.push(m);
 data.measurements.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
 save();if(supabaseUser&&measurementsCloud)queueMeasurement(m);
 maybeRecalcFromWeight(w);
 toast('Medición guardada');render()
}
function renderTrend(){const e=document.getElementById('trend');if(!e)return;if(data.measurements.length<2){e.innerHTML='<div class="empty">Registra al menos 2 mediciones para ver tendencia.</div>';return}const a=data.measurements.slice(-6);const first=a[0],last=a[a.length-1],dw=(last.weight-first.weight).toFixed(1),dc=(last.waist-first.waist).toFixed(1);e.innerHTML=`<div class="grid"><div class="stat"><div class="num">${dw>0?'+':''}${dw} kg</div><div class="label">cambio de peso</div></div><div class="stat"><div class="num">${dc>0?'+':''}${dc} cm</div><div class="label">cambio de cintura</div></div></div><div class="small" style="margin-top:10px">${a.map(x=>`${escHtml(x.date)}: ${x.weight} kg · ${x.waist} cm`).join('<br>')}</div>`}
function renderHistory(){let h=document.getElementById('history');if(!data.measurements.length){h.innerHTML='<div class="empty">Aún no hay mediciones.</div>';return}h.innerHTML=data.measurements.slice().reverse().map(x=>`<div class="check"><span><b>${escHtml(x.date)}</b><br><span class="small">${x.weight} kg · ${x.waist} cm cintura</span></span></div>`).join('')}
function dayIndex(){if(!lsGet(startKey))lsSet(startKey,today());let a=new Date(lsGet(startKey)),b=new Date(today());return Math.min(cycleDays(),Math.max(1,Math.floor((b-a)/86400000)+1))}
function streak(){
 if(!checklist.length)return 0;
 const required=Math.max(1,Math.ceil(checklist.length*0.6));
 const ok=date=>{const x=data.days[date];return !!x&&checklist.filter(q=>x.checks?.[q[0]]).length>=required};
 let s=0,date=today();if(!ok(date))date=addDays(date,-1);   // hoy aún no cuenta en contra
 for(let i=0;i<365&&ok(date);i++){s++;date=addDays(date,-1)}
 return s;
}
function exportData(){let blob=new Blob([JSON.stringify({version:'RENOVA-v2',exportedAt:nowIso(),data,start:lsGet(startKey)},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RENOVA-backup-'+today()+'.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)}
function importData(e){
 const f=e.target.files[0];e.target.value='';if(!f)return;
 const r=new FileReader();
 r.onload=async()=>{
  let o;try{o=JSON.parse(r.result)}catch{toast('Archivo no válido');return}
  if(!o||!o.data||typeof o.data.days!=='object'){toast('El archivo no parece un respaldo de RENOVA');return}
  if(!confirm('Se cargará el respaldo en este dispositivo y se subirá a la nube lo que falte. Lo que ya está en la nube se conserva. ¿Continuar?'))return;
  data=Object.assign(emptyData(),o.data);data.habitsMigrated=false;
  ['measurements','customHabits','checklistItems','shoppingList','gymRoutines'].forEach(k=>{if(!Array.isArray(data[k]))data[k]=[]});
  checklist=data.checklistItems.filter(x=>Array.isArray(x)&&x[1]).map(x=>[String(x[0]),String(x[1])]);exercises=data.gymRoutines;
  if(o.start&&!lsGet(startKey))lsSet(startKey,o.start);
  save();render();
  if(supabaseUser){try{await pullFromCloud();toast('Respaldo importado y sincronizado')}catch(err){console.error(err);toast('Importado en este dispositivo; la nube se sincronizará luego')}}
  else toast('Respaldo importado');
 };
 r.readAsText(f);
}
function resetAll(){
 const n=syncQueue.length;
 if(!confirm('¿Borrar la copia de RENOVA guardada en ESTE dispositivo?\n\nTus datos en la nube NO se borran: se volverán a descargar al iniciar sesión.'+(n?'\n\n⚠️ Hay '+n+' cambios sin subir que se perderán.':'')))return;
 lsDel(KEY);lsDel(startKey);lsDel(queueKey);location.reload();
}
// =====================================================================
// RENOVA · M3 Fotos de progreso (Supabase Storage, carpeta privada)
// Ruta de cada foto: progress-photos/<user_id>/<fecha>-<ángulo>.jpg
// =====================================================================
const PHOTO_BUCKET='progress-photos';
const ANGLES=[['frente','Frente'],['perfil','Perfil'],['espalda','Espalda']];
let photoUrlCache={};            // storage_path → {url, exp}
let photoCompare={before:null,after:null,angle:'frente'};
let photoBusy=false;

function photosByDate(){const m={};for(const p of data.photos||[])(m[p.taken_on] ||= {})[p.angle]=p;return m}
function photoDates(){return Object.keys(photosByDate()).sort()}
function weightOn(date){let best=null;for(const m of data.measurements||[]){if(m.date<=date&&(!best||m.date>best.date))best=m}return best?.weight??null}

// Comprime en el teléfono antes de subir: máx. 1280 px, JPEG 82%
async function compressImage(file){
  let src;
  try{src=await createImageBitmap(file,{imageOrientation:'from-image'})}
  catch{src=await new Promise((res,rej)=>{const i=new Image();i.onload=()=>res(i);i.onerror=rej;i.src=URL.createObjectURL(file)})}
  const w=src.width,h=src.height,scale=Math.min(1,1280/Math.max(w,h));
  const c=document.createElement('canvas');c.width=Math.round(w*scale);c.height=Math.round(h*scale);
  c.getContext('2d').drawImage(src,0,0,c.width,c.height);
  return await new Promise(res=>c.toBlob(res,'image/jpeg',0.82));
}
async function signedUrls(paths){
  const now=Date.now(),need=paths.filter(p=>!(photoUrlCache[p]&&photoUrlCache[p].exp>now+60000));
  if(need.length&&supabaseUser&&navigator.onLine){
    const r=await supabaseClient.storage.from(PHOTO_BUCKET).createSignedUrls(need,3600);
    if(r.error)console.warn('RENOVA fotos',r.error);
    for(const x of r.data||[])if(x.signedUrl)photoUrlCache[x.path]={url:x.signedUrl,exp:now+3600*1000};
  }
  return Object.fromEntries(paths.map(p=>[p,photoUrlCache[p]?.url||null]));
}
function setPhotoStatus(t){const e=document.getElementById('photoStatus');if(e)e.textContent=t}

async function uploadPhoto(angle,input){
  const file=input.files&&input.files[0];input.value='';if(!file)return;
  if(!supabaseUser){toast('Inicia sesión para guardar fotos');return}
  if(!navigator.onLine){toast('Necesitas conexión para subir fotos');return}
  if(!/^image\//.test(file.type)){toast('Elige una imagen');return}
  const date=document.getElementById('photoDate')?.value||today();
  if(date>today()){toast('La fecha no puede ser futura');return}
  photoBusy=true;setPhotoStatus('⏳ Preparando y subiendo la foto…');
  try{
    const blob=await compressImage(file);
    const path=`${supabaseUser.id}/${date}-${angle}.jpg`;
    const up=await supabaseClient.storage.from(PHOTO_BUCKET).upload(path,blob,{contentType:'image/jpeg',upsert:true});
    if(up.error)throw up.error;
    const row={user_id:supabaseUser.id,taken_on:date,angle,storage_path:path};
    const ins=await supabaseClient.from('progress_photos').upsert(row,{onConflict:'user_id,taken_on,angle'});
    if(ins.error)throw ins.error;
    data.photos=(data.photos||[]).filter(p=>!(p.taken_on===date&&p.angle===angle));data.photos.push({taken_on:date,angle,storage_path:path});
    delete photoUrlCache[path];
    if(!photoCompare.after||photoCompare.after<date)photoCompare.after=date;
    save();setPhotoStatus('✅ Foto de '+ANGLES.find(a=>a[0]===angle)[1].toLowerCase()+' guardada ('+Math.round(blob.size/1024)+' KB)');toast('📸 Foto guardada');
  }catch(e){console.error('RENOVA subir foto',e);setPhotoStatus('❌ No se pudo subir: '+(e.message||e))}
  finally{photoBusy=false;renderPhotos()}
}
async function deletePhoto(date,angle){
  const p=(data.photos||[]).find(x=>x.taken_on===date&&x.angle===angle);if(!p)return;
  if(!confirm('¿Borrar la foto de '+angle+' del '+shortDate(date)+'? No se puede deshacer.'))return;
  try{
    const rm=await supabaseClient.storage.from(PHOTO_BUCKET).remove([p.storage_path]);if(rm.error)throw rm.error;
    const del=await supabaseClient.from('progress_photos').delete().eq('user_id',supabaseUser.id).eq('taken_on',date).eq('angle',angle);if(del.error)throw del.error;
    data.photos=data.photos.filter(x=>x!==p);delete photoUrlCache[p.storage_path];save();toast('Foto borrada');
  }catch(e){console.error(e);toast('No se pudo borrar la foto')}
  renderPhotos();
}
function setCompare(field,value){photoCompare[field]=value;renderPhotos()}

let photoRenderSeq=0;
async function renderPhotos(){
  const host=document.getElementById('photosCard');if(!host)return;
  const seq=++photoRenderSeq;
  const byDate=photosByDate(),dates=photoDates();
  const sel=document.getElementById('photoDate')?.value||today();
  const day=byDate[sel]||{};
  if(dates.length>=2){
    if(!dates.includes(photoCompare.before))photoCompare.before=dates[0];
    if(!dates.includes(photoCompare.after))photoCompare.after=dates.at(-1);
  }
  const wanted=[...Object.values(day).map(p=>p.storage_path)];
  const cb=byDate[photoCompare.before]?.[photoCompare.angle],ca=byDate[photoCompare.after]?.[photoCompare.angle];
  if(cb)wanted.push(cb.storage_path);if(ca)wanted.push(ca.storage_path);
  const draw=urls=>{
    if(seq!==photoRenderSeq)return;
    const slot=([a,label])=>{const p=day[a],u=p&&urls[p.storage_path];return `<div class="pslot">${p?(u?`<img src="${escHtml(u)}" alt="${label} ${escHtml(sel)}">`:'<div class="pph">Cargando…</div>'):`<div class="pph">${label}</div>`}<label class="btn ${p?'secondary':''} sm pbtn">${p?'Cambiar':'📷 '+label}<input type="file" accept="image/*" capture="environment" style="display:none" onchange="uploadPhoto('${a}',this)"></label>${p?`<button type="button" class="btn danger sm pdel" aria-label="Borrar foto de ${label}" onclick="deletePhoto('${escHtml(sel)}','${a}')">×</button>`:''}</div>`};
    const opt=(v)=>dates.map(d=>`<option value="${d}" ${d===v?'selected':''}>${escHtml(shortDate(d))}${weightOn(d)!=null?' · '+String(weightOn(d)).replace('.',',')+' kg':''}</option>`).join('');
    const cap=(d,ref)=>{const w=weightOn(d),w0=ref?weightOn(ref):null;return `${escHtml(shortDate(d))}${w!=null?' · '+String(w).replace('.',',')+' kg':''}${w!=null&&w0!=null&&ref?` <b class="${w-w0<=0?'up':'down'}">(${w-w0>0?'+':''}${(w-w0).toFixed(1).replace('.',',')} kg)</b>`:''}`};
    const cmp=dates.length>=2?`<div class="charttitle" style="margin-top:16px">Comparar</div><div class="two"><div><label class="small" for="cmpBefore">Antes</label><select id="cmpBefore" onchange="setCompare('before',this.value)">${opt(photoCompare.before)}</select></div><div><label class="small" for="cmpAfter">Después</label><select id="cmpAfter" onchange="setCompare('after',this.value)">${opt(photoCompare.after)}</select></div></div><div class="qbtns" style="margin-top:8px">${ANGLES.map(([a,l])=>`<button type="button" class="qchip${photoCompare.angle===a?' on':''}" onclick="setCompare('angle','${a}')">${l}</button>`).join('')}</div><div class="pcompare"><figure>${cb&&urls[cb.storage_path]?`<img src="${escHtml(urls[cb.storage_path])}" alt="Antes">`:'<div class="pph">Sin foto</div>'}<figcaption>${cap(photoCompare.before)}</figcaption></figure><figure>${ca&&urls[ca.storage_path]?`<img src="${escHtml(urls[ca.storage_path])}" alt="Después">`:'<div class="pph">Sin foto</div>'}<figcaption>${cap(photoCompare.after,photoCompare.before)}</figcaption></figure></div>`:'<p class="small" style="margin-bottom:0">Cuando tengas fotos de 2 fechas distintas podrás compararlas lado a lado.</p>';
    const status=document.getElementById('photoStatus')?.textContent||'';
    host.innerHTML=`<div class="row"><b>📸 Fotos de progreso</b><span class="tag">PRIVADAS</span></div><p class="small">Solo tú puedes verlas. Tómalas cada 2 semanas, con la misma luz, el mismo lugar y a la misma hora (ideal en ayunas).</p><div class="two"><div><label class="small" for="photoDate">Fecha de las fotos</label><input id="photoDate" type="date" max="${today()}" value="${escHtml(sel)}" onchange="renderPhotos()"></div><div class="small" style="align-self:end;padding-bottom:10px">${dates.length} fecha${dates.length===1?'':'s'} con fotos</div></div><div class="pslots">${ANGLES.map(slot).join('')}</div><div id="photoStatus" class="small" role="status" aria-live="polite" style="margin-top:8px">${escHtml(photoBusy?'⏳ Subiendo…':status)}</div>${cmp}`;
  };
  const cached=Object.fromEntries(wanted.map(p=>[p,photoUrlCache[p]?.url||null]));
  draw(cached);                                // inmediato, con lo que ya está en caché
  if(wanted.some(p=>!cached[p]))draw(await signedUrls(wanted));
}
async function pullPhotos(){
  const r=await supabaseClient.from('progress_photos').select('taken_on,angle,storage_path').eq('user_id',supabaseUser.id).order('taken_on');
  if(r.error){console.warn('RENOVA progress_photos',r.error);return}
  data.photos=r.data||[];
}
// ---- Ciclo calculado según tu meta de peso ------------------------------
// Ritmos con base científica: perder 0,5–1 % del peso por semana conserva la masa muscular
// (Helms et al. 2014; Garthe et al. 2011). "Según mi plan" simula semana a semana tu gasto
// (Mifflin-St Jeor × actividad) contra las calorías de tu plan, que bajan contigo al bajar de peso.
// 1 kg de grasa ≈ 7.700 kcal. Con mediciones reales (regresión lineal) se recalcula el ritmo.
const KCAL_PER_KG=7700;
const PACES={
  plan:{label:'Según mi plan de comidas',short:'Mi plan'},
  conservador:{label:'Conservador · 0,5 % por semana',short:'Conservador',r:0.005},
  moderado:{label:'Moderado · 0,75 % por semana',short:'Moderado',r:0.0075},
  rapido:{label:'Rápido · 1 % por semana (máximo recomendado)',short:'Rápido',r:0.01}
};
let cycleCols=false;   // true cuando user_app_state ya tiene las columnas del SQL 03
function cycleDays(){return Math.max(7,Number(data.cycle?.days)||84)}
function cycleEnd(){return addDays(lsGet(startKey)||today(),cycleDays()-1)}
function fmt1(n){return (Math.round(n*10)/10).toLocaleString('es-CO',{maximumFractionDigits:1})}
function latestWeight(){const m=(data.measurements||[]).filter(x=>Number(x.weight)>0).at(-1);return m?Number(m.weight):Number(data.nutritionPlan?.weight_kg)||null}
function weightNear(date){const ms=(data.measurements||[]).filter(x=>Number(x.weight)>0);const after=ms.find(x=>x.date>=date);const before=ms.filter(x=>x.date<date).at(-1);return after&&before?(Math.abs(new Date(after.date)-new Date(date))<=Math.abs(new Date(date)-new Date(before.date))?after:before).weight:(after||before)?.weight??null}
function daysBetween(a,b){return Math.round((new Date(b)-new Date(a))/86400000)}

// Gasto diario y piso de calorías para un peso dado
function energyAt(w,b){const bmr=10*w+6.25*b.height+(-5*b.age)+(b.sex==='mujer'?-161:5);return {bmr,tdee:bmr*(ACTIVITY[b.activity]?.f||1.55)}}
// Simula semana a semana hasta llegar a la meta; loss(w) = kg que bajas esa semana con peso w
function simulateWeeks(w0,goal,loss){let w=w0;for(let i=0;i<260;i++){const l=loss(w);if(!(l>0.02))return Infinity;if(w-l<=goal)return i+(w-goal)/l;w-=l}return Infinity}
function cycleOptions(b){
  const out=[],w0=b.weight,goal=b.goal,e=energyAt(w0,b),floorK=Math.max(e.bmr,b.sex==='mujer'?1200:1500);
  const p=data.nutritionPlan,adj=GOALS[p?.goal]?.adj;
  if(p&&adj<0){
    const loss=w=>{const x=energyAt(w,b);let kcal=x.tdee*(1+adj);kcal=Math.max(kcal,x.bmr,b.sex==='mujer'?1200:1500);return Math.max(0,x.tdee-kcal)*7/KCAL_PER_KG};
    const deficit=Math.max(0,e.tdee-Math.max(e.tdee*(1+adj),floorK));
    out.push({pace:'plan',kgWeek:loss(w0),deficit,weeks:simulateWeeks(w0,goal,loss),ok:true});
  }
  for(const k of ['conservador','moderado','rapido']){
    const r=PACES[k].r,deficit=w0*r*KCAL_PER_KG/7,intake=e.tdee-deficit;
    out.push({pace:k,kgWeek:w0*r,deficit,intake,weeks:simulateWeeks(w0,goal,w=>w*r),ok:intake>=floorK});
  }
  const rec=out.find(o=>o.pace==='moderado'&&o.ok)?'moderado':'conservador';
  out.forEach(o=>o.recommended=o.pace===rec);
  return {options:out,tdee:e.tdee,bmr:e.bmr};
}
// Ritmo real: regresión lineal del peso de las últimas 6 semanas (mín. 3 mediciones en 14 días)
function realPace(){
  const from=addDays(today(),-42),ms=(data.measurements||[]).filter(x=>x.date>=from&&Number(x.weight)>0);
  if(ms.length<3||daysBetween(ms[0].date,ms.at(-1).date)<14)return null;
  const xs=ms.map(m=>daysBetween(ms[0].date,m.date)),ys=ms.map(m=>Number(m.weight)),n=xs.length;
  const mx=xs.reduce((a,b)=>a+b)/n,my=ys.reduce((a,b)=>a+b)/n;
  const slope=xs.reduce((s,x,i)=>s+(x-mx)*(ys[i]-my),0)/xs.reduce((s,x)=>s+(x-mx)**2,0);
  const kgWeek=-slope*7,fitNow=my+slope*(daysBetween(ms[0].date,today())-mx);
  const goal=Number(data.cycle?.goal_kg),eta=goal&&kgWeek>0.05&&fitNow>goal?addDays(today(),Math.ceil((fitNow-goal)/(kgWeek/7))):null;
  return {kgWeek,pct:kgWeek/fitNow*100,eta,n};
}
function cycleSummary(){
  const start=lsGet(startKey)||today(),end=[cycleEnd(),today()].sort()[0];
  const ms=(data.measurements||[]).filter(m=>m.date>=start&&m.date<=end);
  const w0=Number(data.cycle?.start_kg)||ms[0]?.weight,w1=ms.at(-1)?.weight;
  const gymDates=new Set();for(const list of Object.values(data.gymHistory||{}))for(const e of list)if(e.date>=start&&e.date<=end&&e.sets?.some(s=>s.done))gymDates.add(e.date);
  const hp=[];for(let d=start;d<=end;d=addDays(d,1)){const v=habitPct(d);if(v!=null)hp.push(v)}
  return {w0,w1,waist0:ms[0]?.waist,waist1:ms.at(-1)?.waist,gym:gymDates.size,habits:hp.length?Math.round(hp.reduce((a,b)=>a+b)/hp.length):null};
}

function renderCycle(){
  const info=document.getElementById('cycleInfo');if(!info)return;
  const start=lsGet(startKey)||today(),N=cycleDays(),di=dayIndex(),c=data.cycle||{},cur=latestWeight(),goal=Number(c.goal_kg)||null;
  const sub=document.getElementById('brandSub');if(sub)sub.textContent='Construye tu mejor versión · '+N+' días';
  const reached=goal&&cur&&cur<=goal,done=di>=N||reached;
  document.getElementById('cycleTag').textContent=done?'COMPLETADO':goal?(PACES[c.pace]?.short||'META').toUpperCase():'FIJO';
  info.innerHTML=`Vas en el <b>día ${di} de ${N}</b>. Tu ciclo empezó el <b>${escHtml(shortDate(start))}</b>${di>=N?' y ya lo completaste 🎉':' y termina el <b>'+escHtml(shortDate(cycleEnd()))+'</b>'}.`;
  let html=`<div class="progress" style="margin:4px 0 10px"><div class="bar" style="width:${Math.round(di/N*100)}%"></div></div>`;
  if(goal){
    const w0=Number(c.start_kg)||cur,pct=w0>goal&&cur?Math.max(0,Math.min(100,Math.round((w0-cur)/(w0-goal)*100))):0;
    html+=`<div class="row small"><span>Inicio <b>${fmt1(w0)} kg</b></span><span>Hoy <b>${cur?fmt1(cur)+' kg':'—'}</b></span><span>Meta <b>${fmt1(goal)} kg</b></span></div><div class="progress" style="margin:6px 0 4px"><div class="bar" style="width:${pct}%;background:var(--ok)"></div></div><p class="small" style="margin:0 0 8px">${pct}% del camino · ${cur&&cur>goal?'te faltan <b>'+fmt1(cur-goal)+' kg</b>':'¡meta alcanzada!'}${c.kg_week?' · ritmo planeado −'+fmt1(c.kg_week)+' kg/sem':''}</p>`;
    const np=data.nutritionPlan;
    if(np&&c.pace&&c.pace!=='plan'&&c.kg_week&&np.kcal_target){const e=energyAt(cur||w0,{height:Number(np.height_cm),age:Number(np.age),sex:np.sex,activity:np.activity}),need=c.kg_week*KCAL_PER_KG/7,has=e.tdee-np.kcal_target;if(need-has>100)html+=`<p class="small" style="margin:0 0 8px">⚠️ Tu plan de comidas da un déficit de ~${fmtN(has)} kcal/día y este ritmo pide ~${fmtN(need)}. Con tus calorías actuales vas al ritmo "Mi plan".</p>`}
    const rp=realPace();
    if(rp){
      const slow=c.kg_week&&rp.kgWeek<c.kg_week*0.75,fast=rp.pct>1.1;
      html+=`<p class="small" style="margin:0 0 8px">📈 <b>Ritmo real:</b> ${rp.kgWeek>0?'−'+fmt1(rp.kgWeek):'+'+fmt1(-rp.kgWeek)} kg/sem (${fmt1(Math.abs(rp.pct))} % de tu peso)${rp.eta?' · a este ritmo llegas el <b>'+escHtml(shortDate(rp.eta))+'</b>':''}.${slow?' Vas más lento que el plan: revisa cuántas comidas registras como hechas o recalcula.':''}${fast?' Bajas más de 1 % por semana: sube un poco las calorías para no perder músculo.':''}</p>`;
    }else html+=`<p class="small" style="margin:0 0 8px">📈 Pésate al menos 1 vez por semana: con 3 mediciones en 2 semanas calculo tu ritmo real y la fecha en que llegas.</p>`;
  }
  if(done){
    const s=cycleSummary();
    html+=`<div class="cyclesum"><b>${reached?'🎉 ¡Llegaste a tu meta!':'🏁 Cierre del ciclo'}</b><table class="tbl"><tr><td>Peso</td><td>${s.w0?fmt1(s.w0):'—'} → <b>${s.w1?fmt1(s.w1):'—'} kg</b>${s.w0&&s.w1?' ('+(s.w1-s.w0<=0?'−':'+')+fmt1(Math.abs(s.w1-s.w0))+')':''}</td></tr><tr><td>Cintura</td><td>${s.waist0?fmt1(s.waist0):'—'} → <b>${s.waist1?fmt1(s.waist1):'—'} cm</b></td></tr><tr><td>Días de gym</td><td><b>${s.gym}</b></td></tr><tr><td>Hábitos</td><td><b>${s.habits??'—'}%</b> de cumplimiento promedio</td></tr></table><button class="btn" style="width:100%;margin-top:8px" onclick="newCycle()">Iniciar ciclo nuevo</button></div>`;
  }
  document.getElementById('cycleBody').innerHTML=html;
  const i=document.getElementById('cycleStart');if(i&&document.activeElement!==i)i.value=start;
  if(document.getElementById('cycleCalc')?.open&&!document.getElementById('cyForm'))renderCycleForm();
}
function renderCycleForm(){
  const host=document.getElementById('cycleForm');if(!host)return;
  const p=data.nutritionPlan||{},c=data.cycle||{};
  const opt=(v,l,cur)=>`<option value="${v}"${v===cur?' selected':''}>${l}</option>`;
  host.innerHTML=`<form id="cyForm" onsubmit="event.preventDefault()" oninput="updateCycleCalc()"><p class="small">Con tus datos calculo tu gasto diario y cuántas semanas te toma llegar a la meta a cada ritmo.</p><div class="formgrid">
  <div><label class="small" for="cyWeight">Peso actual (kg)</label><input id="cyWeight" type="number" step=".1" min="30" max="250" value="${latestWeight()||''}"></div>
  <div><label class="small" for="cyGoal">Peso meta (kg)</label><input id="cyGoal" type="number" step=".1" min="30" max="250" value="${c.goal_kg||''}"></div>
  <div><label class="small" for="cyHeight">Estatura (cm)</label><input id="cyHeight" type="number" min="120" max="230" value="${p.height_cm||''}"></div>
  <div><label class="small" for="cyAge">Edad</label><input id="cyAge" type="number" min="14" max="90" value="${p.age||''}"></div>
  <div><label class="small" for="cySex">Sexo</label><select id="cySex">${opt('hombre','Hombre',p.sex||'hombre')}${opt('mujer','Mujer',p.sex)}</select></div>
  <div><label class="small" for="cyAct">Actividad</label><select id="cyAct">${Object.entries(ACTIVITY).map(([k,a])=>opt(k,a.label.split(' (')[0],p.activity||'moderado')).join('')}</select></div>
  </div><div id="cyResult" style="margin-top:10px"></div></form>`;
  updateCycleCalc();
}
function cycleInputs(){const v=id=>document.getElementById(id)?.value;return {weight:parseFloat(v('cyWeight')),goal:parseFloat(v('cyGoal')),height:parseFloat(v('cyHeight')),age:parseInt(v('cyAge')),sex:v('cySex'),activity:v('cyAct')}}
function updateCycleCalc(){
  const out=document.getElementById('cyResult');if(!out)return;const b=cycleInputs();
  if(!(b.weight>0&&b.goal>0&&b.height>0&&b.age>0)){out.innerHTML='<p class="small">Completa los 4 números para ver el cálculo.</p>';return}
  const h=b.height/100,bmiGoal=b.goal/(h*h),minHealthy=18.5*h*h,maxHealthy=24.9*h*h;
  let warn=`<p class="small">Rango saludable para tu estatura (IMC 18,5–24,9): <b>${fmt1(minHealthy)}–${fmt1(maxHealthy)} kg</b>. Tu meta da IMC ${fmt1(bmiGoal)}.</p>`;
  if(b.goal>=b.weight){out.innerHTML=warn+'<p class="small">⚠️ La meta debe ser menor que tu peso actual. Este cálculo es para bajar de peso.</p>';return}
  if(bmiGoal<18.5){out.innerHTML=warn+`<p class="small">⚠️ Esa meta queda por debajo del rango saludable. Usa al menos <b>${fmt1(Math.ceil(minHealthy*10)/10)} kg</b>.</p>`;return}
  const r=cycleOptions(b),start=lsGet(startKey)||today(),elapsed=daysBetween(start,today());
  const rows=r.options.map(o=>{const fin=isFinite(o.weeks)?addDays(today(),Math.ceil(o.weeks*7)):null;return `<tr${o.ok?'':' class="muted"'}><td><b>${PACES[o.pace].short}</b>${o.recommended?' <span class="tag">RECOMENDADO</span>':''}<div class="small">−${fmt1(o.kgWeek)} kg/sem · déficit ${fmtN(o.deficit)} kcal/día${o.ok?'':' · ⚠️ comerías por debajo de tu basal'}</div></td><td>${fin?'<b>'+Math.ceil(o.weeks)+' sem</b><div class="small">'+escHtml(shortDate(fin))+'</div>':'—'}</td><td>${fin&&o.ok?`<button type="button" class="btn secondary" onclick="saveCycle('${o.pace}')">Usar</button>`:''}</td></tr>`}).join('');
  const longest=Math.max(...r.options.filter(o=>o.ok&&isFinite(o.weeks)).map(o=>o.weeks));
  out.innerHTML=warn+`<p class="small">Gasto diario estimado: <b>${fmtN(r.tdee)} kcal</b> (basal ${fmtN(r.bmr)}). Te faltan <b>${fmt1(b.weight-b.goal)} kg</b>.</p><table class="tbl cytbl"><tr><th>Ritmo</th><th>Tiempo</th><th></th></tr>${rows}</table><p class="small">Es un promedio: las primeras 1–2 semanas bajas más rápido (agua y glucógeno) y después el ritmo se estabiliza.${longest>16?' Como pasa de 16 semanas, conviene hacer 1 semana a calorías de mantenimiento cada 8–12 semanas.':''}${elapsed>0?' Los '+elapsed+' días que ya llevas se suman al ciclo.':''}</p>`;
}
function saveCycle(pace){
  const b=cycleInputs(),r=cycleOptions(b),o=r.options.find(x=>x.pace===pace);if(!o||!isFinite(o.weeks))return;
  const start=lsGet(startKey)||today(),elapsed=Math.max(0,daysBetween(start,today()));
  data.cycle={goal_kg:b.goal,start_kg:Number(data.cycle?.start_kg)||Number(weightNear(start))||b.weight,pace,kg_week:Math.round(o.kgWeek*100)/100,days:elapsed+Math.ceil(o.weeks*7)};
  if(!lsGet(startKey))lsSet(startKey,start);
  save();if(supabaseUser)queueState();
  document.getElementById('cycleCalc').open=false;render();
  toast(`Ciclo de ${cycleDays()} días · termina el ${shortDate(cycleEnd())}`);
}
function newCycle(){
  if(!confirm('¿Empezar un ciclo nuevo hoy? Tu historial se conserva.'))return;
  const reached=data.cycle?.goal_kg&&latestWeight()<=data.cycle.goal_kg;
  lsSet(startKey,today());data.cycle={days:84,start_kg:latestWeight(),goal_kg:reached?null:data.cycle?.goal_kg??null,pace:null};
  save();if(supabaseUser)queueState();render();
  const d=document.getElementById('cycleCalc');d.open=true;renderCycleForm();d.scrollIntoView({block:'start'});
}
