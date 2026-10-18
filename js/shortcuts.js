// RENOVA · accesos directos
// Acciones del ícono de la app: +500 ml de agua, hábitos, entreno de hoy y registrar la comida.
// Accesos directos del ícono (manifest "shortcuts"): ./?accion=agua|habitos|entreno|comi
// La acción se lee al abrir, se quita de la URL (así recargar no la repite) y se ejecuta
// cuando ya hay sesión y datos cargados. Todo pasa por la cola normal, funciona sin señal.
let launchAction=(()=>{try{const u=new URL(location.href),a=u.searchParams.get('accion');if(a){u.searchParams.delete('accion');history.replaceState(null,'',u.pathname+(u.search||'')+u.hash)}return a}catch(_){return null}})();
const MEAL_START={desayuno:0,almuerzo:11,merienda:16,cena:17};
function currentMeal(date=new Date()){
  const meals=planMeals(),h=date.getHours()+date.getMinutes()/60;
  const start=m=>m==='cena'&&meals.includes('merienda')?19:MEAL_START[m]??0;
  return meals.slice().sort((a,b)=>start(a)-start(b)).filter(m=>start(m)<=h).pop()||meals[0];
}
function focusCard(id){const el=document.getElementById(id);if(!el)return;el.scrollIntoView({block:'center'});el.classList.add('flash');setTimeout(()=>el.classList.remove('flash'),1600)}
function runLaunchAction(){
  const a=launchAction;launchAction=null;if(!a||!currentUser)return;
  if(a==='agua'){show('home');quickWater(500);focusCard('quickLog')}
  else if(a==='habitos'){show('check')}
  else if(a==='entreno'){show('gym')}
  else if(a==='comi'){
    show('home');
    if(!data.nutritionPlan){toast('Primero calcula tus metas de nutrición');focusCard('homeNutrition');return}
    const m=currentMeal(),d=today();
    if(mealEntry(d,m)==='comida')toast('✓ '+(MEAL_LABEL[m]||m)+' ya estaba registrado');else setEntry(d,m,'comida');
    focusCard('homeNutrition');
  }
}
