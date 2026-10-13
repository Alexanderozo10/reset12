// RENOVA · núcleo
// Configuración, estado, caché local, cola de sincronización con Supabase y carga desde la nube.
function escHtml(v){return (v==null?'':String(v)).replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
// =====================================================================
// RENOVA · capa de datos v2
// La nube (Supabase) es la fuente principal. localStorage es solo una
// caché para abrir rápido y trabajar sin conexión. Cada cambio se guarda
// primero en local y se envía a Supabase mediante una cola que se
// reintenta sola cuando vuelve la conexión.
// =====================================================================
const BASE_KEY='reset12_v5';
const LEGACY_BUILTIN_TASKS=['Tomé suficiente agua','Cumplí mi proteína del día','Respeté mis 3 comidas','Cumplí mis pasos','Entrené / hice actividad','Dormí lo planificado','Evité picoteos innecesarios','Hice algo positivo por mí'];
const SUPABASE_URL='https://dniegeedovdakfqfbcay.supabase.co';
const SUPABASE_PUBLISHABLE_KEY='sb_publishable_bYBfoTBdUIKryPj1JJiDrg_arYDul2g';
const supabaseClient=window.supabase.createClient(SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY);
const CLIENT_ID='800988810295-el6fi6505u0djs46um3i681qhdlu8pf2.apps.googleusercontent.com';
const HISTORY_DAYS=120;
const DEFAULT_AGENDA={breakfast:'07:00',lunch:'13:00',gym:'19:00',dinner:'21:15',sleep:'23:00',measure:'06:00'};

let supabaseUser=null;
let loadedForUserId=null;
let habitsCloud=true;        // false si aún no se ejecutó el SQL de la Fase 1
let measurementsCloud=true;
let currentUser=null;
let KEY=BASE_KEY, startKey='reset12_start', queueKey='renova_sync_queue';
let checklist=[];            // [[habitId, título]] activos
let exercises=[];            // rutinas de gym
let data=emptyData();

function emptyData(){return {nutritionPlan:null,stepsGoal:8000,gymHistory:{},gymDirty:{},gymDone:{},gymStart:{},gymFinishQueue:[],gymSessionsLog:[],days:{},measurements:[],xp:0,customHabits:[],checklistItems:[],habitsMigrated:false,gymRoutines:[],gymSelectedRoutineId:null,agenda:{...DEFAULT_AGENDA},shoppingList:[]}}
function userKey(email,suffix){return suffix+'_'+encodeURIComponent(email.toLowerCase())}
function lsGet(k){try{return localStorage.getItem(k)}catch{return null}}
function lsSet(k,v){try{localStorage.setItem(k,v)}catch(e){console.warn('RENOVA localStorage',e)}}
function lsDel(k){try{localStorage.removeItem(k)}catch{}}
function norm(t){return String(t||'').trim().toLocaleLowerCase('es')}
function nowIso(){return new Date().toISOString()}
function uuid(){if(window.crypto?.randomUUID)return crypto.randomUUID();return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g,c=>{const r=Math.random()*16|0;return (c==='x'?r:(r&3|8)).toString(16)})}
function isUuid(v){return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(v))}
function fmtDate(d){return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function today(){return fmtDate(new Date())}
function addDays(iso,n){const [y,m,d]=iso.split('-').map(Number);const x=new Date(y,m-1,d);x.setDate(x.getDate()+n);return fmtDate(x)}
function hhmm(t){return t?String(t).slice(0,5):null}
function toNumOrNull(v){if(v===undefined||v===null||v==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}
function toIntOrNull(v){const n=toNumOrNull(v);return n==null?null:Math.round(n)}
function litersToMl(v){const n=toNumOrNull(v);return n==null?null:Math.round(n*1000)}
function newDay(){return {checks:{},steps:'',water:'',sleep:'',calories:'',note:'',exercises:{}}}
function getDay(date=today()){data.days[date] ||= newDay();data.days[date].checks ||= {};data.days[date].exercises ||= {};return data.days[date]}
function save(){lsSet(KEY,JSON.stringify(data))}   // caché local; la nube va por la cola

function loadUserData(email){
  const scopedKey=userKey(email,BASE_KEY), scopedStart=userKey(email,'reset12_start');
  if(!lsGet(scopedKey)){const legacy=lsGet(BASE_KEY);if(legacy)lsSet(scopedKey,legacy);const ls=lsGet('reset12_start');if(ls)lsSet(scopedStart,ls)}
  KEY=scopedKey;startKey=scopedStart;queueKey=userKey(email,'renova_sync_queue');
  let loaded=null;try{loaded=JSON.parse(lsGet(KEY)||'null')}catch{}
  data=Object.assign(emptyData(),loaded&&typeof loaded==='object'?loaded:{});
  if(!data.days||typeof data.days!=='object')data.days={};
  ['measurements','customHabits','checklistItems','shoppingList','gymRoutines'].forEach(k=>{if(!Array.isArray(data[k]))data[k]=[]});
  data.agenda=Object.assign({...DEFAULT_AGENDA},data.agenda||{});
  checklist=data.checklistItems.filter(x=>Array.isArray(x)&&x[1]).map(x=>[String(x[0]),String(x[1])]);
  exercises=data.gymRoutines;
  loadQueue();
}

// ---------------------------------------------------------------------
// Cola de sincronización (sobrevive a recargas y a falta de conexión)
// ---------------------------------------------------------------------
let syncQueue=[];
let flushing=false;
function loadQueue(){try{const q=JSON.parse(lsGet(queueKey)||'[]');syncQueue=Array.isArray(q)?q:[]}catch{syncQueue=[]}}
function persistQueue(){lsSet(queueKey,JSON.stringify(syncQueue))}
function isPending(key){return syncQueue.some(o=>o.key===key)}
// op = {key, t:'upsert'|'update'|'delete'|'replace', table, rows?, onConflict?, values?, match?}
function cloud(op,noFlush){
  const i=op.key?syncQueue.findIndex(o=>o.key===op.key):-1;
  if(i>=0)syncQueue[i]=op; else syncQueue.push(op);   // reemplazo en su lugar: conserva el orden
  persistQueue();updateSyncPill();
  if(!noFlush)flushQueue();
}
async function runOp(op){
  const uid=supabaseUser.id;
  const withUser=rows=>rows.map(r=>({...r,user_id:uid}));
  const applyMatch=(q,m)=>{for(const [k,v] of Object.entries(m||{}))q=q.eq(k,v);return q};
  if(op.t==='upsert')return supabaseClient.from(op.table).upsert(withUser(op.rows),{onConflict:op.onConflict});
  if(op.t==='update')return applyMatch(supabaseClient.from(op.table).update(op.values).eq('user_id',uid),op.match);
  if(op.t==='delete')return applyMatch(supabaseClient.from(op.table).delete().eq('user_id',uid),op.match);
  if(op.t==='replace'){const del=await supabaseClient.from(op.table).delete().eq('user_id',uid);if(del.error)return del;if(!op.rows.length)return {error:null};return supabaseClient.from(op.table).insert(withUser(op.rows))}
  return {error:{code:'LOCAL',message:'Operación desconocida'}};
}
function isTransient(err){const m=String(err?.message||'');return !err?.code||['PGRST301','08000','08003','08006','57014'].includes(String(err.code))||/fetch|network|timeout|load failed/i.test(m)}
async function flushQueue(){
  if(flushing||!supabaseUser||!navigator.onLine){updateSyncPill();return}
  flushing=true;updateSyncPill();
  try{
    while(syncQueue.length){
      const op=syncQueue[0];
      let res;try{res=await runOp(op)}catch(e){res={error:{message:String(e?.message||e)}}}
      if(res?.error){
        if(isTransient(res.error))throw res.error;
        console.error('RENOVA: cambio descartado por la nube',op,res.error);
        toast('No se pudo guardar en la nube: '+(res.error.message||res.error.code));
      }
      syncQueue=syncQueue.filter(x=>x!==op);persistQueue();
    }
  }catch(e){console.warn('RENOVA sync pendiente:',e?.message||e)}
  finally{flushing=false;updateSyncPill()}
}
function updateSyncPill(){
  const e=document.getElementById('syncPill');if(!e)return;const n=syncQueue.length;let t;
  if(!supabaseUser)t='📱 Solo este dispositivo';
  else if(!navigator.onLine)t='📴 Sin conexión'+(n?' · '+n+' pendientes':'');
  else if(n)t='⏳ '+n+' cambio'+(n>1?'s':'')+' por subir';
  else if(!habitsCloud||!measurementsCloud)t='⚠️ Falta ejecutar el SQL';
  else t='☁️ Sincronizado';
  e.textContent=t;
}
window.addEventListener('online',()=>flushQueue());
window.addEventListener('offline',updateSyncPill);
setInterval(()=>{if(syncQueue.length)flushQueue()},60000);

// Constructores de operaciones
function queueState(noFlush){cloud({key:'state',t:'upsert',table:'user_app_state',onConflict:'user_id',rows:[{xp:Number(data.xp||0),cycle_start_date:lsGet(startKey)||today(),cycle_duration_days:84,updated_at:nowIso()}]},noFlush)}
function queueLog(date,noFlush){const d=getDay(date);cloud({key:'log:'+date,t:'upsert',table:'daily_logs',onConflict:'user_id,log_date',rows:[{log_date:date,steps:toIntOrNull(d.steps),water_ml:litersToMl(d.water),sleep_hours:toNumOrNull(d.sleep),calories:toIntOrNull(d.calories),notes:d.note||null,updated_at:nowIso()}]},noFlush)}
function queuePrefs(noFlush){const a=data.agenda||DEFAULT_AGENDA;cloud({key:'prefs',t:'upsert',table:'user_preferences',onConflict:'user_id',rows:[{breakfast_time:a.breakfast,lunch_time:a.lunch,gym_time:a.gym,dinner_time:a.dinner,sleep_time:a.sleep,measurement_time:a.measure,updated_at:nowIso()}]},noFlush)}
function queueShop(noFlush){cloud({key:'shop',t:'replace',table:'shopping_list_items',rows:(data.shoppingList||[]).map((name,i)=>({name:String(name),quantity:null,category:null,purchased:false,sort_order:i}))},noFlush)}
function queueMeasurement(m,noFlush){cloud({key:'meas:'+m.date,t:'upsert',table:'body_measurements',onConflict:'user_id,measured_on',rows:[{measured_on:m.date,weight_kg:m.weight,waist_cm:m.waist,updated_at:nowIso()}]},noFlush)}
function queueHabit(h,noFlush){cloud({key:'habit:'+h.id,t:'upsert',table:'habit_definitions',onConflict:'id',rows:[{id:h.id,title:h.title,sort_order:h.sort_order||0,is_active:h.is_active!==false,updated_at:nowIso()}]},noFlush)}
function queueCheck(habitId,date,done,noFlush){const key='chk:'+habitId+':'+date;if(done)cloud({key,t:'upsert',table:'daily_habit_checks',onConflict:'user_id,habit_id,check_date',rows:[{habit_id:habitId,check_date:date,completed:true}]},noFlush);else cloud({key,t:'delete',table:'daily_habit_checks',match:{habit_id:habitId,check_date:date}},noFlush)}

// ---------------------------------------------------------------------
// Lectura desde la nube + migración de lo que solo existe en este equipo
// ---------------------------------------------------------------------
function migrateLocalHabits(all){
  const byTitle=new Map(all.map(h=>[norm(h.title),h]));
  const legacy=new Set(LEGACY_BUILTIN_TASKS.map(norm));
  const sources=[...data.checklistItems.map(x=>({key:String(x[0]),title:String(x[1]||'').trim()})),...data.customHabits.map((t,i)=>({key:'custom_'+i,title:String(t||'').trim()}))];
  const keyMap={};let order=all.length;
  for(const s of sources){
    if(!s.title||legacy.has(norm(s.title)))continue;
    let h=byTitle.get(norm(s.title));
    if(!h){h={id:isUuid(s.key)&&!all.some(x=>x.id===s.key)?s.key:uuid(),title:s.title.slice(0,100),sort_order:order++,is_active:true};all.push(h);byTitle.set(norm(h.title),h);queueHabit(h,true)}
    keyMap[s.key]=String(h.id);
  }
  const ids=new Set(all.map(h=>String(h.id)));
  for(const [date,day] of Object.entries(data.days)){
    const next={};
    for(const [k,v] of Object.entries(day.checks||{})){
      const id=keyMap[k]||(ids.has(k)?k:null);if(!id||!v)continue;
      next[id]=true;queueCheck(id,date,true,true);
    }
    day.checks=next;
  }
  data.customHabits=[];data.habitsMigrated=true;
  return all;
}

async function pushLocalGymSessions(sessions){
  const have=new Set(sessions.map(s=>s.session_date+'|'+s.routine_id));
  const since=addDays(today(),-HISTORY_DAYS);let pushed=0;
  for(const [date,day] of Object.entries(data.days)){
    if(date<since)continue;const used=new Set();
    for(const [k,v] of Object.entries(day.exercises||{})){
      const m=/^r(.+?)_e(.+)_s(\d+)$/.exec(k);if(!m||!v)continue;
      if(v.done||(v.kg!==''&&v.kg!=null)||(v.reps!==''&&v.reps!=null))used.add(m[1]);
    }
    for(const rid of used){
      if(have.has(date+'|'+rid))continue;
      const routine=exercises.find(r=>String(r.id)===rid);if(!routine)continue;
      try{await saveGymSession(routine,date);have.add(date+'|'+rid);pushed++}catch(e){console.warn('RENOVA migración gym',date,rid,e)}
    }
  }
  return pushed;
}

async function pullFromCloud(){
  if(!supabaseUser)return;
  const uid=supabaseUser.id, since=addDays(today(),-HISTORY_DAYS), q=t=>supabaseClient.from(t);
  supabaseClient.from('profiles').upsert({id:uid,display_name:currentUser?.name||null,avatar_url:currentUser?.picture||null,timezone:'America/Bogota',updated_at:nowIso()},{onConflict:'id'}).then(r=>{if(r.error)console.warn('RENOVA profiles',r.error)});
  const [stateR,logsR,prefsR,shopR,routinesR,exR,sessR,habitsR,checksR,measR]=await Promise.all([
    q('user_app_state').select('*').eq('user_id',uid).maybeSingle(),
    q('daily_logs').select('*').eq('user_id',uid).gte('log_date',since),
    q('user_preferences').select('*').eq('user_id',uid).maybeSingle(),
    q('shopping_list_items').select('*').eq('user_id',uid).order('sort_order'),
    q('workout_routines').select('*').eq('user_id',uid).eq('is_active',true).order('created_at'),
    q('routine_exercises').select('*').eq('user_id',uid).order('exercise_order'),
    q('workout_sessions').select('id,routine_id,session_date,status').eq('user_id',uid).gte('session_date',since),
    q('habit_definitions').select('id,title,sort_order,is_active,created_at').eq('user_id',uid).order('sort_order').order('created_at'),
    q('daily_habit_checks').select('habit_id,check_date,completed').eq('user_id',uid).gte('check_date',since),
    q('body_measurements').select('measured_on,weight_kg,waist_cm').eq('user_id',uid).order('measured_on')
  ]);
  const coreErr=[stateR,logsR,prefsR,shopR,routinesR,exR,sessR].find(r=>r.error);
  if(coreErr)throw coreErr.error;
  habitsCloud=!habitsR.error&&!checksR.error;
  measurementsCloud=!measR.error;
  if(!habitsCloud)console.warn('RENOVA: tablas de hábitos no disponibles (¿falta el SQL?)',habitsR.error||checksR.error);
  if(!measurementsCloud)console.warn('RENOVA: body_measurements no disponible (¿falta el SQL?)',measR.error);

  // Estado del ciclo y XP: manda la nube, salvo cambios locales aún sin subir
  if(stateR.data){if(!isPending('state')){data.xp=Number(stateR.data.xp||0);if(stateR.data.cycle_start_date)lsSet(startKey,stateR.data.cycle_start_date)}}
  else queueState(true);

  // Registro diario
  const cloudDates=new Set();
  for(const row of logsR.data||[]){
    cloudDates.add(row.log_date);if(isPending('log:'+row.log_date))continue;
    const d=getDay(row.log_date);
    d.steps=row.steps??'';d.water=row.water_ml!=null?+(Number(row.water_ml)/1000).toFixed(2):'';d.sleep=row.sleep_hours??'';d.calories=row.calories??'';d.note=row.notes??'';
  }
  for(const [date,d] of Object.entries(data.days)){
    if(cloudDates.has(date)||isPending('log:'+date)||date<since)continue;
    if(['steps','water','sleep','calories','note'].some(k=>d[k]!==''&&d[k]!=null))queueLog(date,true);
  }

  // Horarios
  if(prefsR.data){if(!isPending('prefs')){const p=prefsR.data;data.agenda={breakfast:hhmm(p.breakfast_time)||DEFAULT_AGENDA.breakfast,lunch:hhmm(p.lunch_time)||DEFAULT_AGENDA.lunch,gym:hhmm(p.gym_time)||DEFAULT_AGENDA.gym,dinner:hhmm(p.dinner_time)||DEFAULT_AGENDA.dinner,sleep:hhmm(p.sleep_time)||DEFAULT_AGENDA.sleep,measure:hhmm(p.measurement_time)||DEFAULT_AGENDA.measure}}}
  else queuePrefs(true);

  // Lista de compras
  if(!isPending('shop')){if((shopR.data||[]).length||!data.shoppingList.length)data.shoppingList=(shopR.data||[]).map(x=>x.name);else queueShop(true)}

  // Hábitos y checks
  if(habitsCloud){
    let all=(habitsR.data||[]).map(h=>({...h,id:String(h.id)}));
    if(!data.habitsMigrated)all=migrateLocalHabits(all);
    for(const op of syncQueue){if(op.table==='habit_definitions'){const r=op.rows?.[0];if(!r)continue;const h=all.find(x=>x.id===r.id);if(h)Object.assign(h,r);else all.push({...r})}}
    checklist=all.filter(h=>h.is_active!==false).sort((a,b)=>(a.sort_order||0)-(b.sort_order||0)).map(h=>[String(h.id),String(h.title)]);
    data.checklistItems=checklist.map(x=>[...x]);
    const byDate={};for(const c of checksR.data||[])if(c.completed!==false)(byDate[c.check_date] ||= {})[String(c.habit_id)]=true;
    for(const [date,day] of Object.entries(data.days))if(date>=since)day.checks={};
    for(const [date,checks] of Object.entries(byDate))getDay(date).checks={...checks};
    for(const op of syncQueue){const m=/^chk:(.+):(\d{4}-\d{2}-\d{2})$/.exec(op.key||'');if(!m)continue;const day=getDay(m[2]);if(op.t==='delete')delete day.checks[m[1]];else day.checks[m[1]]=true}
  }

  // Mediciones
  if(measurementsCloud){
    const map=new Map((measR.data||[]).map(r=>[r.measured_on,{date:r.measured_on,weight:toNumOrNull(r.weight_kg),waist:toNumOrNull(r.waist_cm)}]));
    const localByDate=new Map();for(const m of data.measurements||[])if(m&&m.date)localByDate.set(m.date,m);
    for(const [date,m] of localByDate){if(!map.has(date)){map.set(date,m);queueMeasurement(m,true)}else if(isPending('meas:'+date))map.set(date,m)}
    data.measurements=[...map.values()].sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
  }

  // Plan de nutrición (N1): manda la nube, salvo un cambio local pendiente
  {const npR=await q('nutrition_plans').select('*').eq('user_id',uid).eq('is_active',true).maybeSingle();
   if(npR.error)console.warn('RENOVA nutrition_plans',npR.error);
   else if(npR.data&&!isPending('nplan'))data.nutritionPlan={...npR.data,height_cm:toNumOrNull(npR.data.height_cm),weight_kg:toNumOrNull(npR.data.weight_kg)};
   else if(!npR.data&&data.nutritionPlan)queueNutritionPlan(true);}

  // Gym
  data.gymRoutines=(routinesR.data||[]).map(r=>({...r,nombre:r.name,grupos:r.description||'',items:(exR.data||[]).filter(e=>e.routine_id===r.id).map(e=>{const meta=parseRoutineNote(e.notes||'');return {id:e.id,nombre:e.exercise_name,grupo:meta.group,series:Number(e.planned_sets||3),reps:meta.target||(e.reps_min&&e.reps_max&&e.reps_min!==e.reps_max?`${e.reps_min}-${e.reps_max}`:String(e.reps_min||8)),descanso:Number(e.rest_seconds||60)}})}));
  exercises=data.gymRoutines;
  if(!exercises.some(r=>r.id===data.gymSelectedRoutineId))data.gymSelectedRoutineId=exercises[0]?.id||null;
  const sessions=sessR.data||[];
  const pushedSessions=await pushLocalGymSessions(sessions);
  data.gymSessionsLog=sessions.map(s=>({session_date:s.session_date,routine_id:s.routine_id,status:s.status}));
  for(const s of sessions)if(s.session_date===today()&&s.status==='completed'){data.gymDone ||= {};data.gymDone[today()+'|'+s.routine_id]=true}
  const todayIds=sessions.filter(s=>s.session_date===today()&&s.status!=='completed').map(s=>s.id);
  if(todayIds.length){
    const setsR=await q('workout_sets').select('*').eq('user_id',uid).in('session_id',todayIds);
    if(setsR.error)console.warn('RENOVA workout_sets',setsR.error);
    else{
      const exById=new Map((exR.data||[]).map(e=>[e.id,e]));const day=getDay();
      for(const s of setsR.data||[]){
        const ex=exById.get(s.routine_exercise_id);const rid=ex?.routine_id||sessions.find(x=>x.id===s.session_id)?.routine_id;
        const k='r'+rid+'_e'+(s.routine_exercise_id||s.exercise_name)+'_s'+(Number(s.set_number||1)-1);
        if(!day.exercises[k])day.exercises[k]={kg:s.weight_kg??'',reps:s.reps_completed??'',done:!!s.completed};
      }
    }
  }
  await loadGymHistory(sessions);
  save();render();updateSyncPill();
  await flushQueue();
  flushGymDirty();
  return {pushedSessions};
}
