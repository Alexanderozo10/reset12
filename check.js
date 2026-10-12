
const BASE_KEY='reset12_v5';
const CLIENT_ID='800988810295-el6fi6505u0djs46um3i681qhdlu8pf2.apps.googleusercontent.com';
let currentUser=null;
let KEY=BASE_KEY;
let startKey='reset12_start';
const DEFAULT_CHECKLIST=[
 ['water','Tomé suficiente agua'],['protein','Cumplí mi proteína del día'],['meals','Respeté mis 3 comidas'],['steps','Cumplí mis pasos'],['training','Entrené / hice actividad'],['sleep','Dormí lo planificado'],['discipline','Evité picoteos innecesarios'],['mind','Hice algo positivo por mí']
];
let checklist=DEFAULT_CHECKLIST.map(x=>[...x]);
const exercises=[
 ['Día 1 · Tren superior','Press pecho','Remo','Press hombro','Jalón al pecho','Bíceps','Tríceps'],
 ['Día 2 · Tren inferior','Prensa','Peso muerto rumano','Extensión de cuádriceps','Curl femoral','Gemelos','Caminata 10–15 min'],
 ['Día 3 · Descanso activo','Caminata 30–45 min','Movilidad 10 min'],
 ['Día 4 · Tren superior','Press inclinado','Remo sentado','Elevaciones laterales','Jalón','Bíceps','Tríceps'],
 ['Día 5 · Tren inferior','Sentadilla/prensa','Peso muerto rumano','Extensión','Curl femoral','Gemelos','Caminata 10–20 min']
];
let data={days:{},measurements:[],xp:0,customHabits:[],agenda:{breakfast:'07:00',lunch:'13:00',gym:'19:00',dinner:'21:15',sleep:'23:00',measure:'06:00'},shoppingList:[]};
function userKey(email,suffix){return suffix+'_'+encodeURIComponent(email.toLowerCase())}
function loadUserData(email){
  const scopedKey=userKey(email,BASE_KEY), scopedStart=userKey(email,'reset12_start');
  if(!localStorage.getItem(scopedKey)){
    const legacy=localStorage.getItem(BASE_KEY);
    if(legacy)localStorage.setItem(scopedKey,legacy);
    const legacyStart=localStorage.getItem('reset12_start');
    if(legacyStart)localStorage.setItem(scopedStart,legacyStart);
  }
  KEY=scopedKey; startKey=scopedStart;
  try{data=JSON.parse(localStorage.getItem(KEY)||'{"days":{},"measurements":[],"xp":0}');data.customHabits ||= [];data.agenda ||= {breakfast:'07:00',lunch:'13:00',gym:'19:00',dinner:'21:15',sleep:'23:00',measure:'06:00'};data.shoppingList ||= []}
  catch{data={days:{},measurements:[],xp:0,customHabits:[],agenda:{breakfast:'07:00',lunch:'13:00',gym:'19:00',dinner:'21:15',sleep:'23:00',measure:'06:00'},shoppingList:[]}}
  data.customHabits ||= []; data.agenda ||= {breakfast:'07:00',lunch:'13:00',gym:'19:00',dinner:'21:15',sleep:'23:00',measure:'06:00'}; data.shoppingList ||= [];
  if(!Array.isArray(data.checklistItems))data.checklistItems=DEFAULT_CHECKLIST.map(x=>[...x]);
  checklist=data.checklistItems.map(x=>[String(x[0]),String(x[1])]);
}

function today(){const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function getDay(){data.days[today()] ||= {checks:{},steps:'',water:'',sleep:'',calories:'',note:'',exercises:{}};return data.days[today()]}
let syncTimer=null;
function save(){
  localStorage.setItem(KEY,JSON.stringify(data));
  scheduleAutoBackup();
}
function scheduleAutoBackup(){
  if(!driveToken)return;
  clearTimeout(syncTimer);
  syncTimer=setTimeout(()=>backupDrive(true),1800);
}
function toast(t){let e=document.getElementById('toast');e.textContent=t;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),1600)}
function show(id){
 document.querySelectorAll('.screen').forEach(x=>x.classList.remove('active'));document.getElementById(id).classList.add('active');
 document.querySelectorAll('.nav button').forEach(x=>x.classList.toggle('active',x.dataset.tab===id));
 render();
}
function render(){
 let d=getDay();
 document.getElementById('todayLabel').textContent=new Date().toLocaleDateString('es-CO',{weekday:'long',day:'numeric',month:'long'});
 const n=checklist.filter(x=>d.checks[x[0]]).length,p=Math.round(n/checklist.length*100);
 document.getElementById('dayPct').textContent=p+'%';document.getElementById('dayBar').style.width=p+'%';
 document.getElementById('dayNum').textContent=dayIndex()+'/84';
 document.getElementById('streak').textContent=streak();
 const last=data.measurements.at(-1);document.getElementById('weightHome').textContent=last?last.weight+' kg':'—';document.getElementById('waistHome').textContent=last?last.waist+' cm':'—';
 document.getElementById('xpPill').textContent=data.xp+' XP · Nivel '+(Math.floor(data.xp/500)+1);
 const baseChecks=checklist.map(([k,t])=>`<div class="check"><input aria-label="Marcar ${escHtml(t)}" type="checkbox" ${d.checks[k]?'checked':''} onchange="toggleCheck('${k}',this.checked)"><span class="${d.checks[k]?'done':''}">${escHtml(t)}</span><button type="button" class="btn danger" style="padding:6px 9px" aria-label="Eliminar ${escHtml(t)}" onclick="removeChecklistTask('${k}')">×</button></div>`).join('') || '<div class="empty">Aún no tienes tareas. Crea la primera arriba.</div>'; document.getElementById('checks').innerHTML=baseChecks; document.getElementById('customHabits').innerHTML=(data.customHabits||[]).map((h,i)=>`<div class="check"><input type="checkbox" ${d.checks['custom_'+i]?'checked':''} onchange="toggleCheck('custom_${i}',this.checked)"><span class="${d.checks['custom_'+i]?'done':''}">${h}</span><button class="btn danger" style="padding:6px 8px" onclick="removeHabit(${i})">×</button></div>`).join('');
 ['steps','water','sleep','calories','note'].forEach(k=>document.getElementById(k).value=d[k]||'');
 document.getElementById('weight').value=last?.weight||'';document.getElementById('waist').value=last?.waist||'';
 renderExercises();renderHistory();renderTrend();renderMenus();renderAgenda();renderCalendarEvents();
}
function addChecklistTask(){const input=document.getElementById('newChecklistTask'),title=(input.value||'').trim();if(!title){toast('Escribe el nombre de la tarea');input.focus();return}if(checklist.some(x=>x[1].toLocaleLowerCase()===title.toLocaleLowerCase())){toast('Esa tarea ya existe');return}const key='task_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,6);checklist.push([key,title]);data.checklistItems=checklist.map(x=>[...x]);input.value='';save();render();toast('Tarea diaria creada')}
function removeChecklistTask(key){const task=checklist.find(x=>x[0]===key);if(!task)return;if(!confirm('¿Eliminar la tarea “'+task[1]+'” del checklist? Se quitará también de los registros diarios.'))return;checklist=checklist.filter(x=>x[0]!==key);data.checklistItems=checklist.map(x=>[...x]);Object.values(data.days||{}).forEach(day=>{if(day.checks)delete day.checks[key]});save();render();toast('Tarea eliminada')}
function toggleCheck(k,v){let d=getDay();if(d.checks[k]===v)return;d.checks[k]=v;data.xp+=v?25:-25;if(data.xp<0)data.xp=0;save();render();toast(v?'✓ Hecho · +25 XP':'Marcado como pendiente')}
function saveDay(){let d=getDay();['steps','water','sleep','calories','note'].forEach(k=>d[k]=document.getElementById(k).value);save();toast('Día guardado');render()}
function renderExercises(){
 const idx=((dayIndex()-1)%5), arr=exercises[idx];
 document.getElementById('exercises').innerHTML=`<div class="card"><b>${arr[0]}</b><div class="small">Registra peso y repeticiones para aprender de tu progreso.</div></div>`+
 arr.slice(1).map((name,i)=>{let k='e'+i,v=getDay().exercises[k]||{};return `<div class="exercise"><div class="name">${name}</div><div class="two"><input placeholder="kg" type="number" step=".5" value="${v.kg||''}" onchange="ex('${k}','kg',this.value)"><input placeholder="reps" type="number" value="${v.reps||''}" onchange="ex('${k}','reps',this.value)"></div></div>`}).join('');
}
function ex(k,f,v){getDay().exercises[k]||={};getDay().exercises[k][f]=v;save()}
function saveProgress(){let w=parseFloat(document.getElementById('weight').value),wa=parseFloat(document.getElementById('waist').value);if(!w||!wa){toast('Completa peso y cintura');return}data.measurements.push({date:today(),weight:w,waist:wa});save();toast('Medición guardada');render()}
function renderTrend(){const e=document.getElementById('trend');if(!e)return;if(data.measurements.length<2){e.innerHTML='<div class="empty">Registra al menos 2 mediciones para ver tendencia.</div>';return}const a=data.measurements.slice(-6);const first=a[0],last=a[a.length-1],dw=(last.weight-first.weight).toFixed(1),dc=(last.waist-first.waist).toFixed(1);e.innerHTML=`<div class="grid"><div class="stat"><div class="num">${dw>0?'+':''}${dw} kg</div><div class="label">cambio de peso</div></div><div class="stat"><div class="num">${dc>0?'+':''}${dc} cm</div><div class="label">cambio de cintura</div></div></div><div class="small" style="margin-top:10px">${a.map(x=>`${x.date}: ${x.weight} kg · ${x.waist} cm`).join('<br>')}</div>`}
function renderHistory(){let h=document.getElementById('history');if(!data.measurements.length){h.innerHTML='<div class="empty">Aún no hay mediciones.</div>';return}h.innerHTML=data.measurements.slice().reverse().map(x=>`<div class="check"><span><b>${x.date}</b><br><span class="small">${x.weight} kg · ${x.waist} cm cintura</span></span></div>`).join('')}
function dayIndex(){if(!localStorage.getItem(startKey))localStorage.setItem(startKey,today());let a=new Date(localStorage.getItem(startKey)),b=new Date(today());return Math.min(84,Math.max(1,Math.floor((b-a)/86400000)+1))}
function streak(){let s=0,d=new Date();for(let i=0;i<84;i++){const k=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0'),x=data.days[k];if(!x)break;const required=Math.max(1,Math.ceil(checklist.length*0.6));let n=checklist.filter(q=>x.checks?.[q[0]]).length;if(n<required)break;s++;d.setDate(d.getDate()-1)}return s}
function exportData(){let blob=new Blob([JSON.stringify({data,start:localStorage.getItem(startKey)},null,2)],{type:'application/json'}),a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='RENOVA-backup-'+today()+'.json';a.click();URL.revokeObjectURL(a.href)}
function importData(e){let f=e.target.files[0];if(!f)return;let r=new FileReader();r.onload=()=>{try{let o=JSON.parse(r.result);data=o.data;localStorage.setItem(startKey,o.start||today());save();render();toast('Backup importado')}catch{toast('Archivo no válido')}};r.readAsText(f)}
function resetAll(){if(confirm('¿Borrar todos tus datos de RENOVA? Esta acción no se puede deshacer.')){localStorage.removeItem(KEY);localStorage.removeItem(startKey);location.reload()}}

const MENUS=[
 {title:'Día 1 · Pollo & arroz',items:['Desayuno: 3 huevos + 2 claras + arepa pequeña + fruta','Almuerzo: 180 g pollo + 150 g arroz cocido + ensalada + 1 cdita aceite','Cena: 180 g carne magra + papa mediana + verduras']},
 {title:'Día 2 · Carne & papa',items:['Desayuno: 2 huevos + 120 g claras + avena + banano pequeño','Almuerzo: 180 g carne magra + 250 g papa + ensalada','Cena: 180 g pollo + 120 g arroz cocido + verduras']},
 {title:'Día 3 · Pollo & pasta',items:['Desayuno: tortilla de 3 huevos + queso bajo en grasa + fruta','Almuerzo: 180 g pollo + 140 g pasta cocida + verduras','Cena: 180 g carne magra + 200 g papa + ensalada']},
 {title:'Día 4 · Arroz & huevos',items:['Desayuno: 3 huevos + 2 claras + arepa + fruta','Almuerzo: 180 g carne magra + 150 g arroz + ensalada','Cena: 180 g pollo + 200 g papa + verduras']},
 {title:'Día 5 · Pollo & arepa',items:['Desayuno: 3 huevos + queso + arepa pequeña + fruta','Almuerzo: 180 g pollo + 150 g arroz + ensalada','Cena: 180 g carne magra + papa + verduras']},
 {title:'Día 6 · Flexible controlado',items:['Desayuno: huevos + avena + fruta','Almuerzo: proteína magra 180 g + carbohidrato 1 porción + verduras','Cena: proteína magra 180 g + verduras + carbohidrato pequeño']},
 {title:'Día 7 · Recuperación',items:['Desayuno: huevos + arepa + fruta','Almuerzo: pollo 180 g + arroz 150 g + ensalada','Cena: carne magra 180 g + papa + verduras']}
];
function renderMenus(){const idx=(dayIndex()-1)%7,m=MENUS[idx];const tm=document.getElementById('todayMenu');if(tm)tm.innerHTML=m.items.map(x=>`<div class="check"><span>${x}</span></div>`).join('');const tag=document.getElementById('menuDayTag');if(tag)tag.textContent='Día '+(idx+1);const wm=document.getElementById('weekMenus');if(wm)wm.innerHTML=MENUS.map((x,i)=>`<div class="menu-box"><div class="menu-day">DÍA ${i+1}</div><div class="menu-title">${x.title}</div><div class="small">${x.items.join(' · ')}</div></div>`).join('')}
function generateShoppingList(){const list=['Huevos','Pollo','Carne magra','Arroz','Papa','Avena','Arepas','Pasta','Frutas','Verduras variadas','Queso bajo en grasa','Aceite de oliva'];data.shoppingList=list;save();const e=document.getElementById('shoppingList');if(e)e.innerHTML='<div class="pill-row">'+list.map(x=>`<span class="pill">${x}</span>`).join('')+'</div>';toast('Lista de compras generada')}
function addHabit(){const e=document.getElementById('newHabit'),v=(e.value||'').trim();if(!v)return;data.customHabits.push(v);e.value='';save();render();toast('Hábito agregado · +25 XP al cumplirlo')}
function removeHabit(i){if(confirm('¿Eliminar este hábito?')){data.customHabits.splice(i,1);save();render()}}
function openZimbraCompose(){window.open('https://correo.sithonduras.com/','_blank','noopener');toast('Abre Zimbra para redactar tu correo')}
async function copyMailTech(){const t='Hola, necesito evaluar una integración segura de mi correo corporativo con una aplicación de productividad. ¿Me pueden confirmar: 1) servidor SMTP, 2) puerto SMTP, 3) tipo de seguridad (SSL/TLS/STARTTLS), y 4) si está habilitado el acceso a la API REST de Zimbra o algún mecanismo de autenticación para aplicaciones externas? No necesito compartir ninguna contraseña.';try{await navigator.clipboard.writeText(t);document.getElementById('mailTechStatus').textContent='✅ Solicitud copiada. No incluye contraseña.';toast('Solicitud copiada')}catch{document.getElementById('mailTechStatus').textContent=t}}
function saveAgendaSettings(){data.agenda={breakfast:document.getElementById('timeBreakfast').value,lunch:document.getElementById('timeLunch').value,gym:document.getElementById('timeGym').value,dinner:document.getElementById('timeDinner').value,sleep:document.getElementById('timeSleep').value,measure:document.getElementById('timeMeasure').value};save();renderAgenda();toast('Horarios guardados')}
function renderAgenda(){const a=data.agenda||{},vals={timeBreakfast:a.breakfast||'07:00',timeLunch:a.lunch||'13:00',timeGym:a.gym||'19:00',timeDinner:a.dinner||'21:15',timeSleep:a.sleep||'23:00',timeMeasure:a.measure||'06:00'};Object.entries(vals).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.value=v});const e=document.getElementById('todayAgenda');if(!e)return;const items=[['🍳',a.breakfast||'07:00','Desayuno'],['🍛',a.lunch||'13:00','Almuerzo'],['🏋️',a.gym||'19:00','Entrenamiento'],['🥗',a.dinner||'21:15','Cena'],['😴',a.sleep||'23:00','Dormir'],['📏',a.measure||'06:00','Medición semanal']];e.innerHTML=items.map(x=>`<div class="agenda-item"><div class="agenda-time">${x[0]} ${x[1]}</div><div class="agenda-title">${x[2]}</div></div>`).join('')}
let calendarToken=null;const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
function calendarMsg(t){const e=document.getElementById('calendarStatus');if(e)e.textContent=t}
function setCalendarTag(t){const e=document.getElementById('calendarTag');if(e)e.textContent=t}
function connectCalendar(){if(!currentUser){toast('Primero inicia sesión con Google');return}if(!window.google?.accounts?.oauth2){calendarMsg('Google todavía está cargando.');return}window._calendarTokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:CALENDAR_SCOPE,callback:async(resp)=>{if(resp.error){console.error('Calendar OAuth error',resp);calendarMsg('❌ No se pudo autorizar Calendar: '+(resp.error_description||resp.error));setCalendarTag('LOCAL');return}calendarToken=resp.access_token;sessionStorage.setItem('reset12_calendar_token',calendarToken);localStorage.setItem(userKey(currentUser.email,'reset12_calendar_connected'),'1');setCalendarTag('CLOUD');calendarMsg('🟢 Google Calendar conectado en esta sesión.');toast('Calendar conectado');await renderCalendarEvents()}});window._calendarTokenClient.requestAccessToken({prompt:''})}
async function calendarFetch(url,options={}){if(!calendarToken)throw new Error('NO_CAL_TOKEN');options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+calendarToken,'Content-Type':'application/json'});const r=await fetch(url,options);if(r.status===401){calendarToken=null;setCalendarTag('LOCAL');throw new Error('CAL_AUTH_EXPIRED')}if(!r.ok){const body=await r.text();console.error('Calendar API error',r.status,body);throw new Error('CAL_API_'+r.status+'_'+body)}return r}
function isoFor(date,time){return new Date(`${date}T${time||'07:00'}:00-05:00`).toISOString()}
function eventId(date,type){return ('reset12'+date.replace(/-/g,'')+type).replace(/[^a-v0-9]/gi,'').toLowerCase()}
function calendarEvent(date,type,time,title,duration){const start=isoFor(date,time),end=new Date(new Date(start).getTime()+duration*60000).toISOString();return {id:eventId(date,type),summary:'RESET 12 · '+title,description:'Evento creado por RESET 12 · 84 días · constancia sobre perfección.',start:{dateTime:start,timeZone:'America/Bogota'},end:{dateTime:end,timeZone:'America/Bogota'},reminders:{useDefault:true}}}
async function insertCalendarEvent(ev,notify=false){const qs='sendUpdates='+(notify?'all':'none');try{await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+qs,{method:'POST',body:JSON.stringify(ev)});return true}catch(e){if(String(e.message).includes('CAL_API_409'))return true;throw e}}
async function syncCalendarWeek(){if(!calendarToken){calendarMsg('Conecta Google Calendar primero.');toast('Pulsa Conectar');return}try{calendarMsg('Sincronizando 7 días…');const a=data.agenda||{};const todayD=new Date();const jobs=[['breakfast','desayuno','Desayuno',30],['lunch','almuerzo','Almuerzo',45],['gym','gym','Entrenamiento',120],['dinner','cena','Cena',30],['sleep','sleep','Dormir',480]];for(let i=0;i<7;i++){const d=new Date(todayD);d.setDate(todayD.getDate()+i);const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');for(const [key,type,title,dur] of jobs)await insertCalendarEvent(calendarEvent(date,type,a[key],title,dur),false)}calendarMsg('🟢 Semana sincronizada sin duplicar eventos.');toast('Semana enviada a Calendar');await renderCalendarEvents()}catch(e){console.error(e);calendarMsg('❌ Error Calendar: '+(e.message||'revisa el permiso y la API'));toast('Error con Calendar')}}
function escHtml(v){return String(v||'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function setDefaultEventDate(){const e=document.getElementById('eventDate');if(e&&!e.value)e.value=today()}
function calcEventTimes(){const d=document.getElementById('eventDuration')?.value;const wrap=document.getElementById('eventEndWrap');if(wrap)wrap.style.display=d==='custom'?'block':'none';if(d!=='custom'){const st=document.getElementById('eventStart')?.value||'08:00';const [h,m]=st.split(':').map(Number);const end=new Date(2000,0,1,h,m);end.setMinutes(end.getMinutes()+Number(d||60));const e=document.getElementById('eventEnd');if(e)e.value=String(end.getHours()).padStart(2,'0')+':'+String(end.getMinutes()).padStart(2,'0')}}
function eventDurationMinutes(start,end){const [sh,sm]=start.split(':').map(Number),[eh,em]=end.split(':').map(Number);let mins=(eh*60+em)-(sh*60+sm);if(mins<=0)mins+=1440;return mins}
function makeRecurrence(repeat,date){if(repeat==='weekly')return ['RRULE:FREQ=WEEKLY'];if(repeat==='monthly')return ['RRULE:FREQ=MONTHLY'];return undefined}
async function createCalendarEventFromForm(){
  if(!calendarToken){calendarMsg('Conecta Google Calendar primero.');toast('Pulsa Conectar');return}
  const title=(document.getElementById('eventTitle')?.value||'').trim(),date=document.getElementById('eventDate')?.value||today(),startTime=document.getElementById('eventStart')?.value||'08:00',durationSel=document.getElementById('eventDuration')?.value||'60';
  if(!title){toast('Escribe el título del evento');document.getElementById('eventTitle')?.focus();return}
  let endTime;
  if(durationSel==='custom') endTime=document.getElementById('eventEnd')?.value||''; else {calcEventTimes();endTime=document.getElementById('eventEnd')?.value||'09:00'}
  if(!endTime){toast('Define la hora de finalización');return}
  const duration=eventDurationMinutes(startTime,endTime), location=(document.getElementById('eventLocation')?.value||'').trim(), description=(document.getElementById('eventDescription')?.value||'').trim(), reminder=Number(document.getElementById('eventReminder')?.value||30), repeat=document.getElementById('eventRepeat')?.value||'none', meet=document.getElementById('eventMeet')?.checked;
  const raw=(document.getElementById('eventAttendees')?.value||'').split(/[;,\s]+/).map(x=>x.trim().toLowerCase()).filter(Boolean);
  const attendees=[...new Set(raw.filter(x=>/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x)))].map(email=>({email}));
  if(raw.length!==attendees.length){toast('Revisa los correos de invitados');return}
  const event={id:'r12'+Date.now().toString(32)+Math.random().toString(32).slice(2,8),summary:title,description:description||undefined,location:location||undefined,start:{dateTime:isoFor(date,startTime),timeZone:'America/Bogota'},end:{dateTime:isoFor(date,endTime),timeZone:'America/Bogota'},attendees:attendees.length?attendees:undefined,reminders:{useDefault:false,overrides:[{method:'popup',minutes:reminder}]}};
  const rec=makeRecurrence(repeat,date);if(rec)event.recurrence=rec;
  let url='https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates='+(attendees.length?'all':'none');
  if(meet){event.conferenceData={createRequest:{requestId:'r12meet'+Date.now().toString(32)+Math.random().toString(32).slice(2,8),conferenceSolutionKey:{type:'hangoutsMeet'}}};url+='&conferenceDataVersion=1'}
  const status=document.getElementById('eventCreateStatus');if(status)status.textContent='Creando evento…';
  try{const r=await calendarFetch(url,{method:'POST',body:JSON.stringify(event)});const created=await r.json();let msg='🟢 Evento creado en Google Calendar.';if(created.htmlLink)msg+=' <a href="'+escHtml(created.htmlLink)+'" target="_blank" rel="noopener">Abrir Calendar</a>';if(created.hangoutLink)msg+=' · <a href="'+escHtml(created.hangoutLink)+'" target="_blank" rel="noopener">Abrir Meet</a>';if(status)status.innerHTML=msg;toast('Evento agendado');document.getElementById('eventTitle').value='';document.getElementById('eventDescription').value='';document.getElementById('eventLocation').value='';document.getElementById('eventAttendees').value='';document.getElementById('eventMeet').checked=false;await renderCalendarEvents()}catch(e){console.error(e);if(status)status.textContent='❌ No se pudo crear: '+(e.message||'error de Calendar');toast('No se pudo crear el evento')}}
async function renderCalendarEvents(){const e=document.getElementById('calendarEvents');if(!e)return;if(!calendarToken){e.innerHTML='<div class="empty">Conecta Calendar para ver tus próximos eventos.</div>';return}try{const now=new Date().toISOString(),r=await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin='+encodeURIComponent(now)+'&maxResults=10&singleEvents=true&orderBy=startTime');const j=await r.json();if(!j.items?.length){e.innerHTML='<div class="empty">No hay eventos próximos.</div>';return}e.innerHTML=j.items.map(x=>{const st=x.start?.dateTime||x.start?.date;const meet=x.hangoutLink?` · <a href="${escHtml(x.hangoutLink)}" target="_blank" rel="noopener">Meet</a>`:'';return `<div class="check"><span><b>${escHtml(x.summary||'Sin título')}</b><br><span class="small">${new Date(st).toLocaleString('es-CO',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${meet}</span></span></div>`}).join('')}catch(err){if(err.message==='CAL_AUTH_EXPIRED')calendarMsg('Sesión de Calendar vencida. Pulsa Conectar.');e.innerHTML='<div class="empty">No fue posible leer Calendar.</div>'}}
function bootCalendar(){const connected=currentUser&&localStorage.getItem(userKey(currentUser.email,'reset12_calendar_connected'))==='1';if(connected){setCalendarTag('CLOUD');calendarMsg('Calendar autorizado anteriormente. Pulsa Conectar para usarlo en esta sesión.')}setDefaultEventDate();calcEventTimes()}
let driveToken=null;
let driveFolderId=null;
let driveBackupFileId=null;
const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';

function driveMsg(t){const e=document.getElementById('driveStatus');if(e)e.textContent=t}
function setSyncTag(t){const e=document.getElementById('syncTag');if(e)e.textContent=t}

function connectDrive(){
  if(!currentUser){toast('Primero inicia sesión con Google');return}
  if(!window.google?.accounts?.oauth2){driveMsg('Google todavía está cargando. Intenta de nuevo.');return}
  window._driveTokenClient=google.accounts.oauth2.initTokenClient({
    client_id:CLIENT_ID,scope:DRIVE_SCOPE,
    callback:async(resp)=>{
      if(resp.error){driveMsg('No se pudo autorizar Drive.');setSyncTag('LOCAL');return}
      driveToken=resp.access_token;
      localStorage.setItem(userKey(currentUser.email,'reset12_drive_connected'),'1');
      driveMsg('🟢 Drive conectado. Sincronización automática activa.');
      setSyncTag('CLOUD');
      toast('Drive conectado');
      await backupDrive(true);
    }
  });
  window._driveTokenClient.requestAccessToken({prompt:''});
}

async function driveFetch(url,options={}){
  if(!driveToken)throw new Error('NO_TOKEN');
  options.headers=Object.assign({},options.headers||{},{'Authorization':'Bearer '+driveToken});
  const r=await fetch(url,options);
  if(r.status===401){driveToken=null;setSyncTag('LOCAL');throw new Error('AUTH_EXPIRED')}
  if(!r.ok)throw new Error(await r.text());
  return r;
}

async function findResetFolder(){
  if(driveFolderId)return driveFolderId;
  const q=encodeURIComponent("name='RESET 12' and mimeType='application/vnd.google-apps.folder' and trashed=false");
  const r=await driveFetch('https://www.googleapis.com/drive/v3/files?q='+q+'&spaces=drive&fields=files(id,name)');
  const j=await r.json();
  if(j.files?.length){driveFolderId=j.files[0].id;return driveFolderId}
  const body={name:'RESET 12',mimeType:'application/vnd.google-apps.folder'};
  const c=await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id,name',{
    method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)
  });
  driveFolderId=(await c.json()).id;
  return driveFolderId;
}

async function findResetBackup(folder){
  if(driveBackupFileId)return driveBackupFileId;
  const q=encodeURIComponent("name='RESET12-backup.json' and '"+folder+"' in parents and trashed=false");
  const r=await driveFetch('https://www.googleapis.com/drive/v3/files?q='+q+'&spaces=drive&fields=files(id,name,modifiedTime)');
  const j=await r.json();
  if(j.files?.length)driveBackupFileId=j.files[0].id;
  return driveBackupFileId;
}

async function backupDrive(silent=false){
  try{
    if(!currentUser){if(!silent)toast('Primero inicia sesión con Google');return}
    if(!driveToken){if(!silent){driveMsg('Conecta Google Drive para guardar el respaldo.');toast('Pulsa Conectar Drive')}return}
    if(!silent)driveMsg('Guardando respaldo…');
    const folder=await findResetFolder();
    const payload=JSON.stringify({
      version:'RENOVA-V1',
      savedAt:new Date().toISOString(),
      user:{email:currentUser.email,name:currentUser.name},
      data:data,
      start:localStorage.getItem(startKey)
    },null,2);
    const hasLocalContent = Object.keys(data.days||{}).length>0 || (data.measurements||[]).length>0 || (data.customHabits||[]).length>0 || Number(data.xp||0)>0;
    if(!hasLocalContent && !silent){
      driveMsg('No se guardó: el perfil local parece vacío. Exporta o verifica tus datos antes de continuar.');
      toast('Respaldo cancelado para proteger tus datos');
      return;
    }
    const existing=await findResetBackup(folder);
    let r;
    if(existing){
      r=await driveFetch('https://www.googleapis.com/upload/drive/v3/files/'+existing+'?uploadType=media&fields=id,name,modifiedTime',{
        method:'PATCH',headers:{'Content-Type':'application/json'},body:payload
      });
    }else{
      const meta={name:'RESET12-backup.json',mimeType:'application/json',parents:[folder]};
      const boundary='reset12_'+Date.now();
      const body=new Blob([
        '--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n',
        JSON.stringify(meta),'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n',
        payload,'\r\n--'+boundary+'--'
      ]);
      r=await driveFetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime',{
        method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:body
      });
      driveBackupFileId=(await r.json()).id;
    }
    localStorage.setItem(userKey(currentUser.email,'reset12_last_drive_backup'),new Date().toISOString());
    driveMsg('🟢 Último respaldo: '+new Date().toLocaleString('es-CO'));
    setSyncTag('CLOUD');
    if(!silent)toast('☁️ Respaldo guardado');
  }catch(e){
    console.error(e);
    if(e.message==='AUTH_EXPIRED')driveMsg('Sesión de Drive vencida. Pulsa Conectar Drive.');
    else driveMsg('No se pudo guardar en Drive. Revisa la autorización.');
    if(!silent)toast('Error con Drive');
  }
}

function decodeJwtPayload(token){
  try{
    const p=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    return JSON.parse(decodeURIComponent(atob(p).split('').map(c=>'%'+('00'+c.charCodeAt(0).toString(16)).slice(-2)).join('')));
  }catch{return null}
}
function showAccount(){
  const chip=document.getElementById('accountChip');
  const card=document.getElementById('profileCard');
  const name=document.getElementById('profileName');
  const email=document.getElementById('profileEmail');
  const avatar=document.getElementById('profileAvatar');
  if(!currentUser)return;
  const displayName=currentUser.name||currentUser.email.split('@')[0]||'Usuario';
  if(chip){chip.textContent='👤 '+displayName;chip.style.display='block'}
  if(card)card.style.display='block';
  if(name)name.textContent=displayName;
  if(email)email.textContent=currentUser.email;
  if(avatar){
    if(currentUser.picture){
      avatar.innerHTML='<img alt="" src="'+currentUser.picture.replace(/"/g,'&quot;')+'">';
    }else{
      avatar.textContent=displayName.charAt(0).toUpperCase();
    }
  }
  const status=document.getElementById('profileStatus');
  if(status)status.textContent=driveToken?'☁️ Drive sincronizado':'🔐 Sesión activa';
}
function finishLogin(profile){
  currentUser={email:profile.email||'',name:profile.name||'Usuario',picture:profile.picture||''};
  if(!currentUser.email){toast('No se pudo identificar tu cuenta');return}
  localStorage.setItem('reset12_user',JSON.stringify(currentUser));
  loadUserData(currentUser.email);
  document.getElementById('loginOverlay').style.display='none';
  showAccount();
  const connected=localStorage.getItem(userKey(currentUser.email,'reset12_drive_connected'))==='1';
  if(connected){
    setSyncTag('LOCAL');
    const st=document.getElementById('profileStatus'); if(st)st.textContent='🔐 Sesión activa · Drive disponible al pulsar Conectar';
    driveMsg('Drive autorizado anteriormente. Pulsa Conectar Drive cuando quieras usarlo.');
  }
  render();
  bootCalendar();
}
function initGoogleLogin(){
  if(!window.google?.accounts?.id){setTimeout(initGoogleLogin,350);return}
  google.accounts.id.initialize({
    client_id:CLIENT_ID,
    callback:(response)=>{
      const p=decodeJwtPayload(response.credential);
      if(!p){toast('No se pudo iniciar sesión');return}
      finishLogin({email:p.email,name:p.name,picture:p.picture});
    },
    auto_select:false,
    cancel_on_tap_outside:true
  });
  google.accounts.id.renderButton(document.getElementById('googleSignInButton'),{
    theme:'outline',size:'large',type:'standard',text:'signin_with',shape:'pill',logo_alignment:'left',width:280
  });
}
function showAccountInfo(){
  if(!currentUser)return;
  const last=localStorage.getItem(userKey(currentUser.email,'reset12_last_drive_backup'));
  alert('RENOVA\\n\\nCuenta: '+currentUser.email+'\\nNombre: '+(currentUser.name||'Usuario')+'\\n\\n'+(driveToken?'☁️ Drive: conectado':'📱 Drive: no conectado')+(last?'\\nÚltimo respaldo: '+new Date(last).toLocaleString('es-CO'):''));
}
function logoutReset12(){
  if(!confirm('¿Cerrar sesión de RESET 12 en este dispositivo? Tus datos locales y el respaldo de Drive NO se borrarán.'))return;
  try{if(window.google?.accounts?.id?.disableAutoSelect)google.accounts.id.disableAutoSelect()}catch{}
  calendarToken=null;sessionStorage.removeItem('reset12_calendar_token');driveToken=null;sessionStorage.removeItem('reset12_drive_token');
  localStorage.removeItem('reset12_user');
  currentUser=null;
  driveToken=null;
  driveFolderId=null;
  driveBackupFileId=null;
  document.getElementById('profileCard').style.display='none';
  document.getElementById('accountChip').style.display='none';
  document.getElementById('loginOverlay').style.display='flex';
  initGoogleLogin();
}
function boot(){
  const saved=localStorage.getItem('reset12_user');
  if(saved){
    try{finishLogin(JSON.parse(saved));return}catch{}
  }
  document.getElementById('loginOverlay').style.display='flex';
  initGoogleLogin();
}
window.addEventListener('load',()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js');
  boot();
});

