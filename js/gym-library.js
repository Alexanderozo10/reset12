// Biblioteca de ejercicios del gym (v25): el botón "Cambiar" de cada ejercicio
// abre este panel. Filtra por equipo y conserva series, reps y descanso.
const GYM_LIBRARY=[
{nombre:'Press banca plano con barra',grupo:'Pecho',equipo:'Barra'},
{nombre:'Press inclinado con mancuernas',grupo:'Pecho',equipo:'Mancuernas'},
{nombre:'Press de pecho en máquina',grupo:'Pecho',equipo:'Máquina'},
{nombre:'Press de hombros en máquina',grupo:'Hombros',equipo:'Máquina'},
{nombre:'Press de hombros con mancuernas',grupo:'Hombros',equipo:'Mancuernas'},
{nombre:'Elevaciones laterales con mancuernas',grupo:'Hombros',equipo:'Mancuernas'},
{nombre:'Extensión de tríceps en polea',grupo:'Tríceps',equipo:'Polea'},
{nombre:'Sentadilla con barra',grupo:'Cuádriceps',equipo:'Barra'},
{nombre:'Prensa de piernas',grupo:'Cuádriceps',equipo:'Máquina'},
{nombre:'Extensión de cuádriceps',grupo:'Cuádriceps',equipo:'Máquina'},
{nombre:'Peso muerto con barra',grupo:'Femorales, glúteos y espalda',equipo:'Barra'},
{nombre:'Curl femoral en máquina',grupo:'Femorales',equipo:'Máquina'},
{nombre:'Gemelos de pie en máquina',grupo:'Gemelos',equipo:'Máquina'},
{nombre:'Zancada caminando con mancuernas',grupo:'Glúteos',equipo:'Mancuernas'},
{nombre:'Hip thrust',grupo:'Glúteos',equipo:'Barra'},
{nombre:'Jalón al pecho agarre pronado (palmas al frente)',grupo:'Dorsal',equipo:'Polea'},
{nombre:'Remo con barra',grupo:'Espalda media',equipo:'Barra'},
{nombre:'Remo sentado en polea',grupo:'Espalda media',equipo:'Polea'},
{nombre:'Remo en máquina',grupo:'Espalda',equipo:'Máquina'},
{nombre:'Face pull en polea',grupo:'Deltoide posterior',equipo:'Polea'},
{nombre:'Encogimientos con mancuernas',grupo:'Trapecio',equipo:'Mancuernas'},
{nombre:'Hiperextensiones',grupo:'Lumbar',equipo:'Peso corporal'},
{nombre:'Curl de bíceps con mancuernas',grupo:'Bíceps',equipo:'Mancuernas'},
{nombre:'Dead bug',grupo:'Core',equipo:'Peso corporal'},
{nombre:'Plancha abdominal',grupo:'Core',equipo:'Peso corporal'},
{nombre:'Plancha lateral',grupo:'Oblicuos',equipo:'Peso corporal'},
{nombre:'Escaladores',grupo:'Core',equipo:'Peso corporal'},
{nombre:'Crunch en suelo',grupo:'Abdomen',equipo:'Peso corporal'},
{nombre:'Burpees',grupo:'Cardio',equipo:'Peso corporal'},
{nombre:'Saltarines (jumping jacks)',grupo:'Cardio',equipo:'Peso corporal'},
{nombre:'Lazo (comba)',grupo:'Cardio',equipo:'Peso corporal'},
{nombre:'Caminadora inclinada (Zona 2)',grupo:'Cardio',equipo:'Cardio'},
{nombre:'Caminata larga o bicicleta (Zona 2)',grupo:'Cardio',equipo:'Cardio'},
{nombre:'Movilidad de cadera y espalda',grupo:'Movilidad',equipo:'Peso corporal'}
];
const GYM_LIB_FILTERS=['Todos','Sin polea','Peso corporal','Mancuernas','Barra','Máquina','Polea','Cardio'];
let gymLibFilter='Todos';
function openLibraryDialog(rid,eid){
  const r=exercises.find(x=>String(x.id)===String(rid));if(!r)return;
  const item=r.items.find(x=>String(x.id)===String(eid));if(!item)return;
  const dlg=document.getElementById('libDialog');dlg.dataset.rid=rid;dlg.dataset.eid=eid;
  document.getElementById('libDlgTitle').textContent='Cambiar: '+item.nombre;
  document.getElementById('libSearch').value='';gymLibFilter='Todos';
  document.getElementById('libMsg').textContent='';
  document.getElementById('libFilters').innerHTML=GYM_LIB_FILTERS.map(f=>`<button type="button" class="wkchip${f===gymLibFilter?' cur':''}" onclick="setLibFilter('${escHtml(f)}')">${escHtml(f)}</button>`).join('');
  renderLibraryList();
  if(typeof dlg.showModal==='function')dlg.showModal();else dlg.setAttribute('open','');
}
function closeLibraryDialog(){const dlg=document.getElementById('libDialog');if(typeof dlg.close==='function')dlg.close();else dlg.removeAttribute('open')}
function setLibFilter(f){gymLibFilter=f;document.querySelectorAll('#libFilters .wkchip').forEach(b=>b.classList.toggle('cur',b.textContent.trim()===f));renderLibraryList()}
function libFilterMatch(e){
  if(gymLibFilter==='Todos')return true;
  if(gymLibFilter==='Sin polea')return e.equipo!=='Polea';
  return e.equipo===gymLibFilter;
}
function renderLibraryList(){
  const q=(document.getElementById('libSearch').value||'').trim().toLocaleLowerCase('es');
  const list=GYM_LIBRARY.filter(e=>libFilterMatch(e)&&(!q||(e.nombre+' '+e.grupo).toLocaleLowerCase('es').includes(q)));
  document.getElementById('libList').innerHTML=list.length?list.map((e,i)=>`<button type="button" class="libitem" onclick="pickLibraryExercise(${GYM_LIBRARY.indexOf(e)})"><b>${escHtml(e.nombre)}</b><span class="small">${escHtml(e.grupo)} · ${escHtml(e.equipo)}</span></button>`).join(''):'<div class="small">Sin resultados. Prueba otra búsqueda o filtro.</div>';
}
async function pickLibraryExercise(index){
  const dlg=document.getElementById('libDialog'),msg=document.getElementById('libMsg');
  const r=exercises.find(x=>String(x.id)===dlg.dataset.rid);if(!r)return closeLibraryDialog();
  const item=r.items.find(x=>String(x.id)===dlg.dataset.eid);if(!item)return closeLibraryDialog();
  const pick=GYM_LIBRARY[index];if(!pick)return;
  if(!supabaseUser){msg.textContent='Inicia sesión para cambiar el ejercicio.';return}
  if(r.items.some(x=>String(x.id)!==String(item.id)&&exKey(x.nombre)===exKey(pick.nombre))){msg.textContent='Ese ejercicio ya está en esta rutina.';return}
  msg.textContent='Guardando…';
  // Mismo id de fila: series, reps y descanso se conservan; solo cambian nombre y grupo.
  const row={exercise_name:pick.nombre,notes:'__RENOVA_IMPORT__|'+item.reps+'|'+pick.grupo};
  const res=await supabaseClient.from('routine_exercises').update(row).eq('user_id',supabaseUser.id).eq('id',item.id);
  if(res.error){msg.textContent='No se pudo cambiar: '+res.error.message;return}
  Object.assign(item,{nombre:pick.nombre,grupo:pick.grupo});
  data.gymRoutines=exercises;save();closeLibraryDialog();renderExercises();toast('Ejercicio cambiado');
}
