// RENOVA · nutrición
// Metas diarias (N1), registro rápido (M1), recetario con ajuste a tu meta (N2), plan semanal, registro de comidas y lista de compras (N3).
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
  const d=today();
  const meals=Object.entries(p.meal_split||{}).map(([m,pct])=>{const pi=planItem(d,m),r=pi&&(data.recipes||[]).find(x=>x.id===pi.recipe_id);return `<div class="hmeal"><div class="row"><span><b>${MEAL_LABEL[m]||m}</b> <span class="small">${r?escHtml(r.name):'sin plan'}</span></span><span class="small">${fmtN(pi?pi.kcal:p.kcal_target*pct/100)} kcal</span></div>${entryButtons(d,m)}</div>`}).join('');
  const done=Object.keys(p.meal_split||{}).filter(m=>mealEntry(d,m)==='comida').length;
  host.innerHTML=`<div class="row"><b>🍽 Nutrición de hoy</b><span class="tag">${done}/${Object.keys(p.meal_split||{}).length} COMIDAS</span></div><div class="wktitle">${fmtN(p.kcal_target)} kcal · ${fmtN(p.protein_g)} g de proteína</div>${meals}<button class="btn secondary" style="width:100%;margin-top:10px" onclick="show('food')">Ver plan y recetas</button>`;
}

// ---- M1 · Registro rápido ---------------------------------------------
function renderQuickLog(){
  const host=document.getElementById('quickLog');if(!host)return;
  const ae=document.activeElement;if(host.contains(ae)&&(ae.tagName==='TEXTAREA'||ae.tagName==='INPUT'))return;   // no borrar lo que estás escribiendo
  const d=getDay(),water=Number(d.water)||0,wg=waterGoalL(),sleep=toNumOrNull(d.sleep),steps=toNumOrNull(d.steps),sg=stepsGoal();
  const wp=Math.min(100,Math.round(water/wg*100)),sp=Math.min(100,Math.round((steps||0)/sg*100));
  const chip=h=>`<button type="button" class="qchip${Number(sleep)===h?' on':''}" aria-pressed="${Number(sleep)===h}" onclick="quickSleep(${h})">${h===9?'9+':h} h</button>`;
  host.innerHTML=`<div class="row"><b>⚡ Registro rápido</b><span class="tag">HOY</span></div>
<div class="qrow"><div class="row"><span>💧 Agua</span><span class="small"><b>${String(Math.round(water*100)/100).replace('.',',')}</b> de ${String(wg).replace('.',',')} L</span></div><div class="progress" style="margin:6px 0 8px"><div class="bar" style="width:${wp}%"></div></div><div class="qbtns"><button type="button" class="btn secondary sm" onclick="quickWater(-250)" aria-label="Quitar 250 ml">−250</button><button type="button" class="btn sm" onclick="quickWater(250)">+250 ml</button><button type="button" class="btn sm" onclick="quickWater(500)">+500 ml</button></div></div>
<div class="qrow"><div class="row"><span>😴 Dormí anoche</span><span class="small">${sleep!=null?String(sleep).replace('.',',')+' h':'sin registrar'}</span></div><div class="qbtns" style="margin-top:8px">${[5,6,7,8,9].map(chip).join('')}</div></div>
<div class="qrow"><div class="row"><span>👟 Pasos</span><span class="small">${steps!=null?fmtN(steps):'0'} de ${fmtN(sg)}</span></div><div class="progress" style="margin:6px 0 8px"><div class="bar" style="width:${sp}%"></div></div><div class="two"><input id="quickStepsInput" type="number" inputmode="numeric" min="0" step="100" placeholder="Pasos de hoy" value="${steps??''}" onkeydown="if(event.key==='Enter')quickSteps()"><button type="button" class="btn secondary" onclick="quickSteps()">Guardar pasos</button></div></div>
<details class="gymtools qnote"${d.note?' open':''}><summary>📝 Nota del día${d.note?' · guardada':''}</summary><textarea id="quickNote" rows="3" maxlength="1000" placeholder="¿Cómo te fue hoy?" style="margin-top:8px">${escHtml(d.note||'')}</textarea><button type="button" class="btn secondary" style="width:100%;margin-top:6px" onclick="quickNote()">Guardar nota</button></details>`;
}
function quickWater(ml){const d=getDay();d.water=Math.max(0,Math.round(((Number(d.water)||0)+ml/1000)*100)/100);save();if(supabaseUser)queueLog(today());render();const g=waterGoalL();toast(ml>0?`💧 +${ml} ml · ${String(d.water).replace('.',',')} de ${String(g).replace('.',',')} L`+(d.water>=g?' 🎉 ¡Meta cumplida!':''):'💧 Agua corregida')}
function quickSleep(h){const d=getDay();d.sleep=h;save();if(supabaseUser)queueLog(today());render();toast('😴 Sueño: '+h+' h')}
function quickSteps(){const el=document.getElementById('quickStepsInput'),v=Math.round(Number(el?.value));if(!(v>=0&&v<=100000)){toast('Escribe un número de pasos válido');return}const d=getDay();d.steps=v;save();if(supabaseUser)queueLog(today());render();toast('👟 '+fmtN(v)+' pasos guardados'+(v>=stepsGoal()?' · ¡meta cumplida!':''))}
function quickNote(){const v=(document.getElementById('quickNote')?.value||'').trim();const d=getDay();d.note=v;save();if(supabaseUser)queueLog(today());document.activeElement?.blur?.();render();toast(v?'📝 Nota guardada':'Nota borrada')}
// =====================================================================
// RENOVA · N2 Recetario: base de alimentos, recetas y "Ajustar a mi comida"
// Los alimentos base y las 12 recetas vienen de Supabase (user_id NULL);
// los tuyos llevan tu user_id. Los gramos de carnes/granos son COCIDOS.
// =====================================================================
const ROLE_LABEL={proteina:'Proteína',carbohidrato:'Carbohidrato',grasa:'Grasa',libre:'Libre'};
const MEAL_TYPES=[['desayuno','Desayuno'],['almuerzo','Almuerzo'],['cena','Cena'],['merienda','Merienda'],['cualquiera','Cualquier comida']];
let recipeFilter='todas',openRecipeId=null,adjustFor={};

async function pullRecipes(){
  if(!supabaseUser)return;
  const q=t=>supabaseClient.from(t);
  const [f,r,i]=await Promise.all([q('food_items').select('*').eq('is_active',true).order('name'),q('recipes').select('*').eq('is_active',true).order('name'),q('recipe_ingredients').select('*').order('sort_order')]);
  if(f.error||r.error||i.error){console.warn('RENOVA recetario',f.error||r.error||i.error);return}
  data.foods=(f.data||[]).map(x=>({...x,kcal_100g:+x.kcal_100g,protein_100g:+x.protein_100g,carbs_100g:+x.carbs_100g,fat_100g:+x.fat_100g,unit_g:x.unit_g==null?null:+x.unit_g,cooked_factor:+x.cooked_factor||1,purchase_g:+x.purchase_g||1000}));
  data.recipes=(r.data||[]).map(x=>({...x,ingredients:(i.data||[]).filter(z=>z.recipe_id===x.id).map(z=>({...z,base_grams:+z.base_grams}))}));
}
const foodById=id=>(data.foods||[]).find(f=>f.id===id);
function macrosOf(food,g){const k=g/100;return {kcal:food.kcal_100g*k,p:food.protein_100g*k,c:food.carbs_100g*k,f:food.fat_100g*k}}
function sumMacros(list){return list.reduce((a,x)=>({kcal:a.kcal+x.kcal,p:a.p+x.p,c:a.c+x.c,f:a.f+x.f}),{kcal:0,p:0,c:0,f:0})}
function recipeBase(r){return sumMacros(r.ingredients.map(i=>{const f=foodById(i.food_id);return f?macrosOf(f,i.base_grams):{kcal:0,p:0,c:0,f:0}}))}

// Metas de una comida según tu plan (N1)
function mealTarget(meal){
  const p=data.nutritionPlan;if(!p)return null;
  const split=p.meal_split||{};let pct=split[meal];
  if(pct==null)pct=meal==='merienda'?15:(split.almuerzo||40);
  return {meal,pct,kcal:p.kcal_target*pct/100,p:p.protein_g*pct/100,c:p.carbs_g*pct/100,f:p.fat_g*pct/100};
}

// ---- Ajuste: proteína primero, luego carbohidrato para las calorías, grasa al mínimo
// Topes realistas por porción (nadie se come 8 huevos en un desayuno)
function capGrams(food,g,t){
  const u=food.unit_g;
  if(food.unit_label==='unidad'&&food.category==='proteina'&&u)return Math.min(g,4*u);     // máx. 4 huevos
  if(food.unit_label==='clara'&&u)return Math.min(g,6*u);                                    // máx. 6 claras
  if(food.category==='proteina'||food.category==='lacteo')return Math.min(g,250);
  if(food.category==='suplemento')return Math.min(g,60);
  if(food.category==='carbohidrato')return Math.min(g,(t?.kcal?t.kcal*0.65:450)/(food.kcal_100g/100));   // un carbohidrato ≤ 65% de la comida
  if(food.category==='fruta')return Math.min(g,250);
  if(food.category==='grasa')return Math.min(g,food.kcal_100g>500?(u&&u<=16?15:40):120);
  return g;
}
function adjustRecipe(r,t){
  const ings=r.ingredients.map(i=>({...i,food:foodById(i.food_id)})).filter(i=>i.food);
  const per=role=>sumMacros(ings.filter(i=>i.role===role).map(i=>macrosOf(i.food,i.base_grams)));
  const P=per('proteina'),C=per('carbohidrato'),F=per('grasa');
  const clamp=(v,a,b)=>Math.max(a,Math.min(b,Number.isFinite(v)?v:a));
  const f={proteina:1,carbohidrato:1,grasa:1,libre:1};
  const tot=()=>sumMacros(ings.map(i=>macrosOf(i.food,capGrams(i.food,i.base_grams*f[i.role],t))));
  for(let k=0;k<40;k++){
    let T=tot();
    if(P.p>0)f.proteina=clamp(f.proteina*Math.pow(t.p/Math.max(T.p,1),0.7),0.4,2.5);
    T=tot();
    if(C.kcal>0)f.carbohidrato=clamp(f.carbohidrato+(t.kcal-T.kcal)/C.kcal*0.8,0.25,3.5);
    T=tot();
    if(F.kcal>0){
      if(T.f>t.f*1.05)f.grasa=clamp(f.grasa*(t.f/T.f),0.4,2);
      else if(T.kcal<t.kcal*0.95)f.grasa=clamp(f.grasa+(t.kcal-T.kcal)/F.kcal*0.8,0.4,2);
    }
    if(C.kcal===0&&F.kcal===0&&P.kcal>0){T=tot();f.proteina=clamp(f.proteina*Math.pow(t.kcal/Math.max(T.kcal,1),0.7),0.4,2.5)}
  }
  const items=ings.map(i=>{const g=roundPortion(i.food,capGrams(i.food,i.base_grams*f[i.role],t));return {...i,grams:g.grams,hint:g.hint,m:macrosOf(i.food,g.grams)}});
  const totals=sumMacros(items.map(i=>i.m));
  return {items,totals,proteinTip:proteinTip(t.p-totals.p,t.p)};
}
// Si los topes dejan corta la proteína, propone cómo completarla
function proteinTip(missing,target){
  if(!(missing>target*0.12))return '';
  const g=Math.round(missing),claras=Math.min(6,Math.ceil(missing/3.6));
  return `Faltan ~${g} g de proteína: suma ${claras} clara${claras>1?'s':''} de huevo${missing>15?' o 1 scoop de proteína en polvo cuando la tengas':''}.`;
}
function frac(n){const w=Math.floor(n),h=Math.round((n-w)*2)/2;return (w?String(w):'')+(h===0.5?'½':'')||'0'}
function roundPortion(food,g){
  const u=food.unit_g,label=food.unit_label;
  if(u&&(label==='unidad'||label==='clara')&&food.category==='proteina'){const n=Math.max(1,Math.round(g/u));return {grams:n*u,hint:`${n} ${label==='clara'?(n>1?'claras':'clara'):(n>1?'unidades':'unidad')}`}}
  if(u&&label==='unidad'&&food.category==='carbohidrato'){const n=Math.max(0.5,Math.round(g/u*2)/2);return {grams:Math.round(n*u),hint:`${frac(n)} ${n>1?'unidades':'unidad'}`}}
  if(food.category==='grasa'&&u&&u<=16){const n=Math.max(0.5,Math.round(g/u*2)/2);return {grams:Math.round(n*u*10)/10,hint:`${frac(n)} ${label}`}}
  const grams=Math.max(5,Math.round(g/5)*5);
  let hint='';if(u&&label){const n=grams/u;if(n>=0.4&&n<=4)hint=`≈ ${frac(Math.round(n*2)/2)} ${label}`}
  return {grams,hint};
}
const fmtG=g=>(Math.round(g*10)/10).toString().replace('.',',')+' g';

// ---- Sugerencias de hoy (reemplazan los menús fijos)
function suggestedRecipe(meal,offset=0){
  const pool=(data.recipes||[]).filter(r=>r.meal_type===meal||(meal==='merienda'&&r.meal_type==='cualquiera'));
  const list=pool.length?pool:(data.recipes||[]).filter(r=>r.meal_type==='cualquiera');
  if(!list.length)return null;
  return list[((dayIndex()-1)+offset)%list.length];
}
function nextSuggestion(meal){const d=today(),pi=planItem(d,meal);if(pi){const pool=recipesFor(meal);if(pool.length<2){toast('No hay otra receta para esta comida');return}const i=pool.findIndex(r=>r.id===pi.recipe_id);setPlan(d,meal,pool[(i+1)%pool.length].id);return}data.suggestOffset ||= {};const k=d+'|'+meal;data.suggestOffset[k]=(data.suggestOffset[k]||0)+1;save();renderSuggestions()}
function renderSuggestions(){
  const host=document.getElementById('suggestCard');if(!host)return;
  if(!data.recipes?.length){host.innerHTML='<div class="row"><b>🍽 Hoy</b></div><p class="small">Cargando tus recetas… (necesitas haber iniciado sesión con conexión una vez).</p>';return}
  const meals=planMeals(),d=today();
  host.innerHTML=`<div class="row"><b>🍽 Hoy</b><span class="tag">${data.nutritionPlan?'AJUSTADO A TU META':'PORCIÓN BASE'}</span></div>`+meals.map(meal=>{
    const pi=planItem(d,meal),r=pi?(data.recipes||[]).find(x=>x.id===pi.recipe_id):suggestedRecipe(meal,data.suggestOffset?.[d+'|'+meal]||0);if(!r)return '';
    const t=mealTarget(meal);let items,tot,tip='';
    if(pi){items=(pi.portions||[]).map(p=>{const f=foodById(p.food_id);return {food:f,grams:p.grams,hint:f?roundPortion(f,p.grams).hint:''}});tot={kcal:pi.kcal,p:pi.p,c:pi.c,f:pi.f};const a=t?adjustRecipe(r,t):null;tip=a?.proteinTip||''}
    else{const a=t?adjustRecipe(r,t):null,base=recipeBase(r);items=a?a.items:r.ingredients.map(i=>({food:foodById(i.food_id),grams:i.base_grams,hint:''}));tot=a?a.totals:base;tip=a?.proteinTip||''}
    const lines=items.filter(i=>i.food).map(i=>`${escHtml(i.food.name.replace(/ \((cocid[oa]|escurrido)\)/,''))} ${fmtG(i.grams)}${i.hint?' ('+escHtml(i.hint)+')':''}`).join(' · ');
    return `<div class="sugg"><div class="row"><span class="small" style="font-weight:800;text-transform:uppercase">${MEAL_LABEL[meal]||meal}${t?' · meta '+fmtN(t.kcal)+' kcal':''}${pi?' · 🗓 en tu plan':''}</span><button type="button" class="btn secondary sm" onclick="nextSuggestion('${meal}')" aria-label="Otra opción para ${MEAL_LABEL[meal]||meal}">↻ Otra</button></div><div class="wktitle" style="margin-top:2px">${escHtml(r.name)}</div><div class="small">${lines}</div><div class="small" style="margin-top:4px"><b>${fmtN(tot.kcal)} kcal</b> · ${fmtN(tot.p)} g prot · ${fmtN(tot.c)} g carb · ${fmtN(tot.f)} g grasa</div>${tip?`<div class="ptip">💡 ${escHtml(tip)}</div>`:''}<div class="row" style="margin-top:6px;gap:6px;flex-wrap:wrap">${entryButtons(d,meal)}<button type="button" class="btn secondary sm" onclick="openRecipe('${escHtml(r.id)}','${meal}')">Ver receta</button></div></div>`;
  }).join('')+(data.nutritionPlan?'':'<p class="small" style="margin-bottom:0">Calcula tus metas arriba para que las porciones se ajusten a ti.</p>');
}
function openRecipe(id,meal){openRecipeId=id;if(meal)adjustFor[id]=meal;recipeFilter='todas';renderRecipes();setTimeout(()=>document.getElementById('rc_'+id)?.scrollIntoView({behavior:'smooth',block:'start'}),50)}

// ---- Recetario
function setRecipeFilter(f){recipeFilter=f;renderRecipes()}
function toggleRecipe(id){openRecipeId=openRecipeId===id?null:id;renderRecipes()}
function setAdjust(id,meal){adjustFor[id]=meal;renderRecipes()}
function renderRecipes(){
  const host=document.getElementById('recipesCard');if(!host)return;
  const all=data.recipes||[];
  const list=all.filter(r=>recipeFilter==='todas'||r.meal_type===recipeFilter||(recipeFilter==='mias'&&r.user_id));
  const tabs=[['todas','Todas'],['desayuno','Desayuno'],['almuerzo','Almuerzo'],['cena','Cena'],['mias','Mías']];
  const planMeals=Object.keys(data.nutritionPlan?.meal_split||{});
  host.innerHTML=`<div class="row"><b>📖 Recetario</b><span class="tag">${all.length} RECETAS</span></div><div class="qbtns" style="margin-top:10px">${tabs.map(([k,l])=>`<button type="button" class="qchip${recipeFilter===k?' on':''}" onclick="setRecipeFilter('${k}')">${l}</button>`).join('')}</div>`+
  (list.map(r=>{
    const base=recipeBase(r),open=openRecipeId===r.id;
    let body='';
    if(open){
      const meal=adjustFor[r.id]||(planMeals.includes(r.meal_type)?r.meal_type:planMeals[0]||'almuerzo');
      const t=mealTarget(meal),res=t?adjustRecipe(r,t):null;
      const rows=(res?res.items:r.ingredients.map(i=>({...i,food:foodById(i.food_id),grams:i.base_grams,hint:'',m:foodById(i.food_id)?macrosOf(foodById(i.food_id),i.base_grams):{kcal:0}}))).filter(i=>i.food).map(i=>`<tr><td>${escHtml(i.food.name)}<div class="small">${ROLE_LABEL[i.role]||''}</div></td><td><b>${fmtG(i.grams)}</b>${i.hint?`<div class="small">${escHtml(i.hint)}</div>`:''}</td><td>${fmtN(i.m.kcal)}</td></tr>`).join('');
      const tot=res?res.totals:base;
      const cmp=t?`<div class="adjcmp"><span>Meta ${fmtN(t.kcal)} kcal · ${fmtN(t.p)} g prot</span><span>Receta ${fmtN(tot.kcal)} kcal · ${fmtN(tot.p)} g prot <b class="${Math.abs(tot.kcal-t.kcal)<=t.kcal*0.06?'ok':'warn'}">${tot.kcal-t.kcal>0?'+':''}${fmtN(tot.kcal-t.kcal)} kcal</b></span></div>`:'<p class="small">Porción base. Calcula tus metas para ajustarla a ti.</p>';
      body=`<div class="exbody">${t?`<label class="small" for="adj_${escHtml(r.id)}">Ajustar a mi comida</label><select id="adj_${escHtml(r.id)}" onchange="setAdjust('${escHtml(r.id)}',this.value)">${(planMeals.length?planMeals:['desayuno','almuerzo','cena']).map(m=>`<option value="${m}" ${m===meal?'selected':''}>${MEAL_LABEL[m]} · ${fmtN(mealTarget(m).kcal)} kcal</option>`).join('')}</select>`:''}${cmp}<div class="tableview" style="margin-top:6px"><table><thead><tr><th>Ingrediente</th><th>Cantidad</th><th>kcal</th></tr></thead><tbody>${rows}</tbody></table></div><div class="small" style="margin-top:6px">${fmtN(tot.p)} g proteína · ${fmtN(tot.c)} g carbohidrato · ${fmtN(tot.f)} g grasa. Carnes, granos y legumbres en peso cocido.</div>${res?.proteinTip?`<div class="ptip">💡 ${escHtml(res.proteinTip)}</div>`:''}${r.instructions?`<p style="margin:10px 0 0">${escHtml(r.instructions)}</p>`:''}${r.user_id?`<div class="two" style="margin-top:10px"><button type="button" class="btn secondary" onclick="editRecipe('${escHtml(r.id)}')">Editar</button><button type="button" class="btn danger" onclick="deleteRecipe('${escHtml(r.id)}')">Borrar</button></div>`:''}</div>`;
    }
    return `<div class="exercise${open?' open':''}" id="rc_${escHtml(r.id)}"><button type="button" class="exhead" aria-expanded="${open}" onclick="toggleRecipe('${escHtml(r.id)}')"><span class="exname">${escHtml(r.name)}<span class="small">${MEAL_LABEL[r.meal_type]||'Cualquier comida'}${r.prep_minutes?' · '+r.prep_minutes+' min':''} · base ${fmtN(base.kcal)} kcal · ${fmtN(base.p)} g prot${r.user_id?' · tuya':''}</span></span><span class="chev">${open?'▾':'▸'}</span></button>${body}</div>`;
  }).join('')||'<div class="empty">No hay recetas en este filtro.</div>')+
  `<button type="button" class="btn" style="width:100%;margin-top:10px" onclick="editRecipe()">+ Crear mi receta</button>`;
}

// ---- Crear / editar recetas propias
let recipeDraft=null;
function defaultRole(food){return {proteina:'proteina',lacteo:'proteina',suplemento:'proteina',carbohidrato:'carbohidrato',fruta:'carbohidrato',grasa:'grasa',verdura:'libre'}[food?.category]||'libre'}
function foodOptions(sel){
  const cats=[['proteina','Proteínas'],['lacteo','Lácteos'],['suplemento','Suplementos'],['carbohidrato','Carbohidratos'],['fruta','Frutas'],['verdura','Verduras'],['grasa','Grasas'],['otro','Otros']];
  return '<option value="">Elige un alimento…</option>'+cats.map(([c,l])=>{const fs=(data.foods||[]).filter(f=>f.category===c);return fs.length?`<optgroup label="${l}">${fs.map(f=>`<option value="${f.id}" ${f.id===sel?'selected':''}>${escHtml(f.name)}${f.user_id?' (tuyo)':''}</option>`).join('')}</optgroup>`:''}).join('');
}
function editRecipe(id){
  const r=id?(data.recipes||[]).find(x=>x.id===id):null;
  recipeDraft=r?{id:r.id,name:r.name,meal_type:r.meal_type,prep_minutes:r.prep_minutes||'',instructions:r.instructions||'',items:r.ingredients.map(i=>({food_id:i.food_id,role:i.role,grams:i.base_grams}))}:{name:'',meal_type:'almuerzo',prep_minutes:'',instructions:'',items:[{food_id:'',role:'proteina',grams:150},{food_id:'',role:'carbohidrato',grams:150},{food_id:'',role:'libre',grams:100}]};
  document.getElementById('recipeDlgBody').innerHTML='';document.getElementById('recipeDlgMsg').textContent='';document.getElementById('recipeDlgTitle').textContent=r?'Editar receta':'Nueva receta';
  renderRecipeDialog();const d=document.getElementById('recipeDialog');d.showModal?d.showModal():d.setAttribute('open','');
}
function draftSet(i,field,value){const it=recipeDraft.items[i];it[field]=field==='grams'?Number(value):value;if(field==='food_id')it.role=defaultRole(foodById(value));renderRecipeDialog()}
function draftAdd(){recipeDraft.items.push({food_id:'',role:'libre',grams:100});renderRecipeDialog()}
function draftRemove(i){recipeDraft.items.splice(i,1);renderRecipeDialog()}
function renderRecipeDialog(){
  const d=recipeDraft,box=document.getElementById('recipeDlgBody');if(!box)return;
  const keep=id=>document.getElementById(id)?.value;
  if(document.getElementById('rName')){d.name=keep('rName');d.meal_type=keep('rMeal');d.prep_minutes=keep('rPrep');d.instructions=keep('rInstr')}
  const base=sumMacros(d.items.map(i=>{const f=foodById(i.food_id);return f&&i.grams>0?macrosOf(f,i.grams):{kcal:0,p:0,c:0,f:0}}));
  box.innerHTML=`<label class="small" for="rName">Nombre</label><input id="rName" maxlength="100" value="${escHtml(d.name)}" placeholder="Ej. Pollo al curry con arroz">
<div class="formgrid" style="margin-top:8px"><div><label class="small" for="rMeal">Comida</label><select id="rMeal">${MEAL_TYPES.map(([k,l])=>`<option value="${k}" ${k===d.meal_type?'selected':''}>${l}</option>`).join('')}</select></div><div><label class="small" for="rPrep">Minutos</label><input id="rPrep" type="number" min="0" max="240" value="${escHtml(d.prep_minutes)}" placeholder="20"></div></div>
<div class="charttitle" style="margin-top:12px">Ingredientes <span class="small">(gramos cocidos de la porción base)</span></div>
${d.items.map((it,i)=>`<div class="ingrow"><select aria-label="Alimento ${i+1}" onchange="draftSet(${i},'food_id',this.value)">${foodOptions(it.food_id)}</select><select aria-label="Rol ${i+1}" onchange="draftSet(${i},'role',this.value)">${Object.entries(ROLE_LABEL).map(([k,l])=>`<option value="${k}" ${k===it.role?'selected':''}>${l}</option>`).join('')}</select><input aria-label="Gramos ${i+1}" type="number" min="1" max="2000" value="${it.grams||''}" onchange="draftSet(${i},'grams',this.value)"><button type="button" class="btn danger sm" aria-label="Quitar ingrediente ${i+1}" onclick="draftRemove(${i})">×</button></div>`).join('')}
<button type="button" class="btn secondary sm" style="margin-top:8px" onclick="draftAdd()">+ Ingrediente</button>
<details class="gymtools" id="newFoodBox"><summary>¿No está el alimento? Agrégalo</summary><div class="formgrid" style="margin-top:8px"><div class="full"><input id="nfName" maxlength="80" placeholder="Nombre (ej. Pan árabe)"></div><div><select id="nfCat">${[['proteina','Proteína'],['carbohidrato','Carbohidrato'],['fruta','Fruta'],['verdura','Verdura'],['grasa','Grasa'],['lacteo','Lácteo'],['suplemento','Suplemento'],['otro','Otro']].map(([k,l])=>`<option value="${k}">${l}</option>`).join('')}</select></div><div><input id="nfKcal" type="number" min="0" placeholder="kcal / 100 g"></div><div><input id="nfP" type="number" min="0" step="0.1" placeholder="Proteína g"></div><div><input id="nfC" type="number" min="0" step="0.1" placeholder="Carbos g"></div><div><input id="nfF" type="number" min="0" step="0.1" placeholder="Grasa g"></div><div><button type="button" class="btn secondary" style="width:100%" onclick="saveNewFood()">Guardar alimento</button></div></div><div class="small">Datos por 100 g: los ves en la etiqueta nutricional del empaque.</div></details>
<label class="small" for="rInstr" style="display:block;margin-top:10px">Preparación</label><textarea id="rInstr" rows="3" placeholder="Pasos cortos">${escHtml(d.instructions)}</textarea>
<div class="small" style="margin-top:6px">Porción base: <b>${fmtN(base.kcal)} kcal</b> · ${fmtN(base.p)} g prot · ${fmtN(base.c)} g carb · ${fmtN(base.f)} g grasa</div>`;
}
function closeRecipeDialog(){const d=document.getElementById('recipeDialog');d.close?d.close():d.removeAttribute('open')}
async function saveNewFood(){
  const v=id=>document.getElementById(id).value,name=v('nfName').trim(),kcal=Number(v('nfKcal'));
  const msg=document.getElementById('recipeDlgMsg');
  if(name.length<2||!(kcal>=0&&v('nfKcal')!=='')){msg.textContent='Escribe nombre y kcal por 100 g del alimento.';return}
  if(!supabaseUser||!navigator.onLine){msg.textContent='Necesitas conexión para guardar alimentos.';return}
  const row={user_id:supabaseUser.id,is_active:true,name,category:v('nfCat'),kcal_100g:kcal,protein_100g:Number(v('nfP'))||0,carbs_100g:Number(v('nfC'))||0,fat_100g:Number(v('nfF'))||0};
  const r=await supabaseClient.from('food_items').insert(row).select('*').single();
  if(r.error){msg.textContent='No se pudo guardar: '+r.error.message;return}
  await pullRecipes();msg.textContent='✅ '+name+' agregado. Ya lo puedes elegir en la lista.';
  recipeDraft.items.push({food_id:r.data.id,role:defaultRole(r.data),grams:100});renderRecipeDialog();
}
async function submitRecipe(ev){
  ev?.preventDefault?.();renderRecipeDialog();
  const d=recipeDraft,msg=document.getElementById('recipeDlgMsg');
  const items=d.items.filter(i=>i.food_id&&i.grams>0);
  if((d.name||'').trim().length<2){msg.textContent='Ponle un nombre a la receta.';return}
  if(!items.length){msg.textContent='Agrega al menos un ingrediente con gramos.';return}
  if(!items.some(i=>i.role==='proteina')){msg.textContent='Incluye al menos un ingrediente con rol Proteína para poder ajustarla.';return}
  if(!supabaseUser||!navigator.onLine){msg.textContent='Necesitas conexión para guardar recetas.';return}
  msg.textContent='Guardando…';
  const uid=supabaseUser.id,rec={user_id:uid,is_active:true,name:d.name.trim().slice(0,100),meal_type:d.meal_type,prep_minutes:d.prep_minutes===''?null:Math.round(Number(d.prep_minutes)),instructions:(d.instructions||'').trim()||null,updated_at:nowIso()};
  let rid=d.id;
  if(rid){const u=await supabaseClient.from('recipes').update(rec).eq('user_id',uid).eq('id',rid);if(u.error){msg.textContent='No se pudo guardar: '+u.error.message;return}
    const del=await supabaseClient.from('recipe_ingredients').delete().eq('user_id',uid).eq('recipe_id',rid);if(del.error){msg.textContent='No se pudo guardar: '+del.error.message;return}}
  else{const ins=await supabaseClient.from('recipes').insert(rec).select('id').single();if(ins.error){msg.textContent='No se pudo guardar: '+ins.error.message;return}rid=ins.data.id}
  const ing=await supabaseClient.from('recipe_ingredients').insert(items.map((i,n)=>({user_id:uid,recipe_id:rid,food_id:i.food_id,role:i.role,base_grams:i.grams,sort_order:n+1})));
  if(ing.error){msg.textContent='No se pudieron guardar los ingredientes: '+ing.error.message;return}
  await pullRecipes();save();closeRecipeDialog();openRecipeId=rid;recipeFilter='todas';renderRecipes();renderSuggestions();toast('Receta guardada');
}
async function deleteRecipe(id){
  const r=(data.recipes||[]).find(x=>x.id===id);if(!r||!r.user_id)return;
  if(!confirm('¿Borrar la receta “'+r.name+'”? No se puede deshacer.'))return;
  const del=await supabaseClient.from('recipes').delete().eq('user_id',supabaseUser.id).eq('id',id);
  if(del.error){toast('No se pudo borrar la receta');return}
  await pullRecipes();save();openRecipeId=null;renderRecipes();renderSuggestions();toast('Receta borrada');
}
// =====================================================================
// RENOVA · N3 Plan semanal, registro de comidas y lista de compras
// meal_plan_items: una receta ajustada por día y comida
// meal_entries:    ✓ comida · ⇄ otra cosa · ✗ saltada
// shopping_list_items: lista generada desde el plan (y lo que agregues a mano)
// =====================================================================
let planWeekOffset=0;
const ENTRY={comida:{icon:'✓',label:'Me la comí'},otra:{icon:'⇄',label:'Comí otra cosa'},saltada:{icon:'✗',label:'Me la salté'}};
const SECTION_ORDER=['Carnes','Lácteos y huevos','Granos y harinas','Frutas y verduras','Despensa','Suplementos','Otros'];

function planMeals(){return Object.keys(data.nutritionPlan?.meal_split||{desayuno:1,almuerzo:1,cena:1})}
function planItem(date,meal){return data.mealPlan?.[date]?.[meal]||null}
function mealEntry(date,meal){return data.mealEntries?.[date]?.[meal]||null}

// ---- Cola hacia Supabase
function queueMealPlan(date,meal,noFlush){
  const it=planItem(date,meal),key='mp:'+date+'|'+meal;
  if(it)cloud({key,t:'upsert',table:'meal_plan_items',onConflict:'user_id,plan_date,meal_type',rows:[{plan_date:date,meal_type:meal,recipe_id:it.recipe_id,portions:it.portions,kcal:Math.round(it.kcal),protein_g:Math.round(it.p*10)/10,carbs_g:Math.round(it.c*10)/10,fat_g:Math.round(it.f*10)/10,updated_at:nowIso()}]},noFlush);
  else cloud({key,t:'delete',table:'meal_plan_items',match:{plan_date:date,meal_type:meal}},noFlush);
}
function queueMealEntry(date,meal,noFlush){
  const st=mealEntry(date,meal),key='me:'+date+'|'+meal;
  if(st)cloud({key,t:'upsert',table:'meal_entries',onConflict:'user_id,entry_date,meal_type',rows:[{entry_date:date,meal_type:meal,status:st}]},noFlush);
  else cloud({key,t:'delete',table:'meal_entries',match:{entry_date:date,meal_type:meal}},noFlush);
}
async function pullMealPlan(){
  const uid=supabaseUser.id,since=addDays(weekStart(today()),-28),q=t=>supabaseClient.from(t);
  const [mp,me]=await Promise.all([q('meal_plan_items').select('*').eq('user_id',uid).gte('plan_date',since),q('meal_entries').select('entry_date,meal_type,status').eq('user_id',uid).gte('entry_date',since)]);
  if(!mp.error){
    const plan={};for(const r of mp.data||[])(plan[r.plan_date] ||= {})[r.meal_type]={recipe_id:r.recipe_id,portions:r.portions||[],kcal:+r.kcal||0,p:+r.protein_g||0,c:+r.carbs_g||0,f:+r.fat_g||0};
    for(const op of syncQueue){const m=/^mp:(\d{4}-\d{2}-\d{2})\|(\w+)$/.exec(op.key||'');if(!m)continue;const local=data.mealPlan?.[m[1]]?.[m[2]];(plan[m[1]] ||= {});if(op.t==='delete')delete plan[m[1]][m[2]];else if(local)plan[m[1]][m[2]]=local}
    data.mealPlan=plan;
  }else console.warn('RENOVA meal_plan_items',mp.error);
  if(!me.error){
    const ent={};for(const r of me.data||[])(ent[r.entry_date] ||= {})[r.meal_type]=r.status;
    for(const op of syncQueue){const m=/^me:(\d{4}-\d{2}-\d{2})\|(\w+)$/.exec(op.key||'');if(!m)continue;const local=data.mealEntries?.[m[1]]?.[m[2]];(ent[m[1]] ||= {});if(op.t==='delete')delete ent[m[1]][m[2]];else if(local)ent[m[1]][m[2]]=local}
    data.mealEntries=ent;
  }else console.warn('RENOVA meal_entries',me.error);
}

// ---- Armar el plan
function buildPlanItem(recipe,meal){
  const t=mealTarget(meal);
  if(t){const a=adjustRecipe(recipe,t);return {recipe_id:recipe.id,portions:a.items.map(i=>({food_id:i.food_id,grams:i.grams})),kcal:a.totals.kcal,p:a.totals.p,c:a.totals.c,f:a.totals.f}}
  const b=recipeBase(recipe);return {recipe_id:recipe.id,portions:recipe.ingredients.map(i=>({food_id:i.food_id,grams:i.base_grams})),kcal:b.kcal,p:b.p,c:b.c,f:b.f};
}
function recipesFor(meal){const own=(data.recipes||[]).filter(r=>r.meal_type===meal);return own.length?own:(data.recipes||[]).filter(r=>r.meal_type==='cualquiera'||(meal==='merienda'&&r.meal_type==='desayuno'))}
function setPlan(date,meal,recipeId,quiet){
  data.mealPlan ||= {};(data.mealPlan[date] ||= {});
  const r=(data.recipes||[]).find(x=>x.id===recipeId);
  if(r)data.mealPlan[date][meal]=buildPlanItem(r,meal);else delete data.mealPlan[date][meal];
  save();if(supabaseUser)queueMealPlan(date,meal,quiet);
  if(!quiet){render();toast(r?'Plan: '+r.name:'Comida quitada del plan')}
}
function fillWeek(){
  if(!data.recipes?.length){toast('Aún no se cargan las recetas');return}
  if(!data.nutritionPlan&&!confirm('Aún no calculas tus metas: el plan usará porciones base. ¿Seguir?'))return;
  const dates=weekDates(addDays(weekStart(today()),planWeekOffset*7)).filter(d=>d>=today());
  let n=0;
  for(const meal of planMeals()){
    const pool=recipesFor(meal);if(!pool.length)continue;
    let prev=planItem(addDays(dates[0],-1),meal)?.recipe_id;
    dates.forEach((d,i)=>{
      const cur=planItem(d,meal);if(cur){prev=cur.recipe_id;return}
      let r=pool[(dayIndex()+i+n)%pool.length];if(pool.length>1&&r.id===prev)r=pool[(pool.indexOf(r)+1)%pool.length];
      setPlan(d,meal,r.id,true);prev=r.id;n++;
    });
  }
  flushQueue();render();toast(n?`Semana llenada: ${n} comidas`:'La semana ya estaba completa');
}
function clearWeek(){
  const dates=weekDates(addDays(weekStart(today()),planWeekOffset*7)).filter(d=>d>=today());
  if(!confirm('¿Vaciar el plan desde hoy hasta el domingo?'))return;
  for(const d of dates)for(const m of planMeals())if(planItem(d,m))setPlan(d,m,'',true);
  flushQueue();render();toast('Plan vaciado');
}
function setEntry(date,meal,status){
  data.mealEntries ||= {};(data.mealEntries[date] ||= {});
  if(data.mealEntries[date][meal]===status)delete data.mealEntries[date][meal];else data.mealEntries[date][meal]=status;
  save();if(supabaseUser)queueMealEntry(date,meal);render();
  const st=data.mealEntries[date][meal];toast(st?ENTRY[st].icon+' '+ENTRY[st].label:'Registro quitado');
}
function entryButtons(date,meal){const cur=mealEntry(date,meal);return `<div class="entrybtns">${Object.entries(ENTRY).map(([k,e])=>`<button type="button" class="qchip${cur===k?' on':''}" aria-pressed="${cur===k}" title="${e.label}" onclick="setEntry('${date}','${meal}','${k}')">${e.icon} ${k==='comida'?'Comí':k==='otra'?'Otra':'Salté'}</button>`).join('')}</div>`}

// ---- Render del plan semanal
function renderPlan(){
  const host=document.getElementById('planCard');if(!host)return;
  const start=addDays(weekStart(today()),planWeekOffset*7),dates=weekDates(start),meals=planMeals();
  const opts=(meal,sel)=>'<option value="">— sin plan —</option>'+recipesFor(meal).map(r=>`<option value="${r.id}" ${r.id===sel?'selected':''}>${escHtml(r.name)}</option>`).join('');
  const days=dates.map((d,i)=>{
    const past=d<today(),isToday=d===today();
    const tot=meals.reduce((a,m)=>a+(planItem(d,m)?.kcal||0),0);
    return `<div class="planday${isToday?' today':''}${past?' past':''}"><div class="row"><b>${DOW[i]} ${Number(d.slice(8))}${isToday?' · hoy':''}</b><span class="small">${tot?fmtN(tot)+' kcal':''}</span></div>${meals.map(m=>{const it=planItem(d,m),e=mealEntry(d,m);return `<div class="planmeal"><span class="small pm-label">${MEAL_LABEL[m]}${e?' '+ENTRY[e].icon:''}</span><select aria-label="${MEAL_LABEL[m]} ${d}" ${past?'disabled':''} onchange="setPlan('${d}','${m}',this.value)">${opts(m,it?.recipe_id)}</select></div>`}).join('')}</div>`;
  }).join('');
  const filled=dates.filter(d=>d>=today()).reduce((a,d)=>a+meals.filter(m=>planItem(d,m)).length,0),slots=dates.filter(d=>d>=today()).length*meals.length;
  host.innerHTML=`<div class="row"><b>🗓 Plan de la semana</b><span class="tag">${filled}/${slots} COMIDAS</span></div><div class="row weeknav" style="margin-top:8px"><button type="button" class="btn secondary sm" aria-label="Semana anterior" ${planWeekOffset<=-4?'disabled':''} onclick="planWeekOffset--;renderPlan()">←</button><div class="center"><b>${planWeekOffset===0?'Esta semana':planWeekOffset===1?'Próxima semana':'Semana'}</b><div class="small">${shortDate(dates[0])} – ${shortDate(dates[6])}</div></div><button type="button" class="btn secondary sm" aria-label="Semana siguiente" ${planWeekOffset>=2?'disabled':''} onclick="planWeekOffset++;renderPlan()">→</button></div><div class="two" style="margin-top:10px"><button type="button" class="btn" onclick="fillWeek()">Llenar semana</button><button type="button" class="btn secondary" onclick="clearWeek()">Vaciar</button></div><p class="small" style="margin:8px 0 0">"Llenar" completa solo lo vacío desde hoy, sin repetir la misma receta dos días seguidos. Cada comida ya va ajustada a tu meta.</p><div class="plandays">${days}</div>`;
}

// ---- Lista de compras desde el plan
function purchaseText(food,rawG){
  const pg=food.purchase_g||1000,lbl=food.purchase_label||'kg';
  if(food.unit_g&&(food.unit_label==='unidad'||food.unit_label==='clara')&&lbl==='docena'){const n=Math.ceil(rawG/food.unit_g);return {qty:n,unit:n===1?(food.unit_label==='clara'?'clara':'unidad'):(food.unit_label==='clara'?'claras':'unidades'),note:n>=12?`≈ ${frac(Math.round(n/12*4)/4)} docena`:''}}
  if(lbl==='kg'){const kg=Math.max(0.1,Math.ceil(rawG/100)/10);return {qty:kg,unit:'kg',note:''}}
  if(lbl==='libra'){const lb=Math.max(0.5,Math.ceil(rawG/pg*2)/2);return {qty:lb,unit:lb===1?'libra':'libras',note:`${fmtN(rawG)} g`}}
  const n=Math.max(1,Math.ceil(rawG/pg));return {qty:n,unit:n===1?lbl:(lbl.endsWith('a')||lbl.endsWith('o')||lbl.endsWith('e')?lbl+'s':lbl+'es'),note:rawG<pg*0.35?`usas ${fmtN(rawG)} g`:''};
}
function generateShoppingFromPlan(){
  const start=addDays(weekStart(today()),planWeekOffset*7),dates=weekDates(start).filter(d=>d>=today());
  const need={};
  for(const d of dates)for(const m of planMeals()){const it=planItem(d,m);if(!it)continue;for(const p of it.portions||[])need[p.food_id]=(need[p.food_id]||0)+Number(p.grams||0)}
  const ids=Object.keys(need);
  if(!ids.length){toast('Primero arma tu plan de la semana');return}
  const manual=(data.shoppingList||[]).filter(x=>x.source!=='plan');
  const items=ids.map(id=>{const f=foodById(id);if(!f)return null;const raw=need[id]/(f.cooked_factor||1);const pt=purchaseText(f,raw);return {name:f.name.replace(/ \((cocid[oa]|escurrido)\)/,''),qty:pt.qty,unit:pt.unit,note:pt.note,section:f.store_section||'Otros',done:false,food_id:id,source:'plan'}}).filter(Boolean);
  data.shoppingList=[...items,...manual];save();if(supabaseUser)queueShop();render();
  toast(`Lista lista: ${items.length} productos para ${dates.length} día${dates.length>1?'s':''}`);
}
function toggleShop(i){const it=data.shoppingList[i];if(!it)return;it.done=!it.done;save();if(supabaseUser)queueShop();renderShoppingList()}
function addShopItem(){const el=document.getElementById('shopNew'),v=(el?.value||'').trim();if(!v)return;data.shoppingList.push({name:v.slice(0,80),qty:null,unit:null,section:'Otros',done:false,food_id:null,source:'manual'});save();if(supabaseUser)queueShop();renderShoppingList();toast('Agregado a la lista')}
function clearBought(){const n=data.shoppingList.filter(x=>x.done).length;if(!n){toast('No hay productos marcados');return}data.shoppingList=data.shoppingList.filter(x=>!x.done);save();if(supabaseUser)queueShop();renderShoppingList();toast(`${n} producto${n>1?'s':''} quitado${n>1?'s':''}`)}
function renderShoppingList(){
  const e=document.getElementById('shoppingCard');if(!e)return;
  const list=(data.shoppingList||[]).map((x,i)=>({...x,i}));
  const groups={};for(const it of list)(groups[it.section||'Otros'] ||= []).push(it);
  const secs=Object.keys(groups).sort((a,b)=>(SECTION_ORDER.indexOf(a)+99*(SECTION_ORDER.indexOf(a)<0))-(SECTION_ORDER.indexOf(b)+99*(SECTION_ORDER.indexOf(b)<0)));
  const done=list.filter(x=>x.done).length;
  e.innerHTML=`<div class="row"><b>🛒 Lista de compras</b><span class="tag">${list.length?done+'/'+list.length:'VACÍA'}</span></div><button type="button" class="btn" style="width:100%;margin-top:10px" onclick="generateShoppingFromPlan()">Generar desde mi plan</button><p class="small" style="margin:6px 0 0">Suma lo que falta de la semana (desde hoy), pasa de cocido a crudo y redondea a como se compra.</p>`+
  (list.length?secs.map(s=>`<div class="shopsec">${escHtml(s)}</div>`+groups[s].map(it=>`<label class="shopitem${it.done?' done':''}"><input type="checkbox" ${it.done?'checked':''} onchange="toggleShop(${it.i})"><span class="shopname">${escHtml(it.name)}</span><span class="shopqty">${escHtml(shopLabel(it))}</span></label>`).join('')).join(''):'<div class="empty small">Arma el plan de la semana y genera tu lista.</div>')+
  `<div class="two" style="margin-top:10px"><input id="shopNew" maxlength="80" placeholder="Agregar a mano (ej. café)" onkeydown="if(event.key==='Enter')addShopItem()"><button type="button" class="btn secondary" onclick="addShopItem()">+ Agregar</button></div>${done?`<button type="button" class="btn secondary sm" style="margin-top:8px" onclick="clearBought()">Quitar lo comprado (${done})</button>`:''}`;
}
function generateShoppingList(){generateShoppingFromPlan()}

// ---- Cumplimiento del plan (para el tablero)
function mealAdherence(dates){
  let planned=0,eaten=0;
  for(const d of dates){if(d>today())continue;for(const m of planMeals()){if(!planItem(d,m)&&!mealEntry(d,m))continue;planned++;if(mealEntry(d,m)==='comida')eaten++}}
  return planned?Math.round(eaten/planned*100):null;
}
