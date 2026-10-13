// RENOVA · nutrición
// Menús rotativos y lista de compras.
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
