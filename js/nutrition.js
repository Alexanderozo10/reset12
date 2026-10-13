// RENOVA · nutrición
// Metas diarias (N1), registro rápido de agua/sueño/pasos (M1), menús y lista de compras.
// =====================================================================
// RENOVA · M1 registro rápido + N1 metas de nutrición
// =====================================================================
const ACTIVITY={sedentario:{f:1.2,label:'Sedentario (oficina, casi sin caminar)'},ligero:{f:1.375,label:'Ligero (camino algo, 1–3 entrenos)'},moderado:{f:1.55,label:'Moderado (3–5 entrenos por semana)'},alto:{f:1.725,label:'Alto (6–7 entrenos o trabajo físico)'}};
const GOALS={bajar_grasa:{adj:-0.15,label:'Bajar de peso'},recomposicion:{adj:-0.05,label:'Recomposición'},ganar_musculo:{adj:0.10,label:'Ganar músculo'}};
const MEAL_LABEL={desayuno:'Desayuno',almuerzo:'Almuerzo',merienda:'Merienda',cena:'Cena'};
const DEFAULT_STEPS_GOAL=8000;

// ---- Cálculo (Mifflin-St Jeor) ----------------------------------------
function calcTargets(p){
  const w=Number(p.weight_kg),h=Number(p.height_cm),a=Number(p.age);
  const bmr=10*w+6.25*h-5*a+(p.sex==='mujer'?-161:5);
  const tdee=bmr*(ACTIVITY[p.activity]?.f||1.55);
  let kcal=Math.round(tdee*(1+(GOALS[p.goal]?.adj??-0.15))/10)*10;
  const floor=Math.max(Math.round(bmr/10)*10,p.sex==='mujer'?1200:1500);   // nunca por debajo del basal
  if(kcal<floor)kcal=floor;
  const protein=Math.min(220,Math.round(2.0*w));
  const fat=Math.round(0.8*w);
  const carbs=Math.max(50,Math.round((kcal-protein*4-fat*9)/4));
  const split=Number(p.meals_per_day)===4?{desayuno:25,almuerzo:35,merienda:15,cena:25}:{desayuno:30,almuerzo:40,cena:30};
  return {bmr:Math.round(bmr),tdee:Math.round(tdee),kcal,protein,fat,carbs,split,floorApplied:kcal===floor};
}
function waterGoalL(){const p=data.nutritionPlan,last=data.measurements?.at(-1);const w=Number(p?.weight_kg||last?.weight||0);return w?Math.round(w*0.035*4)/4:3}
function stepsGoal(){return Number(data.stepsGoal)||DEFAULT_STEPS_GOAL}
function fmtN(n){return Math.round(n).toLocaleString('es-CO')}

// ---- Guardado del plan -------------------------------------------------
function queueNutritionPlan(noFlush){
  const p=data.nutritionPlan;if(!p)return;
  cloud({key:'nplan',t:'upsert',table:'nutrition_plans',onConflict:'id',rows:[{id:p.id,is_active:true,goal:p.goal,sex:p.sex,age:p.age,height_cm:p.height_cm,weight_kg:p.weight_kg,activity:p.activity,gym_days:p.gym_days,meals_per_day:p.meals_per_day,kcal_target:p.kcal_target,protein_g:p.protein_g,fat_g:p.fat_g,carbs_g:p.carbs_g,meal_split:p.meal_split,excluded_foods:p.excluded_foods||['mariscos','pescado'],updated_at:nowIso()}]},noFlush);
}
function applyTargets(p){const t=calcTargets(p);Object.assign(p,{kcal_target:t.kcal,protein_g:t.protein,fat_g:t.fat,carbs_g:t.carbs,meal_split:t.split});return t}
function saveGoalsForm(ev){
  ev?.preventDefault?.();
  const v=id=>document.getElementById(id).value,msg=document.getElementById('goalsMsg');
  const p={id:data.nutritionPlan?.id||uuid(),sex:v('gSex'),age:Math.round(Number(v('gAge'))),height_cm:Number(v('gHeight')),weight_kg:Number(v('gWeight')),activity:v('gActivity'),goal:v('gGoal'),gym_days:Math.round(Number(v('gGym'))),meals_per_day:Number(v('gMeals')),excluded_foods:data.nutritionPlan?.excluded_foods||['mariscos','pescado']};
  if(!(p.age>=14&&p.age<=90)){msg.textContent='Revisa la edad (14 a 90).';return}
  if(!(p.height_cm>=120&&p.height_cm<=230)){msg.textContent='Revisa la estatura en cm (ej. 172).';return}
  if(!(p.weight_kg>=30&&p.weight_kg<=250)){msg.textContent='Revisa el peso en kg (ej. 85).';return}
  if(!(p.gym_days>=0&&p.gym_days<=7)){msg.textContent='Los días de gym van de 0 a 7.';return}
  applyTargets(p);data.nutritionPlan=p;data.goalsEditing=false;save();
  if(supabaseUser)queueNutritionPlan();
  render();toast('Metas calculadas: '+fmtN(p.kcal_target)+' kcal');
}
// Se llama al guardar una medición: si el peso cambió 1 kg o más, recalcula
function maybeRecalcFromWeight(newWeight){
  const p=data.nutritionPlan;if(!p||!(newWeight>0))return;
  if(Math.abs(Number(p.weight_kg)-newWeight)<1)return;
  const before=p.kcal_target;p.weight_kg=newWeight;applyTargets(p);save();if(supabaseUser)queueNutritionPlan();
  toast('Peso nuevo: metas actualizadas ('+fmtN(before)+' → '+fmtN(p.kcal_target)+' kcal)');
}

// ---- Render: metas en Nutrición ---------------------------------------
function renderGoals(){
  const host=document.getElementById('goalsCard');if(!host)return;
  const p=data.nutritionPlan,last=data.measurements?.at(-1);
  if(!p||data.goalsEditing){
    if(host.querySelector('form')&&host.contains(document.activeElement))return;   // no borrar lo que estás escribiendo
    const d=p||{sex:'hombre',activity:'moderado',goal:'bajar_grasa',gym_days:4,meals_per_day:3,weight_kg:last?.weight||''};
    const opt=(obj,sel)=>Object.entries(obj).map(([k,o])=>`<option value="${k}" ${k===sel?'selected':''}>${escHtml(o.label)}</option>`).join('');
    host.innerHTML=`<div class="row"><b>🎯 Mis metas de nutrición</b><span class="tag">${p?'EDITAR':'PASO 1'}</span></div><p class="small">Con estos datos la app calcula tus calorías y proteína del día y cuánto comer en cada comida. Es una guía, no reemplaza a un nutricionista.</p>
<form onsubmit="saveGoalsForm(event)"><div class="formgrid">
<div><label class="small" for="gSex">Sexo</label><select id="gSex"><option value="hombre" ${d.sex!=='mujer'?'selected':''}>Hombre</option><option value="mujer" ${d.sex==='mujer'?'selected':''}>Mujer</option></select></div>
<div><label class="small" for="gAge">Edad</label><input id="gAge" type="number" inputmode="numeric" min="14" max="90" value="${d.age??''}" placeholder="35" required></div>
<div><label class="small" for="gHeight">Estatura (cm)</label><input id="gHeight" type="number" inputmode="decimal" min="120" max="230" step="0.5" value="${d.height_cm??''}" placeholder="172" required></div>
<div><label class="small" for="gWeight">Peso (kg)</label><input id="gWeight" type="number" inputmode="decimal" min="30" max="250" step="0.1" value="${d.weight_kg??''}" placeholder="85" required></div>
<div class="full"><label class="small" for="gActivity">Actividad</label><select id="gActivity">${opt(ACTIVITY,d.activity)}</select></div>
<div><label class="small" for="gGoal">Objetivo</label><select id="gGoal">${opt(GOALS,d.goal)}</select></div>
<div><label class="small" for="gGym">Días de gym / semana</label><input id="gGym" type="number" inputmode="numeric" min="0" max="7" value="${d.gym_days??4}"></div>
<div class="full"><label class="small" for="gMeals">Comidas al día</label><select id="gMeals"><option value="3" ${Number(d.meals_per_day)!==4?'selected':''}>3 · desayuno, almuerzo y cena</option><option value="4" ${Number(d.meals_per_day)===4?'selected':''}>4 · con merienda antes del gym</option></select></div>
</div><div id="goalsMsg" class="small" role="alert" style="color:#ff9b9b;margin-top:8px"></div>
<div class="${p?'two':''}" style="margin-top:10px">${p?'<button type="button" class="btn secondary" onclick="data.goalsEditing=false;render()">Cancelar</button>':''}<button type="submit" class="btn" style="width:100%">Calcular mis metas</button></div></form>`;
    return;
  }
  const t=calcTargets(p),a=data.agenda||DEFAULT_AGENDA;
  const time={desayuno:a.breakfast,almuerzo:a.lunch,merienda:'antes del gym',cena:a.dinner};
  const rows=Object.entries(p.meal_split||t.split).map(([m,pct])=>`<tr><td>${MEAL_LABEL[m]||m}<div class="small">${escHtml(time[m]||'')}</div></td><td>${pct}%</td><td><b>${fmtN(p.kcal_target*pct/100)}</b></td><td>${fmtN(p.protein_g*pct/100)} g</td><td>${fmtN(p.carbs_g*pct/100)} g</td><td>${fmtN(p.fat_g*pct/100)} g</td></tr>`).join('');
  host.innerHTML=`<div class="row"><b>🎯 Mis metas de nutrición</b><span class="tag">${escHtml(GOALS[p.goal]?.label||'')}</span></div>
<div class="grid" style="margin-top:10px"><div class="stat"><div class="label">Calorías por día</div><div class="num">${fmtN(p.kcal_target)}</div><span class="delta muted">gasto estimado ${fmtN(t.tdee)} kcal</span></div><div class="stat"><div class="label">Proteína por día</div><div class="num">${fmtN(p.protein_g)} g</div><span class="delta muted">${(p.protein_g/p.weight_kg).toFixed(1).replace('.',',')} g por kg</span></div><div class="stat"><div class="label">Carbohidratos</div><div class="num">${fmtN(p.carbs_g)} g</div></div><div class="stat"><div class="label">Grasa</div><div class="num">${fmtN(p.fat_g)} g</div></div></div>
<div class="charttitle" style="margin-top:14px">Cuánto comer en cada comida</div>
<div class="tableview" style="margin-top:0"><table><thead><tr><th>Comida</th><th>%</th><th>kcal</th><th>Prot.</th><th>Carb.</th><th>Grasa</th></tr></thead><tbody>${rows}</tbody></table></div>
<p class="small">Calculado con ${fmtN(p.weight_kg)} kg, ${fmtN(p.height_cm)} cm y ${p.age} años${t.floorApplied?' · se dejó en tu metabolismo basal para no bajar demasiado':''}. Los días de gym, la comida más cercana al entreno puede llevar un poco más de carbohidrato. Se recalcula sola si tu peso cambia 1 kg o más.</p>
<button class="btn secondary" style="width:100%" onclick="data.goalsEditing=true;render()">Editar mis datos</button>`;
}
// ---- Render: resumen en Inicio ----------------------------------------
function renderHomeNutrition(){
  const host=document.getElementById('homeNutrition');if(!host)return;
  const p=data.nutritionPlan;
  if(!p){host.innerHTML=`<div class="row"><b>🍽 Nutrición de hoy</b><span class="tag">SIN METAS</span></div><p class="small">Calcula tus calorías y proteína en un minuto.</p><button class="btn" style="width:100%" onclick="show('food')">Calcular mis metas</button>`;return}
  const meals=Object.entries(p.meal_split||{}).map(([m,pct])=>`<div class="wkrow"><span>${MEAL_LABEL[m]||m}</span><span class="small">${fmtN(p.kcal_target*pct/100)} kcal · ${fmtN(p.protein_g*pct/100)} g prot.</span></div>`).join('');
  host.innerHTML=`<div class="row"><b>🍽 Nutrición de hoy</b><span class="tag">${escHtml(GOALS[p.goal]?.label||'')}</span></div><div class="wktitle">${fmtN(p.kcal_target)} kcal · ${fmtN(p.protein_g)} g de proteína</div>${meals}<button class="btn secondary" style="width:100%;margin-top:10px" onclick="show('food')">Ver mis metas</button>`;
}

// ---- M1 · Registro rápido ---------------------------------------------
function renderQuickLog(){
  const host=document.getElementById('quickLog');if(!host)return;
  const d=getDay(),water=Number(d.water)||0,wg=waterGoalL(),sleep=toNumOrNull(d.sleep),steps=toNumOrNull(d.steps),sg=stepsGoal();
  const wp=Math.min(100,Math.round(water/wg*100)),sp=Math.min(100,Math.round((steps||0)/sg*100));
  const chip=h=>`<button type="button" class="qchip${Number(sleep)===h?' on':''}" aria-pressed="${Number(sleep)===h}" onclick="quickSleep(${h})">${h===9?'9+':h} h</button>`;
  host.innerHTML=`<div class="row"><b>⚡ Registro rápido</b><span class="tag">HOY</span></div>
<div class="qrow"><div class="row"><span>💧 Agua</span><span class="small"><b>${String(Math.round(water*100)/100).replace('.',',')}</b> de ${String(wg).replace('.',',')} L</span></div><div class="progress" style="margin:6px 0 8px"><div class="bar" style="width:${wp}%"></div></div><div class="qbtns"><button type="button" class="btn secondary sm" onclick="quickWater(-250)" aria-label="Quitar 250 ml">−250</button><button type="button" class="btn sm" onclick="quickWater(250)">+250 ml</button><button type="button" class="btn sm" onclick="quickWater(500)">+500 ml</button></div></div>
<div class="qrow"><div class="row"><span>😴 Dormí anoche</span><span class="small">${sleep!=null?String(sleep).replace('.',',')+' h':'sin registrar'}</span></div><div class="qbtns" style="margin-top:8px">${[5,6,7,8,9].map(chip).join('')}</div></div>
<div class="qrow"><div class="row"><span>👟 Pasos</span><span class="small">${steps!=null?fmtN(steps):'0'} de ${fmtN(sg)}</span></div><div class="progress" style="margin:6px 0 8px"><div class="bar" style="width:${sp}%"></div></div><div class="two"><input id="quickStepsInput" type="number" inputmode="numeric" min="0" step="100" placeholder="Pasos de hoy" value="${steps??''}" onkeydown="if(event.key==='Enter')quickSteps()"><button type="button" class="btn secondary" onclick="quickSteps()">Guardar pasos</button></div></div>`;
}
function quickWater(ml){const d=getDay();d.water=Math.max(0,Math.round(((Number(d.water)||0)+ml/1000)*100)/100);save();if(supabaseUser)queueLog(today());render();const g=waterGoalL();toast(ml>0?`💧 +${ml} ml · ${String(d.water).replace('.',',')} de ${String(g).replace('.',',')} L`+(d.water>=g?' 🎉 ¡Meta cumplida!':''):'💧 Agua corregida')}
function quickSleep(h){const d=getDay();d.sleep=h;save();if(supabaseUser)queueLog(today());render();toast('😴 Sueño: '+h+' h')}
function quickSteps(){const el=document.getElementById('quickStepsInput'),v=Math.round(Number(el?.value));if(!(v>=0&&v<=100000)){toast('Escribe un número de pasos válido');return}const d=getDay();d.steps=v;save();if(supabaseUser)queueLog(today());render();toast('👟 '+fmtN(v)+' pasos guardados'+(v>=stepsGoal()?' · ¡meta cumplida!':''))}
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
function generateShoppingList(){const list=['Huevos','Pollo','Carne magra','Arroz','Papa','Avena','Arepas','Pasta','Frutas','Verduras variadas','Queso bajo en grasa','Aceite de oliva'];data.shoppingList=list;save();if(supabaseUser)queueShop();renderShoppingList();toast('Lista de compras generada')}
function renderShoppingList(){const e=document.getElementById('shoppingList');if(!e)return;e.innerHTML=(data.shoppingList||[]).length?'<div class="pill-row">'+data.shoppingList.map(x=>`<span class="pill">${escHtml(x)}</span>`).join('')+'</div>':'Genera una lista según los menús de la semana.'}
