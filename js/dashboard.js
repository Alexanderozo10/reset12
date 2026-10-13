// RENOVA · tablero semanal
// Métricas de la semana y gráficas SVG sin librerías.
// =====================================================================
// RENOVA · Tablero semanal (lunes a domingo)
// Gráficas en SVG propio: sin librerías, funciona sin conexión.
// =====================================================================
let dashWeekOffset=0;   // 0 = semana actual, -1 = anterior…
const DOW=['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];

function weekStart(iso){const [y,m,d]=iso.split('-').map(Number);const x=new Date(y,m-1,d);const wd=(x.getDay()+6)%7;x.setDate(x.getDate()-wd);return fmtDate(x)}
function weekDates(start){return Array.from({length:7},(_,i)=>addDays(start,i))}
function avg(arr){const v=arr.filter(x=>x!=null&&Number.isFinite(x));return v.length?v.reduce((a,b)=>a+b,0)/v.length:null}
function numOr(v){const n=toNumOrNull(v);return n==null?null:n}
function fmtInt(n){return n==null?'—':Math.round(n).toLocaleString('es-CO')}
function fmtCompact(n){if(n==null)return '—';const a=Math.abs(n);if(a>=1e6)return (n/1e6).toFixed(1).replace('.0','')+' M';if(a>=1e4)return Math.round(n/1e3)+' mil';return Math.round(n).toLocaleString('es-CO')}

// ---- Métricas por día
function habitPct(date){
  if(date>today()||!checklist.length)return null;
  const start=lsGet(startKey);if(start&&date<start)return null;
  const checks=data.days[date]?.checks||{};
  return Math.round(checklist.filter(([id])=>checks[id]).length/checklist.length*100);
}
function gymByDate(date){
  if(date>today())return null;
  let kgSum=0,kgN=0,sets=0;
  // sesiones terminadas (historial, incluye las de hoy ya cerradas)
  for(const list of Object.values(data.gymHistory||{}))for(const e of list)if(e.date===date)for(const s of e.sets)if(s.done){sets++;if(s.kg>0){kgSum+=s.kg;kgN++}}
  // sesión de hoy en curso (aún sin terminar)
  if(date===today())for(const r of exercises||[])for(const it of r.items||[])for(let n=0;n<it.series;n++){const sv=getDay().exercises['r'+r.id+'_e'+it.id+'_s'+n];if(sv?.done){sets++;if(Number(sv.kg)>0){kgSum+=Number(sv.kg);kgN++}}}
  return {sets,kgSum,kgN,avg:kgN?kgSum/kgN:null};
}
function weekPRs(start){
  const end=addDays(start,6);let count=0;const names=[];
  for(const list of Object.values(data.gymHistory||{})){
    let before=0,inWeek=0;
    for(const e of list)for(const s of e.sets){if(!s.done)continue;const v=e1rm(s.kg,s.reps);if(e.date<start)before=Math.max(before,v);else if(e.date<=end)inWeek=Math.max(inWeek,v)}
    if(before>0&&inWeek>before+0.01){count++;names.push(list[0]?.name||'')}
  }
  // hoy (aún no está en el historial)
  if(today()>=start&&today()<=end)for(const r of exercises||[])for(const it of r.items||[])for(let n=0;n<it.series;n++){const sv=getDay().exercises['r'+r.id+'_e'+it.id+'_s'+n];if(sv?.done&&isPR(it.nombre,sv.kg,sv.reps)&&!names.includes(it.nombre)){count++;names.push(it.nombre);break}}
  return {count,names};
}
function weekSummary(start){
  const dates=weekDates(start);
  const habits=dates.map(habitPct);
  const gym=dates.map(gymByDate);
  const logs=dates.map(d=>data.days[d]||{});
  return {
    dates,habits,gym,
    habitAvg:avg(habits),
    perfect:habits.filter(v=>v===100).length,
    trainDays:dates.filter(d=>d<=today()&&(gymByDate(d)?.sets>0)).length,
    avgKg:(()=>{const s=gym.reduce((a,g)=>a+(g?.kgSum||0),0),n=gym.reduce((a,g)=>a+(g?.kgN||0),0);return n?s/n:null})(),
    sets:gym.reduce((a,g)=>a+(g?.sets||0),0),
    steps:avg(logs.map(l=>numOr(l.steps))),
    water:avg(logs.map(l=>numOr(l.water))),
    sleep:avg(logs.map(l=>numOr(l.sleep))),
    prs:weekPRs(start)
  };
}

// ---- Piezas visuales
function deltaHtml(cur,prev,{unit='',pct=false,goodUp=true,digits=0}={}){
  if(cur==null||prev==null)return '<span class="delta muted">sin dato previo</span>';
  let diff=cur-prev,txt;
  if(pct){if(!prev)return '<span class="delta muted">sin dato previo</span>';diff=(cur-prev)/prev*100;txt=(diff>0?'+':'')+Math.round(diff)+'%'}
  else txt=(diff>0?'+':'')+diff.toFixed(digits).replace('.',',')+unit;
  if(Math.abs(diff)<(pct?1:Math.pow(10,-digits)))return '<span class="delta muted">= igual</span>';
  const good=(diff>0)===goodUp;
  return `<span class="delta ${good?'up':'down'}">${diff>0?'▲':'▼'} ${txt}</span>`;
}
function statTile(label,value,delta){return `<div class="stat"><div class="label">${label}</div><div class="num">${value}</div>${delta}</div>`}

function columnChart(values,labels,{max,fmt,unit,todayIdx,emptyText}){
  const W=320,H=150,padL=34,padR=6,padT=12,padB=24,iw=W-padL-padR,ih=H-padT-padB;
  const real=values.filter(v=>v!=null);
  if(!real.length)return `<div class="empty small">${emptyText||'Sin datos esta semana.'}</div>`;
  if(emptyText&&real.every(v=>v===0))return `<div class="empty small">${emptyText}</div>`;
  const top=max??niceMax(Math.max(...real,1));
  const ticks=[0,top/2,top];
  const band=iw/values.length,bw=Math.min(24,band-10);
  const y=v=>padT+ih-(v/top)*ih;
  let g=ticks.map(t=>`<line x1="${padL}" x2="${W-padR}" y1="${y(t)}" y2="${y(t)}" class="grid"/><text x="${padL-6}" y="${y(t)+4}" class="tick" text-anchor="end">${fmt(t,true)}</text>`).join('');
  values.forEach((v,i)=>{
    const cx=padL+band*i+band/2,x=cx-bw/2;
    const tip=`${labels[i]}: ${v==null?'sin dato':fmt(v)+unit}`;
    if(v!=null&&v>0){const h=Math.max(2,(v/top)*ih),yy=padT+ih-h,r=Math.min(4,h);
      g+=`<path d="M${x},${padT+ih}V${yy+r}Q${x},${yy} ${x+r},${yy}H${x+bw-r}Q${x+bw},${yy} ${x+bw},${yy+r}V${padT+ih}Z" class="bar${i===todayIdx?' today':''}"/>`}
    else if(v===0)g+=`<rect x="${x}" y="${padT+ih-2}" width="${bw}" height="2" rx="1" class="zero"/>`;
    g+=`<text x="${cx}" y="${H-7}" class="tick${i===todayIdx?' strong':''}" text-anchor="middle">${labels[i]}</text>`;
    g+=`<rect x="${padL+band*i}" y="${padT}" width="${band}" height="${ih+padB}" class="hit" data-tip="${escHtml(tip)}"/>`;
  });
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${escHtml(labels.map((l,i)=>l+' '+(values[i]==null?'sin dato':fmt(values[i])+unit)).join(', '))}">${g}</svg>`;
}
function niceMax(v){const p=Math.pow(10,Math.floor(Math.log10(v)));const n=v/p;return (n<=1?1:n<=2?2:n<=5?5:10)*p}

function lineChart(points,{unit,emptyText}){
  if(points.length<2)return `<div class="empty small">${emptyText}</div>`;
  const W=320,H=150,padL=38,padR=40,padT=14,padB=24,iw=W-padL-padR,ih=H-padT-padB;
  const t=p=>new Date(p.date+'T12:00:00').getTime();
  const t0=t(points[0]),t1=t(points.at(-1))||t0+1;
  const vs=points.map(p=>p.v);let lo=Math.min(...vs),hi=Math.max(...vs);const padv=Math.max(0.5,(hi-lo)*0.15);lo=Math.floor(lo-padv);hi=Math.ceil(hi+padv);
  const X=p=>padL+(t1===t0?iw/2:(t(p)-t0)/(t1-t0)*iw),Y=v=>padT+ih-(v-lo)/(hi-lo)*ih;
  let g=[lo,(lo+hi)/2,hi].map(v=>`<line x1="${padL}" x2="${padL+iw}" y1="${Y(v)}" y2="${Y(v)}" class="grid"/><text x="${padL-6}" y="${Y(v)+4}" class="tick" text-anchor="end">${(Math.round(v*10)/10).toString().replace('.',',')}</text>`).join('');
  g+=`<path d="${points.map((p,i)=>(i?'L':'M')+X(p).toFixed(1)+','+Y(p.v).toFixed(1)).join('')}" class="line"/>`;
  points.forEach((p,i)=>{g+=`<circle cx="${X(p)}" cy="${Y(p.v)}" r="${i===points.length-1?5:3.5}" class="dot"/><circle cx="${X(p)}" cy="${Y(p.v)}" r="14" class="hit" data-tip="${escHtml(shortDate(p.date)+': '+String(p.v).replace('.',',')+unit)}"/>`});
  const last=points.at(-1);
  g+=`<text x="${X(last)+9}" y="${Y(last.v)+4}" class="endlabel">${String(last.v).replace('.',',')}${unit}</text>`;
  g+=`<text x="${padL}" y="${H-7}" class="tick">${shortDate(points[0].date)}</text><text x="${padL+iw}" y="${H-7}" class="tick" text-anchor="end">${shortDate(last.date)}</text>`;
  return `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${escHtml('Peso: '+points.map(p=>shortDate(p.date)+' '+p.v+unit).join(', '))}">${g}</svg>`;
}

// ---- Render principal
function renderDashboard(){
  const host=document.getElementById('dashboard');if(!host)return;
  const curStart=addDays(weekStart(today()),dashWeekOffset*7),prevStart=addDays(curStart,-7);
  const w=weekSummary(curStart),p=weekSummary(prevStart);
  const isCurrent=dashWeekOffset===0,todayIdx=isCurrent?w.dates.indexOf(today()):-1;
  const range=shortDate(w.dates[0])+' – '+shortDate(w.dates[6]);
  const labels=DOW;
  const weights=(data.measurements||[]).filter(m=>m.weight>0&&m.date<=w.dates[6]&&m.date>=addDays(w.dates[6],-55)).map(m=>({date:m.date,v:Number(m.weight)}));
  host.innerHTML=`
  <div class="row weeknav"><button type="button" class="btn secondary sm" aria-label="Semana anterior" onclick="dashWeekOffset--;renderDashboard()">←</button><div class="center"><b>${isCurrent?'Esta semana':'Semana'}</b><div class="small">${range}</div></div><button type="button" class="btn secondary sm" aria-label="Semana siguiente" ${isCurrent?'disabled':''} onclick="dashWeekOffset++;renderDashboard()">→</button></div>
  <div class="hero"><div class="label">Cumplimiento de hábitos</div><div class="heronum">${w.habitAvg==null?'—':Math.round(w.habitAvg)+'%'}</div>${deltaHtml(w.habitAvg,p.habitAvg,{unit:' pts'})}<div class="small" style="margin-top:4px">${w.perfect} día${w.perfect===1?'':'s'} al 100% · vs. semana anterior</div></div>
  <div class="grid" style="margin-top:10px">
    ${statTile('Entrenos',w.trainDays+' día'+(w.trainDays===1?'':'s'),deltaHtml(w.trainDays,p.trainDays))}
    ${statTile('Peso promedio / serie',w.avgKg==null?'—':w.avgKg.toFixed(1).replace('.',',')+' kg',deltaHtml(w.avgKg,p.avgKg,{unit:' kg',digits:1}))}
    ${statTile('Pasos / día',fmtInt(w.steps),deltaHtml(w.steps,p.steps,{pct:true}))}
    ${statTile('Sueño / día',w.sleep==null?'—':w.sleep.toFixed(1).replace('.',',')+' h',deltaHtml(w.sleep,p.sleep,{unit:' h',digits:1}))}
    ${statTile('Agua / día',w.water==null?'—':w.water.toFixed(1).replace('.',',')+' L',deltaHtml(w.water,p.water,{unit:' L',digits:1}))}
    ${statTile('Récords nuevos',String(w.prs.count),w.prs.count?`<span class="delta muted">${escHtml(w.prs.names.slice(0,2).join(' · '))}</span>`:'<span class="delta muted">esta semana</span>')}
  </div>
  <div class="chartbox"><div class="charttitle">Hábitos cumplidos por día <span class="small">(%)</span></div>${columnChart(w.habits,labels,{max:100,fmt:(v)=>Math.round(v),unit:'%',todayIdx,emptyText:checklist.length?'':'Crea hábitos en "Hoy" para ver esta gráfica.'})}</div>
  <div class="chartbox"><div class="charttitle">Peso promedio por serie <span class="small">(kg)</span></div>${columnChart(w.gym.map(g=>g&&g.sets?g.avg:null),labels,{fmt:(v,tick)=>tick?fmtCompact(v):(Math.round(v*10)/10).toString().replace('.',','),unit:' kg',todayIdx,emptyText:'Sin entrenos registrados esta semana.'})}</div>
  <div class="chartbox"><div class="charttitle">Peso · últimas 8 semanas <span class="small">(kg)</span></div>${lineChart(weights,{unit:' kg',emptyText:'Registra al menos 2 mediciones para ver la tendencia.'})}</div>
  <details class="tableview"><summary>Ver como tabla</summary><table><thead><tr><th>Día</th><th>Hábitos</th><th>Peso prom.</th><th>Pasos</th><th>Agua</th><th>Sueño</th></tr></thead><tbody>${w.dates.map((d,i)=>{const l=data.days[d]||{};return `<tr${i===todayIdx?' class="today"':''}><td>${DOW[i]} ${Number(d.slice(8))}</td><td>${w.habits[i]==null?'—':w.habits[i]+'%'}</td><td>${w.gym[i]?.avg!=null?(Math.round(w.gym[i].avg*10)/10).toString().replace('.',',')+' kg':'—'}</td><td>${l.steps?fmtInt(Number(l.steps)):'—'}</td><td>${l.water?String(l.water).replace('.',','):'—'}</td><td>${l.sleep?String(l.sleep).replace('.',','):'—'}</td></tr>`}).join('')}</tbody></table></details>`;
}

// ---- Tooltip compartido (hover en PC, toque en el móvil)
(function(){
  let tipEl=null,shownAt=0;
  function showTip(target,x,y){
    tipEl ||= Object.assign(document.createElement('div'),{className:'charttip',role:'status'});
    if(!tipEl.isConnected)document.body.appendChild(tipEl);
    tipEl.textContent=target.dataset.tip;tipEl.style.display='block';shownAt=Date.now();
    const r=tipEl.getBoundingClientRect();
    tipEl.style.left=Math.min(window.innerWidth-r.width-8,Math.max(8,x-r.width/2))+'px';
    tipEl.style.top=Math.max(8,y-r.height-12)+'px';
  }
  function hide(){if(tipEl)tipEl.style.display='none'}
  document.addEventListener('pointerover',e=>{const t=e.target.closest?.('[data-tip]');if(t&&e.pointerType==='mouse')showTip(t,e.clientX,e.clientY)});
  document.addEventListener('pointerout',e=>{if(e.target.closest?.('[data-tip]')&&e.pointerType==='mouse')hide()});
  document.addEventListener('click',e=>{const t=e.target.closest?.('[data-tip]');if(t)showTip(t,e.clientX,e.clientY);else hide()});
  window.addEventListener('scroll',()=>{if(Date.now()-shownAt>400)hide()},{passive:true});
})();
