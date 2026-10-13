// RENOVA · interfaz general
// Navegación entre pantallas, render principal, hábitos diarios y datos rápidos del día.
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
 const n=checklist.filter(x=>d.checks[x[0]]).length,p=checklist.length?Math.round(n/checklist.length*100):0;
 document.getElementById('dayPct').textContent=p+'%';document.getElementById('dayBar').style.width=p+'%';
 document.getElementById('dayNum').textContent=dayIndex()+'/84';
 document.getElementById('streak').textContent=streak();
 const last=data.measurements.at(-1);document.getElementById('weightHome').textContent=last?.weight!=null?last.weight+' kg':'—';document.getElementById('waistHome').textContent=last?.waist!=null?last.waist+' cm':'—';
 document.getElementById('xpPill').textContent=data.xp+' XP · Nivel '+(Math.floor(data.xp/500)+1);
 document.getElementById('checks').innerHTML=checklist.map(([k,t])=>{const id=escHtml(k);return `<div class="check"><input id="chk_${id}" type="checkbox" ${d.checks[k]?'checked':''} onchange="toggleCheck('${id}',this.checked)"><label for="chk_${id}" class="${d.checks[k]?'done':''}" style="flex:1">${escHtml(t)}</label><button type="button" class="btn danger" style="padding:6px 9px" aria-label="Quitar ${escHtml(t)}" onclick="removeChecklistTask('${id}')">×</button></div>`}).join('')||'<div class="empty">Aún no tienes hábitos. Crea el primero arriba.</div>';
 ['steps','water','sleep','calories','note'].forEach(k=>document.getElementById(k).value=d[k]??'');
 document.getElementById('weight').value=last?.weight??'';document.getElementById('waist').value=last?.waist??'';
 document.getElementById('quote').textContent=dailyQuote();
 renderExercises();renderHistory();renderTrend();renderMenus();renderShoppingList();renderAgenda();renderCalSyncPrefs();renderDashboard();renderTodayWorkout();renderCycle();renderQuickLog();renderHomeNutrition();renderGoals();
}
function tickClock(){const now=new Date();const t=document.getElementById('clockTime'),d=document.getElementById('todayLabel');if(t)t.textContent=now.toLocaleTimeString('es-CO',{hour:'numeric',minute:'2-digit'});if(d){const s=now.toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long',year:'numeric'});d.textContent=s.charAt(0).toUpperCase()+s.slice(1)}}
setInterval(tickClock,15000);
function renderCycle(){const e=document.getElementById('cycleInfo');if(!e)return;const start=lsGet(startKey)||today();e.innerHTML=`Vas en el <b>día ${dayIndex()} de 84</b>. Tu ciclo empezó el <b>${escHtml(shortDate(start))}</b>${dayIndex()>=84?' y ya lo completaste 🎉':' y termina el '+escHtml(shortDate(addDays(start,83)))}.`;const i=document.getElementById('cycleStart');if(i&&document.activeElement!==i)i.value=start}
function setCycleStart(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')){toast('Elige una fecha válida');return}if(date>today()){toast('La fecha no puede ser futura');return}if(!confirm('¿Cambiar el inicio del ciclo al '+shortDate(date)+'?'))return;lsSet(startKey,date);save();if(supabaseUser)queueState();render();toast('Ciclo actualizado: día '+dayIndex()+' de 84')}
const QUOTES=['No necesitas hacerlo perfecto. Necesitas hacerlo hoy.','La disciplina es elegir lo que quieres más sobre lo que quieres ahora.','Un día a la vez. Una serie a la vez.','Lo que repites, te construye.','No negocies contigo: cumple y después descansa.','Constancia sobre perfección.','Hoy suma. Aunque sea poco, suma.','El progreso aburrido es progreso real.','Tu yo de dentro de 84 días te lo va a agradecer.','Hazlo fácil de empezar y difícil de dejar.'];
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
 if(v)d.checks[k]=true;else delete d.checks[k];
 data.xp=Math.max(0,Number(data.xp||0)+(v?25:-25));save();
 if(supabaseUser&&habitsCloud&&isUuid(k))queueCheck(k,date,v,true);
 if(supabaseUser)queueState();
 render();toast(v?'✓ Hecho · +25 XP':'Marcado como pendiente')
}
function saveDay(){const date=today(),d=getDay(date);['steps','water','sleep','calories','note'].forEach(k=>d[k]=document.getElementById(k).value);save();if(supabaseUser)queueLog(date);toast('Día guardado');render()}
