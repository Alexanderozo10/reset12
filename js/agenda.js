// RENOVA · agenda y Google Calendar
// Horarios del día, conexión con Calendar, agenda propia y recordatorios (Web Push).
function saveAgendaSettings(){data.agenda={breakfast:document.getElementById('timeBreakfast').value,lunch:document.getElementById('timeLunch').value,gym:document.getElementById('timeGym').value,dinner:document.getElementById('timeDinner').value,sleep:document.getElementById('timeSleep').value,measure:document.getElementById('timeMeasure').value};save();if(supabaseUser)queuePrefs();renderAgenda();toast('Horarios guardados')}
function renderAgenda(){const a=data.agenda||{},vals={timeBreakfast:a.breakfast||'07:00',timeLunch:a.lunch||'13:00',timeGym:a.gym||'19:00',timeDinner:a.dinner||'21:15',timeSleep:a.sleep||'23:00',timeMeasure:a.measure||'06:00'};Object.entries(vals).forEach(([id,v])=>{const e=document.getElementById(id);if(e)e.value=v});const e=document.getElementById('todayAgenda');if(!e)return;const items=[['🍳',a.breakfast||'07:00','Desayuno'],['🍛',a.lunch||'13:00','Almuerzo'],['🏋️',a.gym||'19:00','Entrenamiento'],['🥗',a.dinner||'21:15','Cena'],['😴',a.sleep||'23:00','Dormir'],['📏',a.measure||'06:00','Medición semanal']];e.innerHTML=items.map(x=>`<div class="agenda-item"><div class="agenda-time">${x[0]} ${x[1]}</div><div class="agenda-title">${x[2]}</div></div>`).join('')}
let calendarToken=null;const CALENDAR_SCOPE='https://www.googleapis.com/auth/calendar.events';
function calendarMsg(t){const e=document.getElementById('calendarStatus');if(e)e.textContent=t}
function setCalendarTag(t){const e=document.getElementById('calendarTag');if(e)e.textContent=t}
function connectCalendar(){if(!currentUser){toast('Primero inicia sesión con Google');return}if(!window.google?.accounts?.oauth2){calendarMsg('Google todavía está cargando.');return}window._calendarTokenClient=google.accounts.oauth2.initTokenClient({client_id:CLIENT_ID,scope:CALENDAR_SCOPE,callback:async(resp)=>{if(resp.error){console.error('Calendar OAuth error',resp);calendarMsg('❌ No se pudo autorizar Calendar: '+(resp.error_description||resp.error));setCalendarTag('LOCAL');return}calendarToken=resp.access_token;sessionStorage.setItem('reset12_calendar_token',calendarToken);localStorage.setItem(userKey(currentUser.email,'reset12_calendar_connected'),'1');setCalendarTag('CLOUD');calendarMsg('🟢 Google Calendar conectado en esta sesión.');toast('Calendar conectado');await renderCalendarEvents()}});window._calendarTokenClient.requestAccessToken({prompt:''})}
async function calendarFetch(url,options={}){if(!calendarToken)throw new Error('NO_CAL_TOKEN');options.headers=Object.assign({},options.headers||{},{Authorization:'Bearer '+calendarToken,'Content-Type':'application/json'});const r=await fetch(url,options);if(r.status===401){calendarToken=null;setCalendarTag('LOCAL');throw new Error('CAL_AUTH_EXPIRED')}if(!r.ok){const body=await r.text();console.error('Calendar API error',r.status,body);throw new Error('CAL_API_'+r.status+'_'+body)}return r}
function isoFor(date,time){return new Date(`${date}T${time||'07:00'}:00-05:00`).toISOString()}
function eventId(date,type){return ('reset12'+date.replace(/-/g,'')+type).replace(/[^a-v0-9]/gi,'').toLowerCase()}
function calendarEvent(date,type,time,title,duration){const start=isoFor(date,time),end=new Date(new Date(start).getTime()+duration*60000).toISOString();return {id:eventId(date,type),summary:'RENOVA · '+title,description:'Evento creado por RENOVA · constancia sobre perfección.',start:{dateTime:start,timeZone:'America/Bogota'},end:{dateTime:end,timeZone:'America/Bogota'},reminders:{useDefault:true}}}
async function insertCalendarEvent(ev,notify=false){const qs='sendUpdates='+(notify?'all':'none');try{await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?'+qs,{method:'POST',body:JSON.stringify(ev)});return true}catch(e){if(String(e.message).includes('CAL_API_409'))return true;throw e}}
async function syncCalendarWeek(){if(!calendarToken){calendarMsg('Conecta Google Calendar primero.');toast('Pulsa Conectar');return}try{calendarMsg('Sincronizando 7 días…');const a=data.agenda||{};const todayD=new Date();const sel=calendarSyncSelection();const jobs=CAL_SYNC_ITEMS.filter(j=>sel.includes(j[0]));if(!jobs.length){calendarMsg('Elige al menos un bloque para enviar.');return}for(let i=0;i<7;i++){const d=new Date(todayD);d.setDate(todayD.getDate()+i);const date=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');for(const [key,type,title,dur] of jobs)await insertCalendarEvent(calendarEvent(date,type,a[key],title,dur),false)}calendarMsg('🟢 Semana enviada ('+jobs.map(j=>j[2]).join(', ')+') sin duplicar eventos.');toast('Semana enviada a Calendar');await renderCalendarEvents()}catch(e){console.error(e);calendarMsg('❌ Error Calendar: '+(e.message||'revisa el permiso y la API'));toast('Error con Calendar')}}
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
async function renderCalendarEvents(){const e=document.getElementById('calendarEvents');if(!e)return;if(!calendarToken){e.innerHTML='<div class="empty">Conecta Calendar para ver tus próximos eventos.</div>';return}try{const now=new Date().toISOString(),r=await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin='+encodeURIComponent(now)+'&maxResults=10&singleEvents=true&orderBy=startTime');const j=await r.json();if(!j.items?.length){e.innerHTML='<div class="empty">No hay eventos próximos.</div>';return}e.innerHTML=j.items.map(x=>{const st=x.start?.dateTime||x.start?.date;const meet=x.hangoutLink?` · <a href="${escHtml(x.hangoutLink)}" target="_blank" rel="noopener">Meet</a>`:'';return `<div class="check"><span><b>${escHtml(x.summary||'Sin título')}</b><br><span class="small">${new Date(st).toLocaleString('es-CO',{weekday:'short',day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'})}${meet}</span></span><button type="button" class="btn danger evdel" aria-label="Eliminar ${escHtml(x.summary||'evento')}" data-evid="${escHtml(x.id)}" data-evtitle="${escHtml(x.summary||'Sin título')}" data-evatt="${x.attendees?.length?1:0}" data-evrec="${x.recurringEventId?1:0}" onclick="deleteCalendarEvent(this.dataset)">×</button></div>`}).join('')}catch(err){if(err.message==='CAL_AUTH_EXPIRED')calendarMsg('Sesión de Calendar vencida. Pulsa Conectar.');e.innerHTML='<div class="empty">No fue posible leer Calendar.</div>'}}
function bootCalendar(){const connected=currentUser&&lsGet(userKey(currentUser.email,'reset12_calendar_connected'))==='1';if(connected){setCalendarTag('CLOUD');calendarMsg('Calendar autorizado anteriormente. Pulsa Conectar para usarlo en esta sesión.')}setDefaultEventDate();calcEventTimes()}

const CAL_SYNC_ITEMS=[['gym','gym','Entrenamiento',120],['breakfast','desayuno','Desayuno',30],['lunch','almuerzo','Almuerzo',45],['dinner','cena','Cena',30],['sleep','sleep','Dormir',480]];
function calendarSyncSelection(){return Array.isArray(data.calendarSync)?data.calendarSync:['gym']}
function toggleCalendarSync(key,on){const s=new Set(calendarSyncSelection());on?s.add(key):s.delete(key);data.calendarSync=[...s];save()}
function renderCalSyncPrefs(){const e=document.getElementById('calSyncPrefs');if(!e)return;const sel=calendarSyncSelection();e.innerHTML=CAL_SYNC_ITEMS.map(([k,,t])=>`<label class="pill" style="display:inline-flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" style="width:16px;height:16px" ${sel.includes(k)?'checked':''} onchange="toggleCalendarSync('${k}',this.checked)">${t}</label>`).join('')}

async function deleteCalendarEvent(ds){
  if(!calendarToken){calendarMsg('Conecta Google Calendar primero.');return}
  const att=ds.evatt==='1',rec=ds.evrec==='1';
  if(!confirm('¿Eliminar “'+ds.evtitle+'” de tu Google Calendar?'+(rec?'\n\nEs un evento repetido: solo se borrará esta fecha.':'')+(att?'\n\nSe avisará a los invitados que se canceló.':'')+'\n\nEsta acción no se puede deshacer.'))return;
  try{await calendarFetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'+encodeURIComponent(ds.evid)+'?sendUpdates='+(att?'all':'none'),{method:'DELETE'});toast('Evento eliminado');await renderCalendarEvents()}
  catch(e){console.error(e);if(String(e.message).includes('CAL_API_410')){toast('Ese evento ya estaba eliminado');await renderCalendarEvents()}else toast('No se pudo eliminar el evento')}
}
// ---- Agenda propia (v17) ------------------------------------------------
// Eventos guardados en RENOVA (tabla agenda_items), con aviso opcional por notificación.
let agendaCloud=false;
const REMIND_OPTS=[['','Sin aviso'],['0','A la hora'],['10','10 min antes'],['30','30 min antes'],['60','1 hora antes'],['1440','1 día antes']];
function agendaItems(){return (data.agendaItems||[]).slice().sort((a,b)=>a.starts_at<b.starts_at?-1:1)}
function localDateOf(iso){return fmtDate(new Date(iso))}
function agHHMM(iso){const d=new Date(iso);return String(d.getHours()).padStart(2,'0')+':'+String(d.getMinutes()).padStart(2,'0')}
function queueAgendaItem(it,del){
  if(!supabaseUser||!agendaCloud)return;
  if(del){cloud({key:'ag:'+it.id,t:'delete',table:'agenda_items',match:{id:it.id}});return}
  cloud({key:'ag:'+it.id,t:'upsert',table:'agenda_items',onConflict:'id',rows:[{id:it.id,title:it.title,starts_at:it.starts_at,duration_min:it.duration_min,remind_min:it.remind_min,notes:it.notes||null,updated_at:nowIso()}]});
}
function addAgendaItem(){
  const v=id=>document.getElementById(id)?.value||'',title=v('agTitle').trim().slice(0,120),date=v('agDate'),time=v('agTime');
  const msg=document.getElementById('agMsg');
  if(!title){msg.textContent='Escribe el nombre del evento.';return}
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!/^\d{2}:\d{2}$/.test(time)){msg.textContent='Elige fecha y hora.';return}
  const start=new Date(date+'T'+time+':00');
  const it={id:uuid(),title,starts_at:start.toISOString(),duration_min:Number(v('agDur'))||60,remind_min:v('agRemind')===''?null:Number(v('agRemind')),notes:v('agNotes').trim().slice(0,500)||null};
  (data.agendaItems ||= []).push(it);save();queueAgendaItem(it);
  ['agTitle','agNotes'].forEach(id=>{const e=document.getElementById(id);if(e)e.value=''});msg.textContent='';
  render();toast('📌 Evento guardado'+(it.remind_min!=null?' · con aviso':''));
}
function deleteAgendaItem(id){
  const it=(data.agendaItems||[]).find(x=>x.id===id);if(!it)return;
  if(!confirm('¿Borrar “'+it.title+'”?'))return;
  data.agendaItems=data.agendaItems.filter(x=>x.id!==id);save();queueAgendaItem(it,true);render();toast('Evento borrado');
}
function agendaRow(it,showDel=true){const end=new Date(new Date(it.starts_at).getTime()+it.duration_min*60000);return `<div class="check"><span style="flex:1"><b>${agHHMM(it.starts_at)}–${agHHMM(end.toISOString())}</b> ${escHtml(it.title)}${it.remind_min!=null?' <span class="small">🔔</span>':''}${it.notes?`<br><span class="small">${escHtml(it.notes)}</span>`:''}</span>${showDel?`<button type="button" class="evdel" aria-label="Borrar ${escHtml(it.title)}" onclick="deleteAgendaItem('${escHtml(it.id)}')">✕</button>`:''}</div>`}
function renderMyAgenda(){
  const host=document.getElementById('myAgenda');if(!host)return;
  const t=today(),limit=addDays(t,30),items=agendaItems().filter(it=>{const d=localDateOf(it.starts_at);return d>=t&&d<=limit});
  const byDay={};for(const it of items)(byDay[localDateOf(it.starts_at)] ||= []).push(it);
  const keep=id=>document.getElementById(id)?.value;
  host.innerHTML=`<div class="row"><b>📌 Mi agenda</b><span class="tag">${items.length} PRÓXIMOS</span></div>
  <div class="formgrid" style="margin-top:10px"><div style="grid-column:1/-1"><label class="small" for="agTitle">Evento</label><input id="agTitle" maxlength="120" placeholder="Ej. Cita médica, pagar arriendo" value="${escHtml(keep('agTitle')||'')}"></div>
  <div><label class="small" for="agDate">Fecha</label><input id="agDate" type="date" value="${escHtml(keep('agDate')||t)}"></div><div><label class="small" for="agTime">Hora</label><input id="agTime" type="time" value="${escHtml(keep('agTime')||'09:00')}"></div>
  <div><label class="small" for="agDur">Duración</label><select id="agDur">${[[15,'15 min'],[30,'30 min'],[60,'1 hora'],[90,'1 h 30'],[120,'2 horas'],[240,'4 horas']].map(([v,l])=>`<option value="${v}" ${String(v)===(keep('agDur')||'60')?'selected':''}>${l}</option>`).join('')}</select></div>
  <div><label class="small" for="agRemind">Aviso</label><select id="agRemind">${REMIND_OPTS.map(([v,l])=>`<option value="${v}" ${v===(keep('agRemind')??'30')?'selected':''}>${l}</option>`).join('')}</select></div>
  <div style="grid-column:1/-1"><label class="small" for="agNotes">Nota (opcional)</label><input id="agNotes" maxlength="500" value="${escHtml(keep('agNotes')||'')}"></div></div>
  <button class="btn" style="width:100%;margin-top:10px" onclick="addAgendaItem()">+ Agregar a mi agenda</button><div id="agMsg" class="small" role="status" style="margin-top:6px"></div>
  ${Object.keys(byDay).length?Object.entries(byDay).map(([d,list])=>`<div class="charttitle" style="margin-top:12px">${d===t?'Hoy':d===addDays(t,1)?'Mañana':escHtml(shortDate(d))}</div>${list.map(it=>agendaRow(it)).join('')}`).join(''):'<div class="empty" style="margin-top:10px">No tienes eventos en los próximos 30 días.</div>'}
  ${!agendaCloud&&supabaseUser?'<p class="small" style="color:var(--warn)">Se guarda en este teléfono; ejecuta supabase/06_v17.sql para subirla a la nube y recibir avisos.</p>':''}`;
}
function renderHomeAgenda(){
  const host=document.getElementById('homeAgenda');if(!host)return;
  const t=today(),items=agendaItems().filter(it=>localDateOf(it.starts_at)===t);
  if(!items.length){host.style.display='none';host.innerHTML='';return}
  host.style.display='block';host.innerHTML=`<div class="row"><b>📌 Hoy en tu agenda</b><span class="tag">${items.length}</span></div>${items.map(it=>agendaRow(it,false)).join('')}`;
}
async function pullAgendaItems(){
  if(!supabaseUser)return;
  const r=await supabaseClient.from('agenda_items').select('*').eq('user_id',supabaseUser.id).gte('starts_at',new Date(Date.now()-30*86400000).toISOString()).order('starts_at');
  agendaCloud=!r.error;if(r.error){console.warn('RENOVA agenda_items (¿falta el SQL 06?)',r.error);return}
  const cloudItems=(r.data||[]).map(x=>({id:x.id,title:x.title,starts_at:new Date(x.starts_at).toISOString(),duration_min:+x.duration_min||60,remind_min:x.remind_min??null,notes:x.notes||null}));
  const ids=new Set(cloudItems.map(x=>x.id)),pending=id=>syncQueue.some(o=>o.key==='ag:'+id);
  const merged=cloudItems.filter(x=>!(pending(x.id)&&!(data.agendaItems||[]).some(y=>y.id===x.id)));
  for(const it of data.agendaItems||[]){if(!ids.has(it.id)){merged.push(it);if(!pending(it.id))queueAgendaItem(it)}else if(pending(it.id)){const i=merged.findIndex(x=>x.id===it.id);merged[i]=it}}
  data.agendaItems=merged;save();
}
// ---- Recordatorios con notificaciones (Web Push, v17) -------------------
// El teléfono se suscribe con la clave pública VAPID que da la función; el servidor (cron cada 15 min)
// decide qué avisar: agua, gym, cerrar el día, pesarte los lunes y eventos de tu agenda.
let pushCloud=false,pushSub=null,pushBusy=false;
const PUSH_DEFAULTS=()=>({agua:{on:true,horas:['10:00','13:00','16:00','19:00']},gym:{on:true,hora:data.agenda?.gym||'18:00'},checklist:{on:true,hora:'21:00'},peso:{on:true,hora:'07:00'},eventos:{on:true}});
function pushPrefs(){const d=PUSH_DEFAULTS(),p=data.pushPrefs||{};return {agua:{...d.agua,...p.agua},gym:{...d.gym,...p.gym},checklist:{...d.checklist,...p.checklist},peso:{...d.peso,...p.peso},eventos:{...d.eventos,...p.eventos}}}
function pushSupported(){return 'serviceWorker' in navigator&&'PushManager' in window&&'Notification' in window}
function getPushReg(){return Promise.race([navigator.serviceWorker.ready,new Promise((_,rej)=>setTimeout(()=>rej(new Error('El service worker no está listo. Cierra y abre la app.')),8000))])}
function b64uToBytes(s){const p='='.repeat((4-s.length%4)%4),b=atob((s+p).replace(/-/g,'+').replace(/_/g,'/'));return Uint8Array.from(b,c=>c.charCodeAt(0))}
function bytesToB64u(buf){return btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function subRow(sub){const j=sub.toJSON?sub.toJSON():sub;return {endpoint:j.endpoint,p256dh:j.keys?.p256dh||bytesToB64u(sub.getKey('p256dh')),auth:j.keys?.auth||bytesToB64u(sub.getKey('auth'))}}
function queuePushSub(){
  if(!supabaseUser||!pushCloud||!pushSub)return;
  cloud({key:'push:'+pushSub.endpoint,t:'upsert',table:'push_subscriptions',onConflict:'endpoint',rows:[{...pushSub,prefs:pushPrefs(),tz:Intl.DateTimeFormat().resolvedOptions().timeZone||'America/Bogota',updated_at:nowIso()}]});
}
async function refreshPushSub(){
  if(!pushSupported())return;
  try{const reg=await getPushReg();const s=await reg.pushManager.getSubscription();pushSub=s?subRow(s):null}catch(_){pushSub=null}
  renderPush(true);
}
async function enablePush(){
  if(pushBusy)return;const msg=document.getElementById('pushMsg');
  if(!supabaseUser||!navigator.onLine){msg.textContent='Necesitas conexión y sesión iniciada.';return}
  pushBusy=true;msg.textContent='⏳ Activando…';
  try{
    const perm=await Notification.requestPermission();
    if(perm!=='granted'){msg.textContent='Permiso negado. Actívalo en Ajustes del teléfono → Apps → RENOVA (o Chrome) → Notificaciones.';return}
    const {data:res,error}=await supabaseClient.functions.invoke(AI_FUNCTION,{body:{kind:'vapid'}});
    if(error||!res?.publicKey){msg.textContent='⚠️ '+(error?await aiErrorText(error):'No se obtuvo la clave del servidor.');return}
    const reg=await getPushReg();
    const s=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:b64uToBytes(res.publicKey)});
    pushSub=subRow(s);data.pushOn=true;save();queuePushSub();
    renderPush(true);document.getElementById('pushMsg').textContent='✅ Recordatorios activados en este teléfono. Toca "Enviar prueba".';
  }catch(e){msg.textContent='⚠️ No se pudo activar: '+(e?.message||e)}
  finally{pushBusy=false}
}
async function disablePush(){
  try{const reg=await getPushReg();const s=await reg.pushManager.getSubscription();if(s)await s.unsubscribe()}catch(_){}
  if(pushSub&&supabaseUser&&pushCloud)cloud({key:'push:'+pushSub.endpoint,t:'delete',table:'push_subscriptions',match:{endpoint:pushSub.endpoint}});
  pushSub=null;data.pushOn=false;save();renderPush(true);toast('🔕 Recordatorios desactivados en este teléfono');
}
function savePushPrefs(){
  const ck=id=>!!document.getElementById(id)?.checked,v=id=>document.getElementById(id)?.value||'';
  const horas=v('pAguaH').split(/[,\s]+/).map(x=>x.trim()).filter(x=>/^\d{1,2}:\d{2}$/.test(x)).map(x=>x.padStart(5,'0')).slice(0,8);
  data.pushPrefs={agua:{on:ck('pAgua'),horas:horas.length?horas:PUSH_DEFAULTS().agua.horas},gym:{on:ck('pGym'),hora:v('pGymH')||'18:00'},checklist:{on:ck('pCheck'),hora:v('pCheckH')||'21:00'},peso:{on:ck('pPeso'),hora:v('pPesoH')||'07:00'},eventos:{on:ck('pEv')}};
  save();queuePushSub();renderPush(true);toast('🔔 Recordatorios guardados');
}
async function testPush(){
  const msg=document.getElementById('pushMsg');msg.textContent='⏳ Enviando prueba…';
  if(syncQueue.some(o=>o.table==='push_subscriptions'))await flushQueue();
  const {data:res,error}=await supabaseClient.functions.invoke(AI_FUNCTION,{body:{kind:'push_test'}});
  msg.textContent=error?'⚠️ '+await aiErrorText(error):res?.sent?`✅ Enviada a ${res.sent} teléfono${res.sent>1?'s':''}. Debe llegarte en unos segundos.`:'⚠️ No hay teléfonos suscritos en la nube todavía.';
}
function renderPush(force){
  const host=document.getElementById('pushCard');if(!host)return;
  if(!force&&host.dataset.dirty)return;delete host.dataset.dirty;host.oninput=host.onchange=()=>{host.dataset.dirty='1'};
  const head='<div class="row"><b>🔔 Recordatorios</b><span class="tag">'+(pushSub?'ACTIVOS':'APAGADOS')+'</span></div>';
  if(!pushSupported()){host.innerHTML=head+'<p class="small">Este navegador no permite notificaciones. Instala RENOVA desde Chrome en Android (menú ⋮ → Instalar app).</p>';return}
  if(!pushSub){host.innerHTML=head+`<p class="small">Te aviso para tomar agua, ir al gym, cerrar tu checklist, pesarte los lunes y antes de tus eventos. Solo si te falta hacerlo.</p><button class="btn" style="width:100%" onclick="enablePush()">Activar recordatorios en este teléfono</button><div id="pushMsg" class="small" role="status" style="margin-top:6px"></div>${Notification.permission==='denied'?'<p class="small" style="color:var(--warn)">Las notificaciones están bloqueadas: actívalas en Ajustes del teléfono → Apps → RENOVA → Notificaciones.</p>':''}`;return}
  const p=pushPrefs(),row=(id,label,on,timeId,time,extra='')=>`<div class="pushrow"><label class="small" style="display:flex;gap:8px;align-items:center;flex:1"><input type="checkbox" id="${id}" ${on?'checked':''} style="width:auto">${label}</label>${timeId?`<input id="${timeId}" ${extra?'':'type="time"'} value="${escHtml(time)}" ${extra}>`:''}</div>`;
  host.innerHTML=head+`<p class="small">Solo te aviso si todavía no lo has hecho.</p>
  ${row('pAgua','💧 Agua (si vas por debajo de la meta)',p.agua.on,'pAguaH',p.agua.horas.join(', '),'type="text" inputmode="numeric" aria-label="Horas del agua" style="max-width:170px"')}
  ${row('pGym','🏋️ Gym (si no has entrenado)',p.gym.on,'pGymH',p.gym.hora)}
  ${row('pCheck','✅ Cerrar el checklist',p.checklist.on,'pCheckH',p.checklist.hora)}
  ${row('pPeso','⚖️ Pesarte los lunes',p.peso.on,'pPesoH',p.peso.hora)}
  ${row('pEv','📌 Eventos de mi agenda (según su aviso)',p.eventos.on)}
  <div class="two" style="margin-top:10px"><button class="btn" onclick="savePushPrefs()">Guardar</button><button class="btn secondary" onclick="testPush()">Enviar prueba</button></div>
  <button class="btn secondary sm" style="margin-top:8px" onclick="disablePush()">Desactivar en este teléfono</button><div id="pushMsg" class="small" role="status" style="margin-top:6px"></div>
  ${!pushCloud&&supabaseUser?'<p class="small" style="color:var(--warn)">Falta ejecutar supabase/06_v17.sql para que el servidor te pueda avisar.</p>':''}`;
}
async function pullPush(){
  if(!supabaseUser)return;
  const r=await supabaseClient.from('push_subscriptions').select('endpoint,prefs').eq('user_id',supabaseUser.id);
  pushCloud=!r.error;if(r.error){console.warn('RENOVA push_subscriptions (¿falta el SQL 06?)',r.error);return}
  const withPrefs=(r.data||[]).find(x=>x.prefs&&Object.keys(x.prefs).length);
  if(withPrefs&&!syncQueue.some(o=>o.table==='push_subscriptions'))data.pushPrefs=withPrefs.prefs;
  // sin bloquear la carga: el service worker puede tardar en estar listo
  refreshPushSub().then(()=>{if(pushSub&&!(r.data||[]).some(x=>x.endpoint===pushSub.endpoint))queuePushSub()});   // re-sube la suscripción si se perdió
}
