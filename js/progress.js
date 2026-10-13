// RENOVA · progreso
// Mediciones, racha, día del ciclo, exportar/importar respaldo.
function saveProgress(){
 const w=parseFloat(document.getElementById('weight').value),wa=parseFloat(document.getElementById('waist').value);
 if(!(w>0)||!(wa>0)){toast('Completa peso y cintura');return}
 const m={date:today(),weight:w,waist:wa};
 data.measurements=(data.measurements||[]).filter(x=>x.date!==m.date);data.measurements.push(m);
 data.measurements.sort((a,b)=>a.date<b.date?-1:a.date>b.date?1:0);
 save();if(supabaseUser&&measurementsCloud)queueMeasurement(m);
 toast('Medición guardada');render()
}
function renderTrend(){const e=document.getElementById('trend');if(!e)return;if(data.measurements.length<2){e.innerHTML='<div class="empty">Registra al menos 2 mediciones para ver tendencia.</div>';return}const a=data.measurements.slice(-6);const first=a[0],last=a[a.length-1],dw=(last.weight-first.weight).toFixed(1),dc=(last.waist-first.waist).toFixed(1);e.innerHTML=`<div class="grid"><div class="stat"><div class="num">${dw>0?'+':''}${dw} kg</div><div class="label">cambio de peso</div></div><div class="stat"><div class="num">${dc>0?'+':''}${dc} cm</div><div class="label">cambio de cintura</div></div></div><div class="small" style="margin-top:10px">${a.map(x=>`${escHtml(x.date)}: ${x.weight} kg · ${x.waist} cm`).join('<br>')}</div>`}
function renderHistory(){let h=document.getElementById('history');if(!data.measurements.length){h.innerHTML='<div class="empty">Aún no hay mediciones.</div>';return}h.innerHTML=data.measurements.slice().reverse().map(x=>`<div class="check"><span><b>${escHtml(x.date)}</b><br><span class="small">${x.weight} kg · ${x.waist} cm cintura</span></span></div>`).join('')}
function dayIndex(){if(!lsGet(startKey))lsSet(startKey,today());let a=new Date(lsGet(startKey)),b=new Date(today());return Math.min(84,Math.max(1,Math.floor((b-a)/86400000)+1))}
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
