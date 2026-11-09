// RENOVA · interfaz general
// Navegación entre pantallas, render principal, hábitos diarios, efectividad de hábitos (anillos) y nivel de XP.
function toast(t){let e=document.getElementById('toast');e.textContent=t;e.classList.add('show');clearTimeout(toast._t);toast._t=setTimeout(()=>e.classList.remove('show'),1900)}
function setProfileStatus(t){const e=document.getElementById('profileStatus');if(e)e.textContent=t}
function show(id){
 document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');
 document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===(id==='food'?'home':id)));
 window.scrollTo(0,0);
 if(id==='gym')prepareGymScreen();
 render();
 if(id==='agenda')renderCalendarEvents();
}
function render(){
 const d=getDay();
 tickClock();
  
 document.getElementById('dayNum').textContent=dayIndex()+'/'+cycleDays();{const t=document.getElementById('homeStatsTag');if(t)t.textContent='DÍA '+dayIndex()+' DE '+cycleDays()}
 document.getElementById('streak').textContent=streak();
 const lw=lastWith('weight'),lc=lastWith('waist');document.getElementById('weightHome').textContent=lw?fmt1(lw.weight)+' kg':'—';document.getElementById('waistHome').textContent=lc?fmt1(lc.waist)+' cm':'—';
 document.getElementById('xpPill').textContent=data.xp+' XP · Nivel '+levelInfo().level;
 document.getElementById('checks').innerHTML=checklist.map(([k,t])=>{const id=escHtml(k);return `<div class="check"><input id="chk_${id}" type="checkbox" ${d.checks[k]?'checked':''} onchange="toggleCheck('${id}',this.checked)"><label for="chk_${id}" class="${d.checks[k]?'done':''}" style="flex:1">${escHtml(t)}</label><button type="button" class="btn danger" style="padding:6px 9px" aria-label="Quitar ${escHtml(t)}" onclick="removeChecklistTask('${id}')">×</button></div>`}).join('')||'<div class="empty">Aún no tienes hábitos. Crea el primero arriba.</div>';
 document.getElementById('quote').textContent=dailyQuote();
 renderExercises();renderMeasForm();renderHistory();renderTrend();renderBody();renderSuggestions();renderPlan();renderShoppingList();renderRecipes();renderAgenda();renderCalSyncPrefs();renderDashboard();renderTodayWorkout();renderCycle();renderQuickLog();renderHomeNutrition();renderEffect();applyFolds();renderReview();renderHomeReview();renderMyAgenda();renderHomeAgenda();renderPush();renderHealth();renderHomeFocus();renderGoals();renderPhotos();
}
function tickClock(){const now=new Date();const t=document.getElementById('clockTime'),d=document.getElementById('todayLabel');if(t)t.textContent=now.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'});if(d){const s=now.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});d.textContent=s.charAt(0).toUpperCase()+s.slice(1)}}
setInterval(tickClock,15000);
function setCycleStart(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){toast('Elige una fecha válida');return}if(date>today()){toast('La fecha no puede ser futura');return}if(!confirm('¿Cambiar el inicio del ciclo al '+shortDate(date)+'?'))return;lsSet(startKey,date);save();if(supabaseUser)queueState();render();toast('Ciclo actualizado: día '+dayIndex()+' de '+cycleDays())}
const QUOTES=['No necesitas hacerlo perfecto. Necesitas hacerlo hoy.','La disciplina es elegir lo que quieres más sobre lo que quieres ahora.','Un día a la vez. Una serie a la vez.','Lo que repites, te construye.','No negocies contigo: cumple y después descansa.','Constancia sobre perfección.','Hoy suma. Aunque sea poco, suma.','El progreso aburrido es progreso real.','Tu yo del final de este ciclo te lo va a agradecer.','Hazlo fácil de empezar y difícil de dejar.'];
function dailyQuote(){return QUOTES[(dayIndex()-1)%QUOTES.length]}
function openAccount(){show('progress');setTimeout(()=>document.getElementById('profileCard')?.scrollIntoView({behavior:'smooth',block:'start'}),50)}
function addChecklistTask(){
 const input=document.getElementById('newChecklistTask'),title=(input.value||'').trim().slice(0,100);
 if(!title){toast('Escribe el nombre del hábito');input.focus();return}
 if(checklist.some(x=>norm(x[1])===norm(title))){toast('Ese hábito ya existe');return}
 const h={id:uuid(),title,sort_order:checklist.length,is_active:true};
 checklist.push([h.id,h.title]);data.checklistItems=checklist.map(x=>[...x]);(data.habitSince ||= {})[h.id]=today();
 if(supabaseUser&&habitsCloud)queueHabit(h);
 input.value='';save();render();toast('Hábito creado')
}
function removeChecklistTask(key){
 const i=checklist.findIndex(x=>x[0]===key);if(i<0)return;const task=checklist[i];
 if(!confirm('¿Quitar el hábito “'+task[1]+'” de tu lista? Su historial se conserva.'))return;
 checklist.splice(i,1);data.checklistItems=checklist.map(x=>[...x]);
 if(supabaseUser&&habitsCloud)queueHabit({id:key,title:task[1],sort_order:i,is_active:false});
 save();render();toast('Hábito quitado')
}
function toggleCheck(k,v){
 const date=today(),d=getDay(date);if(!!d.checks[k]===v)return;
 const before=allDone(d),lvl=levelInfo().level;
 if(v)d.checks[k]=true;else delete d.checks[k];
 const bonus=before===allDone(d)?0:(before?-XP_PERFECT:XP_PERFECT);
 data.xp=Math.max(0,Number(data.xp||0)+(v?XP_HABIT:-XP_HABIT)+bonus);save();
 if(supabaseUser&&habitsCloud&&isUuid(k))queueCheck(k,date,v,true);
 if(supabaseUser)queueState();
 render();
 if(v)xpFloat('+'+(XP_HABIT+bonus)+' XP');
 const up=levelInfo().level>lvl;
 toast(bonus>0?'⭐ ¡Día perfecto! +'+XP_HABIT+' XP +'+XP_PERFECT+' de bono':up?'🏆 ¡Subiste al nivel '+levelInfo().level+'!':v?'✓ Hecho · +'+XP_HABIT+' XP':'Marcado como pendiente'+(bonus<0?' · se quitó el bono de día perfecto':''))
}
// ---- Efectividad de hábitos (anillos animados) y nivel de XP ------------
// Anillo exterior: efectividad acumulada del ciclo = hábitos cumplidos / hábitos posibles
// desde el inicio del ciclo hasta ayer (cada día que pasa se suma). Anillo interior: hoy.
const XP_LEVEL=500,XP_HABIT=25,XP_PERFECT=50;
// Cada hábito cuenta desde que existe: su fecha de creación o su primer check (lo que sea antes)
function habitSince(id){
  let since=data.habitSince?.[id]||null;
  for(const d of Object.keys(data.days||{}))if(data.days[d]?.checks?.[id]&&(!since||d<since))since=d;
  return since;
}
function habitEffect(){
  const start=lsGet(startKey)||today(),n=checklist.length,per={},pdays={},since={};
  checklist.forEach(([id])=>{per[id]=0;pdays[id]=0;since[id]=habitSince(id)||today()});
  let done=0,days=0,possible=0;
  for(let d=start;d<today();d=addDays(d,1)){days++;const c=data.days[d]?.checks||{};for(const [id] of checklist){if(since[id]>d)continue;possible++;pdays[id]++;if(c[id]){done++;per[id]++}}}
  const tc=getDay().checks||{},todayDone=checklist.filter(([id])=>tc[id]).length;
  const acc=possible?done/possible*100:null;
  const withToday=possible+n?(done+todayDone)/(possible+n)*100:0;
  return {n,days,done,possible,acc,todayDone,today:n?todayDone/n*100:0,withToday,per:checklist.map(([id,t])=>({id,t,pct:pdays[id]?per[id]/pdays[id]*100:null,days:pdays[id]}))};
}
function effectLabel(p){return p==null?'Empieza hoy':p>=90?'Imparable':p>=75?'Muy constante':p>=50?'En construcción':'A retomar'}
function levelInfo(){const xp=Number(data.xp||0);return {xp,level:Math.floor(xp/XP_LEVEL)+1,into:xp%XP_LEVEL,pct:xp%XP_LEVEL/XP_LEVEL*100}}
const RING_C=2*Math.PI*52,RING_C2=2*Math.PI*38;
function ringMarkup(full){
  return `<div class="effwrap"><svg class="effring" viewBox="0 0 120 120" role="img" aria-label="Efectividad de hábitos">
    <circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="acc" stroke-dasharray="${RING_C}" stroke-dashoffset="${RING_C}"/>
    <circle cx="60" cy="60" r="38" class="trk"/><circle cx="60" cy="60" r="38" class="tod" stroke-dasharray="${RING_C2}" stroke-dashoffset="${RING_C2}"/>
    <text x="60" y="58" class="big">–</text><text x="60" y="74" class="lbl">efectividad</text></svg>
    <div class="efflegend"><div><span class="dot acc"></span><b class="e-acc">–</b> acumulada<div class="small e-accd"></div></div><div><span class="dot tod"></span><b class="e-tod">–</b> hoy<div class="small e-todd"></div></div>
    <div class="lvl"><div class="row small"><b class="e-lvl"></b><span class="e-xp"></span></div><div class="progress"><div class="bar e-lvlbar"></div></div></div></div></div>${full?'<div class="effper"></div>':''}`;
}
function renderEffect(){
  const e=habitEffect(),L=levelInfo();
  document.querySelectorAll('.effcard').forEach(host=>{
    if(!host.querySelector('.effring'))host.innerHTML=`<div class="row"><b>🎯 Efectividad de hábitos</b><span class="tag e-tag"></span></div>`+ringMarkup(host.dataset.full==='1');
    const q=s=>host.querySelector(s),acc=e.acc??e.today;
    requestAnimationFrame(()=>{q('circle.acc').style.strokeDashoffset=RING_C*(1-Math.min(100,acc)/100);q('circle.tod').style.strokeDashoffset=RING_C2*(1-e.today/100);q('.e-lvlbar').style.width=L.pct+'%'});
    q('text.big').textContent=Math.round(acc)+'%';
    q('.e-tag').textContent=effectLabel(e.acc).toUpperCase();
    q('.e-acc').textContent=e.acc==null?'—':Math.round(e.acc)+'%';
    q('.e-accd').textContent=e.possible?`${e.done} de ${e.possible} en ${e.days} día${e.days===1?'':'s'} · con hoy ${Math.round(e.withToday)}%`:'Se acumula desde mañana';
    q('.e-tod').textContent=Math.round(e.today)+'%';
    q('.e-todd').textContent=`${e.todayDone} de ${e.n} hábitos`+(e.n&&e.todayDone===e.n?' · ⭐ día perfecto':'');
    q('.e-lvl').textContent='Nivel '+L.level;q('.e-xp').textContent=L.into+' / '+XP_LEVEL+' XP';
    const per=q('.effper');
    if(per)per.innerHTML=e.days?`<p class="small" style="margin:10px 0 6px">Por hábito (desde el inicio del ciclo)</p>`+e.per.slice().sort((a,b)=>(b.pct??-1)-(a.pct??-1)).map(h=>h.pct==null?`<div class="effrow"><span>${escHtml(h.t)}</span><span class="small">nuevo</span><b>—</b></div>`:`<div class="effrow"><span>${escHtml(h.t)}</span><div class="progress"><div class="bar" style="width:${Math.round(h.pct)}%;background:${h.pct>=75?'var(--ok)':h.pct>=50?'var(--warn)':'var(--danger)'}"></div></div><b>${Math.round(h.pct)}%</b></div>`).join(''):'';
  });
}
function xpFloat(txt){const pill=document.getElementById('xpPill');if(!pill)return;const f=document.createElement('span');f.className='xpfloat';f.textContent=txt;pill.parentElement.style.position='relative';pill.parentElement.appendChild(f);setTimeout(()=>f.remove(),1300);pill.classList.remove('xpbump');void pill.offsetWidth;pill.classList.add('xpbump')}
// Bono de día perfecto: +50 al pasar a tener todos marcados; −50 si dejas de tenerlos (sin estado guardado)
function allDone(d){return checklist.length>0&&checklist.every(([id])=>d.checks[id])}
// ---- Inicio "modo enfoque" y Cierre del día (v21) ----------------------
const CLOSE_XP=20;
function dayClosed(d=today()){return !!data.dayClosed?.[d]}
function pendingHabits(){const c=getDay().checks||{};return checklist.filter(([id])=>!c[id])}
function mealName(date,meal){const pi=planItem(date,meal);return pi?((data.recipes||[]).find(r=>r.id===pi.recipe_id)?.name||null):null}
function nextMealPending(){
  const p=data.nutritionPlan;if(!p)return null;const meals=Object.keys(p.meal_split||{});if(!meals.length)return null;
  const cur=currentMeal(),order=meals,start=Math.max(0,order.indexOf(cur));
  for(const m of [...order.slice(0,start+1).reverse(),...order.slice(start+1)])if(!mealEntry(today(),m))return m;   // primero la de esta hora o las anteriores sin marcar
  return null;
}
function renderHomeFocus(){
  const host=document.getElementById('homeFocus');if(!host)return;
  const r=typeof suggestedRoutine==='function'?suggestedRoutine():null,acts=(data.activities||[]).filter(a=>a.date===today());
  let gym='';
  if(r){const done=routineDoneToday(r.id);gym=`<div class="focusrow"><span>🏋️ <b>${escHtml(String(r.nombre||r.name).split(' — ').slice(0,2).join(' — '))}</b>${done?' · <span class="okc">hecho ✅</span>':''}${acts.length?`<br><span class="small">${acts.map(a=>escHtml(sportLabel(a))+' '+a.minutes+' min').join(' · ')}</span>`:''}</span><button type="button" class="btn ${done?'secondary ':''}sm" onclick="openTodayWorkout('${escHtml(r.id)}')">${done?'Ver':'Entrenar'}</button></div>`}
  let meal='';
  if(data.nutritionPlan){const m=nextMealPending();meal=m?`<div class="focusrow"><span>🍽️ <b>${escHtml(MEAL_LABEL[m]||m)}</b>${mealName(today(),m)?`<br><span class="small">${escHtml(mealName(today(),m))}</span>`:''}</span><span class="focusbtns"><button type="button" class="btn sm" onclick="setEntry(today(),'${m}','comida')">✓ Comí</button><button type="button" class="btn secondary sm" onclick="offPlanClick(today(),'${m}')">⇄</button></span></div>`:'<div class="focusrow"><span>🍽️ Comidas de hoy registradas <span class="okc">✅</span></span></div>'}
  const ph=pendingHabits();
  const hab=`<div class="focusrow"><span>✅ ${ph.length?`Te faltan <b>${ph.length}</b> de ${checklist.length} hábitos`:'<span class="okc">Todos los hábitos listos</span>'}</span>${ph.length?`<button type="button" class="btn secondary sm" onclick="show('check')">Marcar</button>`:''}</div>`;
  const closed=dayClosed(),late=new Date().getHours()>=18;
  const close=closed?'<div class="focusrow"><span>🌙 <span class="okc">Día cerrado</span></span><button type="button" class="btn secondary sm" onclick="openCloseDay()">Editar</button></div>':`<button type="button" class="btn${late?'':' secondary'}" style="width:100%;margin-top:10px" onclick="openCloseDay()">🌙 Cerrar el día (30 s)</button>`;
  host.innerHTML=`<div class="row"><b>🎯 Hoy</b><span class="tag">${closed?'CERRADO':late?'CIERRA TU DÍA':'EN CURSO'}</span></div>${gym}${meal}${hab}${close}`;
}
// ---- Cierre del día: todo en una pantalla
let closeFocus=null;
function closeDialog(){
  let d=document.getElementById('closeDialog');if(d)return d;
  d=document.createElement('dialog');d.id='closeDialog';d.setAttribute('aria-labelledby','closeTitle');d.className='closedlg';
  d.innerHTML='<div id="closeBody"></div>';document.body.appendChild(d);
  d.addEventListener('close',()=>{closeFocus=null;render()});
  return d;
}
function openCloseDay(focus){closeFocus=focus||null;const d=closeDialog();renderCloseDay();d.showModal?d.showModal():d.setAttribute('open','');
  if(focus==='peso')setTimeout(()=>{const w=document.getElementById('cdWeight');w?.scrollIntoView({block:'center'});w?.focus()},60)}
function cdSaveWeight(){
  const v=parseFloat(String(document.getElementById('cdWeight')?.value||'').replace(',','.'));if(!(v>=30&&v<=250)){toast('Escribe tu peso en kg');return}
  const cur=(data.measurements||[]).find(x=>x.date===today())||{date:today()};const m={...cur,weight:Math.round(v*10)/10};
  data.measurements=(data.measurements||[]).filter(x=>x.date!==today());data.measurements.push(m);sortMeas();save();
  if(supabaseUser&&measurementsCloud)queueMeasurement(m);maybeRecalcFromWeight(m.weight);toast('⚖️ '+String(m.weight).replace('.',',')+' kg guardado');renderCloseDay();
}
function cdSaveSteps(){const el=document.getElementById('cdSteps'),v=Math.round(Number(el?.value));if(!(v>=0&&v<=100000)){toast('Escribe un número de pasos válido');return}const d=getDay();d.steps=v;save();if(supabaseUser)queueLog(today());toast('👟 '+fmtN(v)+' pasos');renderCloseDay()}
function finishCloseDay(){
  const first=!dayClosed();(data.dayClosed ||= {})[today()]=true;if(first){data.xp=Number(data.xp||0)+CLOSE_XP;if(supabaseUser)queueState()}save();
  document.getElementById('closeDialog')?.close();toast(first?`🌙 Día cerrado ✅ +${CLOSE_XP} XP`:'🌙 Cierre actualizado');
}
function renderCloseDay(){
  const host=document.getElementById('closeBody');if(!host)return;
  const day=getDay(),water=Number(day.water)||0,wg=waterGoalL(),sleep=toNumOrNull(day.sleep),steps=toNumOrNull(day.steps),sg=stepsGoal();
  const lw=lastWith('weight'),wToday=(data.measurements||[]).find(x=>x.date===today())?.weight,monday=new Date().getDay()===1;
  const chip=h=>`<button type="button" class="qchip${Number(sleep)===h?' on':''}" aria-pressed="${Number(sleep)===h}" onclick="quickSleep(${h});renderCloseDay()">${h===9?'9+':h} h</button>`;
  const meals=data.nutritionPlan?Object.keys(data.nutritionPlan.meal_split||{}).map(m=>{const st=mealEntry(today(),m);return `<div class="cdmeal"><span>${escHtml(MEAL_LABEL[m]||m)}</span><span class="focusbtns">${[['comida','✓ Comí'],['otra','⇄ Otra'],['saltada','✗ Salté']].map(([k,l])=>`<button type="button" class="btn ${st===k?'':'secondary '}sm" aria-pressed="${st===k}" onclick="${k==='otra'?`offPlanClick(today(),'${m}')`:`setEntry(today(),'${m}','${k}')`};renderCloseDay()">${l}</button>`).join('')}</span></div>`}).join(''):'<p class="small">Calcula tus metas en Nutrición para registrar comidas.</p>';
  const ph=pendingHabits();
  const habits=checklist.length?checklist.map(([id,t])=>{const on=!!day.checks?.[id];return `<label class="cdhab${on?' on':''}"><input type="checkbox" ${on?'checked':''} onchange="toggleCheck('${escHtml(id)}',this.checked);renderCloseDay()"> ${escHtml(t)}</label>`}).join(''):'<p class="small">No tienes hábitos activos.</p>';
  const auto=data.healthSync?.last&&data.healthSync.last.slice(0,10)===today();
  host.innerHTML=`<div class="row"><h2 id="closeTitle" style="margin:0;font-size:20px">🌙 Cierre del día</h2><button type="button" class="btn secondary sm" aria-label="Cerrar" onclick="document.getElementById('closeDialog').close()">✕</button></div>
  <p class="small" style="margin:4px 0 10px">${escHtml(shortDate(today()))} · toca y listo.</p>
  ${monday||closeFocus==='peso'?cdWeightBlock(lw,wToday,true):''}
  <div class="cdsec"><div class="row"><b>💧 Agua</b><span class="small">${String(Math.round(water*100)/100).replace('.',',')} de ${String(wg).replace('.',',')} L</span></div><div class="progress" style="margin:6px 0"><div class="bar" style="width:${Math.min(100,Math.round(water/wg*100))}%"></div></div><div class="qbtns"><button type="button" class="btn secondary sm" onclick="quickWater(-250);renderCloseDay()">−250</button><button type="button" class="btn sm" onclick="quickWater(250);renderCloseDay()">+250 ml</button><button type="button" class="btn sm" onclick="quickWater(500);renderCloseDay()">+500 ml</button></div></div>
  <div class="cdsec"><div class="row"><b>😴 Dormí anoche</b><span class="small">${sleep!=null?String(sleep).replace('.',',')+' h':'—'}</span></div><div class="qbtns" style="margin-top:6px">${[5,6,7,8,9].map(chip).join('')}</div></div>
  <div class="cdsec"><div class="row"><b>👟 Pasos</b><span class="small">${steps!=null?fmtN(steps):'0'} de ${fmtN(sg)}${auto?' · 🍎 del iPhone':''}</span></div><div class="two" style="margin-top:6px"><input id="cdSteps" type="number" inputmode="numeric" min="0" step="100" placeholder="Pasos de hoy" value="${steps??''}"><button type="button" class="btn secondary" onclick="cdSaveSteps()">Guardar</button></div></div>
  <div class="cdsec"><b>🍽️ Comidas</b>${meals}</div>
  <div class="cdsec"><div class="row"><b>✅ Hábitos</b><span class="small">${checklist.length-ph.length}/${checklist.length}</span></div>${habits}</div>
  ${monday||closeFocus==='peso'?'':cdWeightBlock(lw,wToday,false)}
  <button type="button" class="btn" style="width:100%;margin-top:12px" onclick="finishCloseDay()">${dayClosed()?'Listo':'Cerrar el día ✅ +'+CLOSE_XP+' XP'}</button>`;
}
function cdWeightBlock(lw,wToday,highlight){
  return `<div class="cdsec${highlight?' cdhl':''}"><div class="row"><b>⚖️ Peso ${highlight?'(lunes de pesarte)':'(opcional)'}</b><span class="small">${wToday?'hoy '+String(wToday).replace('.',',')+' kg ✅':lw?'último '+String(lw.weight).replace('.',',')+' kg · '+escHtml(shortDate(lw.date)):''}</span></div><div class="two" style="margin-top:6px"><input id="cdWeight" type="text" inputmode="decimal" autocomplete="off" placeholder="kg en ayunas (ej. 99,4)"><button type="button" class="btn secondary" onclick="cdSaveWeight()">Guardar</button></div></div>`;
}
