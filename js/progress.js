// RENOVA · progreso
// Mediciones, racha, día del ciclo, exportar/importar respaldo y fotos de progreso (M3).
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
