// RENOVA · sesión de gym
// Guardar sesiones, descanso, última vez, récords, autoguardado, terminar entreno y formulario de ejercicios.
async function saveGymSession(routine,date,status,override){
  const uid=supabaseUser.id;
  let sr=await supabaseClient.from('workout_sessions').select('id').eq('user_id',uid).eq('session_date',date).eq('routine_id',routine.id).neq('status','completed').limit(1).maybeSingle();
  if(sr.error)throw sr.error;
  let sessionId=sr.data?.id;
  if(sessionId&&status){const up=await supabaseClient.from('workout_sessions').update({status}).eq('user_id',uid).eq('id',sessionId);if(up.error)throw up.error}
  if(!sessionId){
    sr=await supabaseClient.from('workout_sessions').insert({user_id:uid,routine_id:routine.id,session_date:date,status:status||(date<today()?'completed':'in_progress'),started_at:new Date().toISOString()}).select('id').single();
    if(sr.error)throw sr.error;sessionId=sr.data.id;
  }
  const day=getDay(date),sets=override?override.map(s=>({...s,user_id:uid,session_id:sessionId})):[];
  if(!override)(routine.items||[]).forEach(ex=>{const base='r'+routine.id+'_e'+ex.id;for(let n=0;n<ex.series;n++){const sv=day.exercises?.[base+'_s'+n]||{};sets.push({user_id:uid,session_id:sessionId,routine_exercise_id:ex.id,exercise_name:ex.nombre,set_number:n+1,weight_kg:toNumOrNull(sv.kg),reps_completed:toNumOrNull(sv.reps),completed:!!sv.done,rest_seconds:ex.descanso})}});
  const del=await supabaseClient.from('workout_sets').delete().eq('user_id',uid).eq('session_id',sessionId);if(del.error)throw del.error;
  if(sets.length){const ins=await supabaseClient.from('workout_sets').insert(sets);if(ins.error)throw ins.error}
  return sets.length;
}
async function saveGymRoutineToSupabase(){const status=document.getElementById('gymSaveStatus');if(!supabaseUser){toast('Inicia sesión primero');return}const routine=exercises.find(r=>r.id===data.gymSelectedRoutineId)||exercises[0];if(!routine){toast('Crea una rutina primero');return}try{await flushFinishQueue();const n=await saveGymSession(routine,today(),null);if(data.gymDirty)delete data.gymDirty[today()+'|'+routine.id];save();if(status)status.textContent='☁️ Sesión guardada: '+today()+' · '+n+' series';toast('Sesión guardada')}catch(e){console.error(e);if(status)status.textContent='No se pudo guardar (queda en este teléfono): '+(e.message||e);toast('No se pudo guardar la sesión')}}
// =====================================================================
// RENOVA · Gym v3: descanso, última vez, récords, autoguardado y cierre
// =====================================================================
function exKey(name){return norm(name).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ')}
function e1rm(kg,reps){kg=Number(kg);reps=Number(reps);if(!(kg>0)||!(reps>0))return 0;return kg*(1+Math.min(reps,15)/30)}
function fmtKg(v){const n=Number(v);return Number.isInteger(n)?String(n):n.toFixed(1)}
function shortDate(iso){const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es-CO',{day:'numeric',month:'short'})}
function setStateFor(routine,item,n,date=today()){return getDay(date).exercises?.['r'+routine.id+'_e'+item.id+'_s'+n]||{}}

// ---- Historial: sesiones de días anteriores + sesiones terminadas hoy
async function loadGymHistory(sessions){
  const uid=supabaseUser.id;
  const past=sessions.filter(s=>s.session_date<today()||s.status==='completed').sort((a,b)=>a.session_date<b.session_date?1:-1).slice(0,80);
  const sessById=new Map(past.map(s=>[s.id,s]));
  const rows=[];
  for(let i=0;i<past.length;i+=25){
    const ids=past.slice(i,i+25).map(s=>s.id);
    const r=await supabaseClient.from('workout_sets').select('session_id,exercise_name,set_number,weight_kg,reps_completed,completed').eq('user_id',uid).in('session_id',ids);
    if(r.error){console.warn('RENOVA historial gym',r.error);return}
    rows.push(...(r.data||[]));
  }
  const hist={};
  for(const s of rows){
    const ses=sessById.get(s.session_id);if(!ses)continue;
    const k=exKey(s.exercise_name);const list=(hist[k] ||= []);
    let entry=list.find(e=>e.sid===ses.id);if(!entry){entry={sid:ses.id,date:ses.session_date,name:s.exercise_name,sets:[]};list.push(entry)}
    entry.sets.push({n:Number(s.set_number||1),kg:toNumOrNull(s.weight_kg),reps:toNumOrNull(s.reps_completed),done:!!s.completed});
  }
  for(const list of Object.values(hist)){list.sort((a,b)=>a.date<b.date?1:-1);list.forEach(e=>e.sets.sort((a,b)=>a.n-b.n))}
  data.gymHistory=hist;
}
// Peso promedio por serie (solo series hechas con peso)
function avgKgOf(sets){const v=sets.filter(s=>s.done&&Number(s.kg)>0).map(s=>Number(s.kg));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function fmtAvg(v){return v==null?'—':(Math.round(v*10)/10).toString().replace('.',',')+' kg'}
function lastTime(name){const list=(data.gymHistory||{})[exKey(name)]||[];return list.find(e=>e.sets.some(s=>s.done||s.kg!=null))||null}
function bestFromHistory(name){
  let best=null,top=0;
  for(const e of (data.gymHistory||{})[exKey(name)]||[])for(const s of e.sets){
    if(!s.done||!(s.kg>0)||!(s.reps>0))continue;
    top=Math.max(top,e1rm(s.kg,s.reps));
    if(!best||s.kg>best.kg||(s.kg===best.kg&&s.reps>best.reps))best={kg:s.kg,reps:s.reps,date:e.date};
  }
  return best?{...best,e1:top}:null;
}
function isPR(name,kg,reps){
  kg=Number(kg);reps=Number(reps);if(!(kg>0)||!(reps>0))return false;
  const b=bestFromHistory(name);if(!b)return false;   // la primera vez no cuenta como récord
  return kg>b.kg||e1rm(kg,reps)>b.e1+0.01;
}

// ---- Temporizador de descanso (basado en hora real: sigue bien aunque se re-renderice)
let restEndsAt=0,restTick=null,audioCtx=null;
function beep(){try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();const o=audioCtx.createOscillator(),g=audioCtx.createGain();o.frequency.value=880;g.gain.setValueAtTime(.18,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.5);o.connect(g).connect(audioCtx.destination);o.start();o.stop(audioCtx.currentTime+.5)}catch{}}
function startRest(seconds){
  seconds=Math.max(0,Number(seconds)||0);if(!seconds)return;
  restEndsAt=Date.now()+seconds*1000;
  try{audioCtx ||= new (window.AudioContext||window.webkitAudioContext)();audioCtx.resume?.()}catch{}
  document.getElementById('restBar').classList.add('show');document.body.classList.add('resting');
  clearInterval(restTick);restTick=setInterval(updateRest,250);updateRest();
}
function addRest(sec){if(restEndsAt)restEndsAt+=sec*1000;updateRest()}
function stopRest(){clearInterval(restTick);restTick=null;restEndsAt=0;document.getElementById('restBar').classList.remove('show');document.body.classList.remove('resting')}
function updateRest(){
  const left=Math.max(0,Math.ceil((restEndsAt-Date.now())/1000));
  const el=document.getElementById('restTime');if(el)el.textContent=Math.floor(left/60)+':'+String(left%60).padStart(2,'0');
  if(left<=0&&restEndsAt){stopRest();if(navigator.vibrate)navigator.vibrate([200,100,200]);beep();toast('⏱ ¡Descanso terminado! A la siguiente serie')}
}

// ---- Rutina sugerida para hoy (rotación) y panel de Inicio
function routineDoneToday(rid){return !!data.gymDone?.[today()+'|'+rid]}
function suggestedRoutine(){
  const list=exercises||[];if(!list.length)return null;
  const doneToday=list.find(r=>routineDoneToday(r.id));if(doneToday)return doneToday;
  const log=(data.gymSessionsLog||[]).filter(s=>s.status==='completed'&&list.some(r=>r.id===s.routine_id)).sort((a,b)=>a.session_date<b.session_date?1:-1);
  if(!log.length)return list[0];
  const i=list.findIndex(r=>r.id===log[0].routine_id);
  return list[(i+1)%list.length];
}
function prepareGymScreen(){
  if(data.gymSelectedDate!==today()){const s=suggestedRoutine();if(s)data.gymSelectedRoutineId=s.id;data.gymSelectedDate=today();save()}
}
function renderTodayWorkout(){
  const host=document.getElementById('todayWorkout');if(!host)return;
  const r=suggestedRoutine();
  if(!r){host.innerHTML='<div class="row"><b>🏋️ Entrenamiento de hoy</b></div><p class="small">Aún no tienes rutinas. Créalas o impórtalas en Gym.</p><button class="btn secondary" style="width:100%" onclick="show(\'gym\')">Ir a Gym</button>';return}
  const done=routineDoneToday(r.id),day=getDay();
  let setsDone=0,setsTotal=0;const kgs=[];
  for(const it of r.items||[])for(let n=0;n<it.series;n++){setsTotal++;const sv=day.exercises['r'+r.id+'_e'+it.id+'_s'+n];if(sv?.done){setsDone++;if(Number(sv.kg)>0)kgs.push(Number(sv.kg))}}
  const items=(r.items||[]).map(it=>{const last=lastTime(it.nombre);const lk=last?avgKgOf(last.sets):null;return `<div class="wkrow"><span>${escHtml(it.nombre)}</span><span class="small">${it.series}×${escHtml(it.reps)}${lk!=null?' · ↺ '+fmtAvg(lk):''}</span></div>`}).join('');
  const status=done?'<span class="tag" style="background:#173226;color:#7ee2b0">✅ HECHO HOY</span>':setsDone?`<span class="tag">${setsDone}/${setsTotal} series</span>`:'<span class="tag">PENDIENTE</span>';
  host.innerHTML=`<div class="row"><b>🏋️ Entrenamiento de hoy</b>${status}</div><div class="wktitle">${escHtml(r.nombre||r.name)}</div><div class="small" style="margin-bottom:6px">${(r.items||[]).length} ejercicios · ${setsTotal} series${done&&data.gymLastSummary?.rid===r.id?' · peso prom. '+fmtAvg(data.gymLastSummary.avg):''}</div>${items||'<div class="small">Esta rutina no tiene ejercicios todavía.</div>'}<button class="btn" style="width:100%;margin-top:10px" onclick="openTodayWorkout('${escHtml(r.id)}')">${done?'Ver en Gym':setsDone?'Continuar entreno →':'Empezar entreno →'}</button>`;
}
function openTodayWorkout(rid){data.gymSelectedRoutineId=rid;data.gymSelectedDate=today();save();show('gym')}

// ---- Render de la sesión (ejercicios plegables)
let gymOpen=new Set(),gymOpenRoutine=null;
function exerciseProgress(routine,item){let d=0;const kgs=[];for(let n=0;n<item.series;n++){const sv=setStateFor(routine,item,n);if(sv.done){d++;if(Number(sv.kg)>0)kgs.push(Number(sv.kg))}}return {done:d,total:item.series,avg:kgs.length?kgs.reduce((a,b)=>a+b,0)/kgs.length:null}}
function toggleExercise(eid){gymOpen.has(eid)?gymOpen.delete(eid):gymOpen.add(eid);renderExercises()}
function openNextPending(routine){const next=(routine.items||[]).find(it=>{const p=exerciseProgress(routine,it);return p.done<p.total});gymOpen=new Set(next?[String(next.id)]:[])}
function renderExercises(){
  const manager=document.getElementById('gymRoutineManager'),host=document.getElementById('exercises');if(!manager||!host)return;
  const list=exercises||[];let routine=list.find(r=>r.id===data.gymSelectedRoutineId)||list[0]||null;
  if(!routine){const rs=document.getElementById('routineSetup');if(rs)rs.open=true;manager.innerHTML='<div class="card empty">Aún no tienes rutinas. Créalas o impórtalas en “➕ Crear o importar rutinas”, más abajo.</div>';host.innerHTML='';document.getElementById('gymSaveCard').style.display='none';renderRecords();return}
  data.gymSelectedRoutineId=routine.id;const rid=escHtml(routine.id);
  if(gymOpenRoutine!==routine.id){gymOpenRoutine=routine.id;openNextPending(routine)}
  const doneToday=routineDoneToday(routine.id),sug=suggestedRoutine();
  manager.innerHTML=`<div class="card"><label for="gymDaySelector"><b>¿Qué día vas a entrenar?</b></label><select id="gymDaySelector" onchange="selectGymDay(this.value)" style="margin-top:8px">${list.map(r=>`<option value="${escHtml(r.id)}" ${r.id===routine.id?'selected':''}>${routineDoneToday(r.id)?'✅ ':sug&&r.id===sug.id?'⭐ ':''}${escHtml(r.nombre||r.name)}</option>`).join('')}</select><div class="small" style="margin-top:6px">⭐ = te toca hoy según tu rotación · ✅ = ya hecho hoy</div><details class="gymtools"><summary>Opciones de la rutina</summary><div class="two" style="margin-top:8px"><button class="btn secondary" onclick="openExerciseDialog('${rid}')">+ Ejercicio</button><button class="btn secondary" onclick="editGymRoutine('${rid}')">Editar nombre</button><button class="btn secondary" onclick="duplicateGymRoutine('${rid}')">Duplicar día</button><button class="btn danger" onclick="deleteGymRoutine('${rid}')">Archivar día</button></div></details></div>`;
  document.getElementById('gymSaveCard').style.display='block';
  const items=routine.items||[];let doneSets=0,totalSets=0;const kgs=[];
  const cards=items.map((item,i)=>{
    const last=lastTime(item.nombre),best=bestFromHistory(item.nombre),prog=exerciseProgress(routine,item),open=gymOpen.has(String(item.id));
    doneSets+=prog.done;totalSets+=prog.total;
    let anyPR=false;
    const sets=Array.from({length:item.series},(_,n)=>{
      const k='r'+routine.id+'_e'+item.id+'_s'+n,sv=getDay().exercises[k]||{},prev=last?.sets.find(s=>s.n===n+1);
      if(sv.done&&Number(sv.kg)>0)kgs.push(Number(sv.kg));
      const pr=sv.done&&isPR(item.nombre,sv.kg,sv.reps);if(pr)anyPR=true;
      const ek=escHtml(k);
      return `<div class="setrow${sv.done?' isdone':''}"><label class="setchk"><input type="checkbox" aria-label="Serie ${n+1} hecha" ${sv.done?'checked':''} onchange="gymSet('${ek}','done',this.checked)"><span>${n+1}</span></label><input type="number" inputmode="decimal" min="0" step="0.5" aria-label="Peso serie ${n+1}" value="${sv.kg??''}" placeholder="${prev?.kg!=null?fmtKg(prev.kg):'kg'}" onchange="gymSet('${ek}','kg',this.value)"><input type="number" inputmode="numeric" min="0" step="1" aria-label="Repeticiones serie ${n+1}" value="${sv.reps??''}" placeholder="${prev?.reps!=null?prev.reps:'reps'}" onchange="gymSet('${ek}','reps',this.value)"><span class="prbadge">${pr?'🏆 PR':''}</span></div>`;
    }).join('');
    const lastAvg=last?avgKgOf(last.sets):null;
    const lastTxt=last?`<div class="lastline">↺ Última vez (${shortDate(last.date)}): ${last.sets.filter(s=>s.kg!=null||s.reps!=null).map(s=>`${s.kg!=null?fmtKg(s.kg):'–'}×${s.reps??'–'}`).join(' · ')}${lastAvg!=null?' · prom. '+fmtAvg(lastAvg):''}</div>`:'<div class="lastline">↺ Primera vez con este ejercicio</div>';
    const bestTxt=best?`<div class="lastline">🏆 Récord: ${fmtKg(best.kg)} kg × ${best.reps} · 1RM est. ${Math.round(best.e1)} kg</div>`:'';
    const complete=prog.done===prog.total&&prog.total>0;
    const head=`<button type="button" class="exhead" aria-expanded="${open}" onclick="toggleExercise('${escHtml(String(item.id))}')"><span class="exnum${complete?' ok':''}">${complete?'✓':i+1}</span><span class="exname">${escHtml(item.nombre)}${anyPR?' 🏆':''}<span class="small">${prog.done}/${prog.total} series${prog.avg!=null?' · prom. '+fmtAvg(prog.avg):' · '+item.series+'×'+escHtml(item.reps)}</span></span><span class="chev">${open?'▾':'▸'}</span></button>`;
    const body=open?`<div class="exbody"><div class="row" style="justify-content:space-between;gap:6px"><div class="small">${item.grupo?escHtml(item.grupo)+' · ':''}objetivo ${escHtml(item.reps)} · descanso ${item.descanso||0}s</div><div class="row" style="gap:6px"><button class="btn secondary sm" onclick="openExerciseDialog('${rid}','${escHtml(item.id)}')">Editar</button><button class="btn danger sm" aria-label="Quitar ejercicio" onclick="removeExerciseFromRoutine('${rid}','${escHtml(item.id)}')">×</button></div></div>${lastTxt}${bestTxt}<div class="sethead"><span>✓</span><span>kg</span><span>reps</span><span></span></div>${sets}</div>`:'';
    return `<div class="exercise${open?' open':''}${complete?' complete':''}">${head}${body}</div>`;
  }).join('');
  const pct=totalSets?Math.round(doneSets/totalSets*100):0,avgNow=kgs.length?kgs.reduce((a,b)=>a+b,0)/kgs.length:null;
  host.innerHTML=`<div class="card"><div class="row"><b>Sesión: ${escHtml(routine.nombre||routine.name)}</b><span class="tag">${doneSets+'/'+totalSets+' series'}</span></div><div class="progress" style="margin-top:10px"><div class="bar" style="width:${pct}%"></div></div><p class="small" style="margin-bottom:0">${doneToday?'✅ Ya terminaste esta rutina hoy. Si la repites, se guarda como una sesión nueva.<br>':''}Toca un ejercicio para abrirlo. Al marcar una serie arranca el descanso. Peso promedio hoy: <b>${fmtAvg(avgNow)}</b></p></div>${cards||'<div class="empty">Este día aún no tiene ejercicios. Usa “Opciones de la rutina → + Ejercicio”.</div>'}`;
  renderRecords();
}
function renderRecords(){
  const e=document.getElementById('gymRecords');if(!e)return;
  const names=new Map();
  for(const r of exercises||[])for(const it of r.items||[])names.set(exKey(it.nombre),it.nombre);
  for(const k of Object.keys(data.gymHistory||{}))if(!names.has(k))names.set(k,(data.gymHistory[k][0]?.name)||k);
  const rows=[...names.entries()].map(([k,n])=>({n,b:bestFromHistory(n)})).filter(x=>x.b).sort((a,b)=>b.b.e1-a.b.e1);
  e.innerHTML=rows.length?rows.map(x=>`<div class="check"><span style="flex:1"><b>${escHtml(x.n)}</b><br><span class="small">${fmtKg(x.b.kg)} kg × ${x.b.reps} · ${shortDate(x.b.date)}</span></span><span class="tag" style="flex:none">1RM ${Math.round(x.b.e1)}</span></div>`).join(''):'<div class="empty">Tus récords aparecerán después de tu primera sesión guardada.</div>';
}

// ---- Cambios en series
function gymSet(key,field,value){
  const day=getDay();const sv=(day.exercises[key] ||= {});
  const m=/^r(.+?)_e(.+)_s(\d+)$/.exec(key);
  const routine=m&&exercises.find(r=>String(r.id)===m[1]);const item=routine?.items.find(x=>String(x.id)===m[2]);
  sv[field]=value;
  if(routine){data.gymStart ||= {};data.gymStart[today()+'|'+routine.id] ||= nowIso()}
  if(field==='done'&&value&&item){
    const prev=lastTime(item.nombre)?.sets.find(s=>s.n===Number(m[3])+1);
    if((sv.kg===''||sv.kg==null)&&prev?.kg!=null)sv.kg=prev.kg;
    if((sv.reps===''||sv.reps==null)&&prev?.reps!=null)sv.reps=prev.reps;
    if(isPR(item.nombre,sv.kg,sv.reps)){toast('🏆 ¡Nuevo récord en '+item.nombre+'!');if(navigator.vibrate)navigator.vibrate([80,60,80,60,200])}
    startRest(item.descanso);
    const p=exerciseProgress(routine,item);if(p.done===p.total){gymOpen.delete(String(item.id));const next=routine.items.find(it=>{const q=exerciseProgress(routine,it);return q.done<q.total});if(next)gymOpen.add(String(next.id))}
  }
  save();renderExercises();
  if(routine)markGymDirty(routine.id);
}
function gymExercise(key,field,value){gymSet(key,field,value)}

// ---- Autoguardado en la nube (con reintento si no hay señal)
let gymSaveTimer=null,gymFlushing=false;
function setGymStatus(t){const e=document.getElementById('gymSaveStatus');if(e)e.textContent=t}
function markGymDirty(rid,date=today()){data.gymDirty ||= {};data.gymDirty[date+'|'+rid]=true;save();setGymStatus('⏳ Cambios guardados en el teléfono…');clearTimeout(gymSaveTimer);gymSaveTimer=setTimeout(flushGymDirty,2500)}
async function flushGymDirty(){
  if(gymFlushing||!supabaseUser)return;
  await flushFinishQueue();
  const keys=Object.keys(data.gymDirty||{});if(!keys.length)return;
  if(!navigator.onLine){setGymStatus('📴 Sin conexión: la sesión se subirá al volver la señal');return}
  gymFlushing=true;
  try{
    for(const k of keys){
      const [date,rid]=k.split('|');const routine=exercises.find(r=>String(r.id)===rid);
      if(!routine){delete data.gymDirty[k];continue}
      try{await saveGymSession(routine,date,null);delete data.gymDirty[k];save();setGymStatus('☁️ Sesión guardada automáticamente · '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}))}
      catch(e){console.warn('RENOVA autoguardado gym',e);setGymStatus('⏳ Guardado en el teléfono; se subirá al volver la señal');break}
    }
  }finally{gymFlushing=false}
}
window.addEventListener('online',()=>flushGymDirty());

// ---- Terminar entreno: guarda la sesión completa y deja la rutina en blanco
let finishFlushing=false;
async function flushFinishQueue(){
  if(finishFlushing||!supabaseUser||!navigator.onLine)return;
  const q=data.gymFinishQueue||[];if(!q.length)return;
  finishFlushing=true;
  try{
    for(const snap of [...q]){
      try{await saveGymSession({id:snap.rid,items:[]},snap.date,'completed',snap.sets);data.gymFinishQueue=(data.gymFinishQueue||[]).filter(x=>x!==snap);save();setGymStatus('☁️ Entreno guardado en la nube · '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}))}
      catch(e){console.warn('RENOVA guardar entreno',e);setGymStatus('⏳ Entreno guardado en el teléfono; se subirá al volver la señal');break}
    }
  }finally{finishFlushing=false}
}
async function finishWorkout(){
  const routine=exercises.find(r=>r.id===data.gymSelectedRoutineId)||exercises[0];if(!routine)return;
  const date=today(),key=date+'|'+routine.id;let done=0,total=0;const prs=[],sets=[],kgs=[];
  for(const it of routine.items||[])for(let n=0;n<it.series;n++){
    total++;const sv=setStateFor(routine,it,n);
    sets.push({routine_exercise_id:it.id,exercise_name:it.nombre,set_number:n+1,weight_kg:toNumOrNull(sv.kg),reps_completed:toNumOrNull(sv.reps),completed:!!sv.done,rest_seconds:it.descanso});
    if(sv.done){done++;if(Number(sv.kg)>0)kgs.push(Number(sv.kg));if(isPR(it.nombre,sv.kg,sv.reps)&&!prs.includes(it.nombre))prs.push(it.nombre)}
  }
  if(!done){toast('Marca al menos una serie antes de terminar');return}
  if(!confirm('¿Terminar el entreno? Se guardará en la nube y la rutina quedará en blanco para la próxima vez.'))return;
  const avg=kgs.length?kgs.reduce((a,b)=>a+b,0)/kgs.length:null;
  const first=!data.gymDone?.[key];
  data.gymDone ||= {};data.gymDone[key]=true;
  if(first){data.xp=Number(data.xp||0)+50;if(supabaseUser)queueState()}
  const start=data.gymStart?.[key];const mins=start?Math.max(1,Math.round((Date.now()-new Date(start).getTime())/60000)):null;
  // 1) cola de guardado (sobrevive sin señal)
  data.gymFinishQueue ||= [];data.gymFinishQueue.push({date,rid:routine.id,sets});
  // 2) pasa al historial local para que "Última vez" y récords se actualicen ya
  data.gymHistory ||= {};const sid='local-'+Date.now();
  for(const it of routine.items||[]){const s=sets.filter(x=>x.routine_exercise_id===it.id).map(x=>({n:x.set_number,kg:x.weight_kg,reps:x.reps_completed,done:x.completed}));if(!s.some(x=>x.done||x.kg!=null))continue;const k=exKey(it.nombre);(data.gymHistory[k] ||= []).unshift({sid,date,name:it.nombre,sets:s})}
  // 3) deja la rutina en blanco
  const prefix='r'+routine.id+'_e';const day=getDay();
  for(const k of Object.keys(day.exercises))if(k.startsWith(prefix))delete day.exercises[k];
  if(data.gymDirty)delete data.gymDirty[key];if(data.gymStart)delete data.gymStart[key];
  data.gymLastSummary={rid:routine.id,date,done,total,avg,mins,prs};
  gymOpenRoutine=null;stopRest();save();render();
  const sum=document.getElementById('gymSummary');
  sum.innerHTML=`<div class="card summary"><div class="row"><b>🏁 Entreno terminado</b><span class="tag">${first?'+50 XP':'GUARDADO'}</span></div><div class="small">${escHtml(routine.nombre||routine.name)}</div><div class="grid" style="margin-top:10px"><div class="stat"><div class="num">${done}/${total}</div><div class="label">series hechas</div></div><div class="stat"><div class="num">${fmtAvg(avg)}</div><div class="label">peso promedio por serie</div></div><div class="stat"><div class="num">${mins!=null?mins+' min':'—'}</div><div class="label">duración</div></div><div class="stat"><div class="num">${prs.length}</div><div class="label">récords nuevos</div></div></div>${prs.length?`<p class="small" style="margin-bottom:0">🏆 ${prs.map(escHtml).join(' · ')}</p>`:''}</div>`;
  sum.scrollIntoView({behavior:'smooth',block:'center'});
  toast(prs.length?'🏆 ¡Entreno con '+prs.length+' récord'+(prs.length>1?'es':'')+'!':'💪 Entreno terminado y guardado');
  if(supabaseUser)await flushFinishQueue();
}
window.addEventListener('online',()=>flushFinishQueue());

// ---- Formulario para crear/editar ejercicios (reemplaza los prompt())
function openExerciseDialog(rid,eid){
  const r=exercises.find(x=>String(x.id)===String(rid));if(!r)return;const e=eid?r.items.find(x=>String(x.id)===String(eid)):null;
  const dlg=document.getElementById('exDialog');dlg.dataset.rid=rid;dlg.dataset.eid=eid||'';
  document.getElementById('exDlgTitle').textContent=e?'Editar ejercicio':'Nuevo ejercicio';
  document.getElementById('exName').value=e?.nombre||'';document.getElementById('exGroup').value=e?.grupo||'';
  document.getElementById('exSets').value=e?.series||4;document.getElementById('exReps').value=e?.reps||'8-12';document.getElementById('exRest').value=e?.descanso??90;
  document.getElementById('exDlgMsg').textContent='';
  if(dlg.showModal)dlg.showModal();else dlg.setAttribute('open','');
  document.getElementById('exName').focus();
}
function closeExerciseDialog(){const d=document.getElementById('exDialog');if(d.close)d.close();else d.removeAttribute('open')}
async function submitExerciseDialog(ev){
  ev?.preventDefault?.();
  const dlg=document.getElementById('exDialog'),msg=document.getElementById('exDlgMsg');
  const r=exercises.find(x=>String(x.id)===dlg.dataset.rid);if(!r)return closeExerciseDialog();
  const eid=dlg.dataset.eid,name=document.getElementById('exName').value.trim().slice(0,80),group=document.getElementById('exGroup').value.trim().slice(0,60);
  const series=Math.round(Number(document.getElementById('exSets').value)),repsRaw=document.getElementById('exReps').value.trim()||'8-12',rest=Math.round(Number(document.getElementById('exRest').value));
  const b=repsBounds(repsRaw);
  if(!name){msg.textContent='Escribe el nombre del ejercicio.';return}
  if(!(series>=1&&series<=20)){msg.textContent='Las series deben ser entre 1 y 20.';return}
  if(!b){msg.textContent='Revisa las repeticiones (ej. 8-12, 15 o 30-45 segundos).';return}
  if(!(rest>=0&&rest<=900)){msg.textContent='El descanso debe estar entre 0 y 900 segundos.';return}
  if(r.items.some(x=>String(x.id)!==eid&&exKey(x.nombre)===exKey(name))){msg.textContent='Ese ejercicio ya está en esta rutina.';return}
  if(!supabaseUser){msg.textContent='Inicia sesión para guardar ejercicios.';return}
  const row={exercise_name:name,planned_sets:series,reps_min:b.min,reps_max:b.max,rest_seconds:rest,notes:'__RENOVA_IMPORT__|'+b.raw+'|'+group};
  msg.textContent='Guardando…';
  if(eid){
    const res=await supabaseClient.from('routine_exercises').update(row).eq('user_id',supabaseUser.id).eq('id',eid);
    if(res.error){msg.textContent='No se pudo guardar: '+res.error.message;return}
    Object.assign(r.items.find(x=>String(x.id)===eid),{nombre:name,grupo:group,series,reps:b.raw,descanso:rest});
  }else{
    const ins=await supabaseClient.from('routine_exercises').insert({...row,user_id:supabaseUser.id,routine_id:r.id,day_number:1,exercise_order:r.items.length+1}).select('*').single();
    if(ins.error){msg.textContent='No se pudo guardar: '+ins.error.message;return}
    r.items.push({id:ins.data.id,nombre:name,grupo:group,series,reps:b.raw,descanso:rest});
  }
  data.gymRoutines=exercises;save();closeExerciseDialog();renderExercises();toast(eid?'Ejercicio actualizado':'Ejercicio agregado');
}
function addExerciseToRoutine(id){openExerciseDialog(id)}
function editGymExercise(rid,eid){openExerciseDialog(rid,eid)}
