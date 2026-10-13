// RENOVA · sesión de gym
// Guardar sesiones, descanso, última vez, récords, autoguardado, terminar entreno y formulario de ejercicios.
async function saveGymSession(routine,date,status){
  const uid=supabaseUser.id;
  let sr=await supabaseClient.from('workout_sessions').select('id').eq('user_id',uid).eq('session_date',date).eq('routine_id',routine.id).limit(1).maybeSingle();
  if(sr.error)throw sr.error;
  let sessionId=sr.data?.id;
  if(sessionId&&status){const up=await supabaseClient.from('workout_sessions').update({status}).eq('user_id',uid).eq('id',sessionId);if(up.error)throw up.error}
  if(!sessionId){
    sr=await supabaseClient.from('workout_sessions').insert({user_id:uid,routine_id:routine.id,session_date:date,status:status||(date<today()?'completed':'in_progress'),started_at:new Date().toISOString()}).select('id').single();
    if(sr.error)throw sr.error;sessionId=sr.data.id;
  }
  const day=getDay(date),sets=[];
  (routine.items||[]).forEach(ex=>{const base='r'+routine.id+'_e'+ex.id;for(let n=0;n<ex.series;n++){const sv=day.exercises?.[base+'_s'+n]||{};sets.push({user_id:uid,session_id:sessionId,routine_exercise_id:ex.id,exercise_name:ex.nombre,set_number:n+1,weight_kg:toNumOrNull(sv.kg),reps_completed:toNumOrNull(sv.reps),completed:!!sv.done,rest_seconds:ex.descanso})}});
  const del=await supabaseClient.from('workout_sets').delete().eq('user_id',uid).eq('session_id',sessionId);if(del.error)throw del.error;
  if(sets.length){const ins=await supabaseClient.from('workout_sets').insert(sets);if(ins.error)throw ins.error}
  return sets.length;
}
async function saveGymRoutineToSupabase(){const status=document.getElementById('gymSaveStatus');if(!supabaseUser){toast('Inicia sesión primero');return}const routine=exercises.find(r=>r.id===data.gymSelectedRoutineId)||exercises[0];if(!routine){toast('Crea una rutina primero');return}try{const n=await saveGymSession(routine,today(),data.gymDone?.[today()+'|'+routine.id]?'completed':null);if(data.gymDirty)delete data.gymDirty[today()+'|'+routine.id];save();if(status)status.textContent='☁️ Sesión guardada: '+today()+' · '+n+' series';toast('Sesión guardada')}catch(e){console.error(e);if(status)status.textContent='No se pudo guardar (queda en este teléfono): '+(e.message||e);toast('No se pudo guardar la sesión')}}
// =====================================================================
// RENOVA · Gym v3: descanso, última vez, récords, autoguardado y cierre
// =====================================================================
function exKey(name){return norm(name).normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/\s+/g,' ')}
function e1rm(kg,reps){kg=Number(kg);reps=Number(reps);if(!(kg>0)||!(reps>0))return 0;return kg*(1+Math.min(reps,15)/30)}
function fmtKg(v){const n=Number(v);return Number.isInteger(n)?String(n):n.toFixed(1)}
function shortDate(iso){const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d).toLocaleDateString('es-CO',{day:'numeric',month:'short'})}
function setStateFor(routine,item,n,date=today()){return getDay(date).exercises?.['r'+routine.id+'_e'+item.id+'_s'+n]||{}}

// ---- Historial (sesiones anteriores a hoy), por nombre de ejercicio
async function loadGymHistory(sessions){
  const uid=supabaseUser.id;
  const past=sessions.filter(s=>s.session_date<today()).sort((a,b)=>a.session_date<b.session_date?1:-1).slice(0,80);
  const dateBySession=new Map(past.map(s=>[s.id,s.session_date]));
  const rows=[];
  for(let i=0;i<past.length;i+=25){
    const ids=past.slice(i,i+25).map(s=>s.id);
    const r=await supabaseClient.from('workout_sets').select('session_id,exercise_name,set_number,weight_kg,reps_completed,completed').eq('user_id',uid).in('session_id',ids);
    if(r.error){console.warn('RENOVA historial gym',r.error);return}
    rows.push(...(r.data||[]));
  }
  const hist={};
  for(const s of rows){
    const date=dateBySession.get(s.session_id);if(!date)continue;
    const k=exKey(s.exercise_name);const list=(hist[k] ||= []);
    let entry=list.find(e=>e.date===date);if(!entry){entry={date,name:s.exercise_name,sets:[]};list.push(entry)}
    entry.sets.push({n:Number(s.set_number||1),kg:toNumOrNull(s.weight_kg),reps:toNumOrNull(s.reps_completed),done:!!s.completed});
  }
  for(const list of Object.values(hist)){list.sort((a,b)=>a.date<b.date?1:-1);list.forEach(e=>e.sets.sort((a,b)=>a.n-b.n))}
  data.gymHistory=hist;
}
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

// ---- Render de la sesión
function renderExercises(){
  const manager=document.getElementById('gymRoutineManager'),host=document.getElementById('exercises');if(!manager||!host)return;
  const list=exercises||[];let routine=list.find(r=>r.id===data.gymSelectedRoutineId)||list[0]||null;
  if(!routine){manager.innerHTML='<div class="card empty">Aún no tienes rutinas. Crea una o impórtalas desde Excel.</div>';host.innerHTML='';document.getElementById('gymSaveCard').style.display='none';renderRecords();return}
  data.gymSelectedRoutineId=routine.id;const rid=escHtml(routine.id);
  const doneKey=today()+'|'+routine.id,finished=!!data.gymDone?.[doneKey];
  manager.innerHTML=`<div class="card"><label for="gymDaySelector"><b>¿Qué día vas a entrenar?</b></label><select id="gymDaySelector" onchange="selectGymDay(this.value)" style="margin-top:8px">${list.map(r=>`<option value="${escHtml(r.id)}" ${r.id===routine.id?'selected':''}>${data.gymDone?.[today()+'|'+r.id]?'✅ ':''}${escHtml(r.nombre||r.name)}</option>`).join('')}</select><div class="two" style="margin-top:10px"><button class="btn secondary" onclick="openExerciseDialog('${rid}')">+ Ejercicio</button><button class="btn secondary" onclick="editGymRoutine('${rid}')">Editar nombre</button><button class="btn secondary" onclick="duplicateGymRoutine('${rid}')">Duplicar día</button><button class="btn danger" onclick="deleteGymRoutine('${rid}')">Archivar día</button></div></div>`;
  document.getElementById('gymSaveCard').style.display='block';
  const items=routine.items||[];let doneSets=0,totalSets=0,volume=0;
  const cards=items.map((item,i)=>{
    const last=lastTime(item.nombre),best=bestFromHistory(item.nombre);
    const sets=Array.from({length:item.series},(_,n)=>{
      const k='r'+routine.id+'_e'+item.id+'_s'+n,sv=getDay().exercises[k]||{},prev=last?.sets.find(s=>s.n===n+1);
      totalSets++;if(sv.done){doneSets++;volume+=(Number(sv.kg)||0)*(Number(sv.reps)||0)}
      const pr=sv.done&&isPR(item.nombre,sv.kg,sv.reps);
      const ek=escHtml(k);
      return `<div class="setrow${sv.done?' isdone':''}"><label class="setchk"><input type="checkbox" aria-label="Serie ${n+1} hecha" ${sv.done?'checked':''} onchange="gymSet('${ek}','done',this.checked)"><span>${n+1}</span></label><input type="number" inputmode="decimal" min="0" step="0.5" aria-label="Peso serie ${n+1}" value="${sv.kg??''}" placeholder="${prev?.kg!=null?fmtKg(prev.kg):'kg'}" onchange="gymSet('${ek}','kg',this.value)"><input type="number" inputmode="numeric" min="0" step="1" aria-label="Repeticiones serie ${n+1}" value="${sv.reps??''}" placeholder="${prev?.reps!=null?prev.reps:'reps'}" onchange="gymSet('${ek}','reps',this.value)"><span class="prbadge">${pr?'🏆 PR':''}</span></div>`;
    }).join('');
    const lastTxt=last?`<div class="lastline">↺ Última vez (${shortDate(last.date)}): ${last.sets.filter(s=>s.kg!=null||s.reps!=null).map(s=>`${s.kg!=null?fmtKg(s.kg):'–'}×${s.reps??'–'}`).join(' · ')}</div>`:'<div class="lastline">↺ Primera vez con este ejercicio</div>';
    const bestTxt=best?`<div class="lastline">🏆 Récord: ${fmtKg(best.kg)} kg × ${best.reps} · 1RM est. ${Math.round(best.e1)} kg</div>`:'';
    return `<div class="exercise"><div class="row"><b>${i+1}. ${escHtml(item.nombre)}</b><div class="row" style="gap:6px"><button class="btn secondary sm" onclick="openExerciseDialog('${rid}','${escHtml(item.id)}')">Editar</button><button class="btn danger sm" aria-label="Quitar ejercicio" onclick="removeExerciseFromRoutine('${rid}','${escHtml(item.id)}')">×</button></div></div><div class="small">${item.grupo?escHtml(item.grupo)+' · ':''}objetivo ${escHtml(item.reps)} · descanso ${item.descanso||0}s · ${item.series} series</div>${lastTxt}${bestTxt}<div class="sethead"><span>✓</span><span>kg</span><span>reps</span><span></span></div>${sets}</div>`;
  }).join('');
  const pct=totalSets?Math.round(doneSets/totalSets*100):0;
  host.innerHTML=`<div class="card"><div class="row"><b>Sesión: ${escHtml(routine.nombre||routine.name)}</b><span class="tag">${finished?'✅ TERMINADA':doneSets+'/'+totalSets+' series'}</span></div><div class="progress" style="margin-top:10px"><div class="bar" style="width:${pct}%"></div></div><p class="small" style="margin-bottom:0">Al marcar una serie arranca el descanso. Si dejas el peso vacío se usa el de la última vez. Volumen hoy: <b>${Math.round(volume).toLocaleString('es-CO')} kg</b></p></div>${cards||'<div class="empty">Este día aún no tiene ejercicios. Usa “+ Ejercicio” para añadir el primero.</div>'}`;
  const fb=document.getElementById('finishGymBtn');if(fb){fb.textContent=finished?'✅ Entreno terminado · actualizar':'🏁 Terminar entreno';}
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
  const keys=Object.keys(data.gymDirty||{});if(!keys.length)return;
  if(!navigator.onLine){setGymStatus('📴 Sin conexión: la sesión se subirá al volver la señal');return}
  gymFlushing=true;
  try{
    for(const k of keys){
      const [date,rid]=k.split('|');const routine=exercises.find(r=>String(r.id)===rid);
      if(!routine){delete data.gymDirty[k];continue}
      try{await saveGymSession(routine,date,data.gymDone?.[k]?'completed':null);delete data.gymDirty[k];save();setGymStatus('☁️ Sesión guardada automáticamente · '+new Date().toLocaleTimeString('es-CO',{hour:'2-digit',minute:'2-digit'}))}
      catch(e){console.warn('RENOVA autoguardado gym',e);setGymStatus('⏳ Guardado en el teléfono; se subirá al volver la señal');break}
    }
  }finally{gymFlushing=false}
}
window.addEventListener('online',()=>flushGymDirty());

// ---- Terminar entreno
async function finishWorkout(){
  const routine=exercises.find(r=>r.id===data.gymSelectedRoutineId)||exercises[0];if(!routine)return;
  const key=today()+'|'+routine.id;let done=0,total=0,volume=0;const prs=[];
  for(const it of routine.items||[])for(let n=0;n<it.series;n++){total++;const sv=setStateFor(routine,it,n);if(sv.done){done++;volume+=(Number(sv.kg)||0)*(Number(sv.reps)||0);if(isPR(it.nombre,sv.kg,sv.reps)&&!prs.includes(it.nombre))prs.push(it.nombre)}}
  if(!done&&!confirm('No has marcado ninguna serie. ¿Terminar igual?'))return;
  const first=!data.gymDone?.[key];
  data.gymDone ||= {};data.gymDone[key]=true;
  if(first){data.xp=Number(data.xp||0)+50;if(supabaseUser)queueState()}
  stopRest();save();
  const start=data.gymStart?.[key];const mins=start?Math.max(1,Math.round((Date.now()-new Date(start).getTime())/60000)):null;
  const sum=document.getElementById('gymSummary');
  sum.innerHTML=`<div class="card summary"><div class="row"><b>🏁 Entreno terminado</b><span class="tag">${first?'+50 XP':'ACTUALIZADO'}</span></div><div class="grid" style="margin-top:10px"><div class="stat"><div class="num">${done}/${total}</div><div class="label">series hechas</div></div><div class="stat"><div class="num">${Math.round(volume).toLocaleString('es-CO')}</div><div class="label">kg de volumen</div></div><div class="stat"><div class="num">${mins!=null?mins+' min':'—'}</div><div class="label">duración</div></div><div class="stat"><div class="num">${prs.length}</div><div class="label">récords nuevos</div></div></div>${prs.length?`<p class="small" style="margin-bottom:0">🏆 ${prs.map(escHtml).join(' · ')}</p>`:''}</div>`;
  render();
  if(supabaseUser){data.gymDirty ||= {};data.gymDirty[key]=true;save();await flushGymDirty()}
  sum.scrollIntoView({behavior:'smooth',block:'center'});
  toast(prs.length?'🏆 ¡Entreno con '+prs.length+' récord'+(prs.length>1?'es':'')+'!':'💪 Entreno terminado');
}

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
