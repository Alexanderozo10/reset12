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
  
 document.getElementById('dayNum').textContent=dayIndex()+'/'+cycleDays();
 document.getElementById('streak').textContent=streak();
 const lw=lastWith('weight'),lc=lastWith('waist');document.getElementById('weightHome').textContent=lw?fmt1(lw.weight)+' kg':'—';document.getElementById('waistHome').textContent=lc?fmt1(lc.waist)+' cm':'—';
 document.getElementById('xpPill').textContent=data.xp+' XP · Nivel '+levelInfo().level;
 document.getElementById('checks').innerHTML=checklist.map(([k,t])=>{const id=escHtml(k);return `<div class="check"><input id="chk_${id}" type="checkbox" ${d.checks[k]?'checked':''} onchange="toggleCheck('${id}',this.checked)"><label for="chk_${id}" class="${d.checks[k]?'done':''}" style="flex:1">${escHtml(t)}</label><button type="button" class="btn danger" style="padding:6px 9px" aria-label="Quitar ${escHtml(t)}" onclick="removeChecklistTask('${id}')">×</button></div>`}).join('')||'<div class="empty">Aún no tienes hábitos. Crea el primero arriba.</div>';
 document.getElementById('quote').textContent=dailyQuote();
 renderExercises();renderMeasForm();renderHistory();renderTrend();renderBody();renderSuggestions();renderPlan();renderShoppingList();renderRecipes();renderAgenda();renderCalSyncPrefs();renderDashboard();renderTodayWorkout();renderCycle();renderQuickLog();renderHomeNutrition();renderEffect();renderGoals();renderPhotos();
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
 checklist.push([h.id,h.title]);data.checklistItems=checklist.map(x=>[...x]);
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
function habitEffect(){
  const start=lsGet(startKey)||today(),n=checklist.length,per={};checklist.forEach(([id])=>per[id]=0);
  let done=0,days=0;
  for(let d=start;d<today();d=addDays(d,1)){days++;const c=data.days[d]?.checks||{};for(const [id] of checklist)if(c[id]){done++;per[id]++}}
  const tc=getDay().checks||{},todayDone=checklist.filter(([id])=>tc[id]).length;
  const possible=days*n,acc=possible?done/possible*100:null;
  const withToday=possible+n?(done+todayDone)/(possible+n)*100:0;
  return {n,days,done,possible,acc,todayDone,today:n?todayDone/n*100:0,withToday,per:checklist.map(([id,t])=>({id,t,pct:days?per[id]/days*100:null}))};
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
    if(per)per.innerHTML=e.days?`<p class="small" style="margin:10px 0 6px">Por hábito (desde el inicio del ciclo)</p>`+e.per.slice().sort((a,b)=>b.pct-a.pct).map(h=>`<div class="effrow"><span>${escHtml(h.t)}</span><div class="progress"><div class="bar" style="width:${Math.round(h.pct)}%;background:${h.pct>=75?'var(--ok)':h.pct>=50?'var(--warn)':'var(--danger)'}"></div></div><b>${Math.round(h.pct)}%</b></div>`).join(''):'';
  });
}
function xpFloat(txt){const pill=document.getElementById('xpPill');if(!pill)return;const f=document.createElement('span');f.className='xpfloat';f.textContent=txt;pill.parentElement.style.position='relative';pill.parentElement.appendChild(f);setTimeout(()=>f.remove(),1300);pill.classList.remove('xpbump');void pill.offsetWidth;pill.classList.add('xpbump')}
// Bono de día perfecto: +50 al pasar a tener todos marcados; −50 si dejas de tenerlos (sin estado guardado)
function allDone(d){return checklist.length>0&&checklist.every(([id])=>d.checks[id])}
