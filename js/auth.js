// RENOVA · sesión
// Login con Google vía Supabase, cuenta, cierre de sesión y arranque de la app.
function showAccount(){
  const chip=document.getElementById('accountChip'),card=document.getElementById('profileCard'),name=document.getElementById('profileName'),email=document.getElementById('profileEmail'),avatar=document.getElementById('profileAvatar');
  if(!currentUser)return;
  const displayName=currentUser.name||currentUser.email.split('@')[0]||'Usuario';
  if(chip){chip.textContent='👤 '+displayName;chip.style.display='block'}
  if(card)card.style.display='block';
  if(name)name.textContent=displayName;
  if(email)email.textContent=currentUser.email;
  if(avatar){if(currentUser.picture){avatar.innerHTML='<img alt="" referrerpolicy="no-referrer" src="'+escHtml(currentUser.picture)+'">'}else{avatar.textContent=displayName.charAt(0).toUpperCase()}}
}
function finishLogin(profile){
  currentUser={email:profile.email||'',name:profile.name||'Usuario',picture:profile.picture||''};
  if(!currentUser.email){toast('No se pudo identificar tu cuenta');return false}
  lsSet('reset12_user',JSON.stringify(currentUser));
  loadUserData(currentUser.email);
  document.getElementById('loginOverlay').style.display='none';
  showAccount();render();bootCalendar();updateSyncPill();
  return true;
}
async function initGoogleLogin(){
  const host=document.getElementById('googleSignInButton');if(!host)return;
  host.innerHTML='<button type="button" class="btn" style="width:100%;background:#fff;color:#222;border-radius:999px" id="supabaseGoogleLogin">🌐 Acceder con Google</button>';
  document.getElementById('supabaseGoogleLogin').onclick=async()=>{
    try{const {error}=await supabaseClient.auth.signInWithOAuth({provider:'google',options:{redirectTo:location.origin+location.pathname,queryParams:{access_type:'offline',prompt:'select_account'}}});if(error)throw error;}
    catch(e){console.error(e);toast('No se pudo iniciar sesión: '+(e.message||'error'));}
  };
}
async function handleSupabaseSession(session){
  if(!session?.user){
    supabaseUser=null;currentUser=null;loadedForUserId=null;
    document.getElementById('loginOverlay').style.display='flex';await initGoogleLogin();updateSyncPill();return;
  }
  supabaseUser=session.user;
  if(loadedForUserId===session.user.id){flushQueue();return}   // p. ej. renovación del token
  loadedForUserId=session.user.id;
  const meta=session.user.user_metadata||{};
  if(!finishLogin({email:session.user.email||'',name:meta.full_name||meta.name||session.user.email?.split('@')[0]||'Usuario',picture:meta.avatar_url||meta.picture||''}))return;
  setProfileStatus('⏳ Cargando tus datos de la nube…');
  try{
    const r=await pullFromCloud();
    setProfileStatus(!habitsCloud||!measurementsCloud?'⚠️ Falta ejecutar el SQL de la Fase 1':'☁️ Datos sincronizados');
    if(r?.pushedSessions)toast(r.pushedSessions===1?'Se subió 1 sesión de gym que estaba solo en este teléfono':'Se subieron '+r.pushedSessions+' sesiones de gym que estaban solo en este teléfono');
  }catch(e){console.error('RENOVA carga nube:',e);setProfileStatus('⚠️ Sin acceso a la nube; usando datos de este dispositivo')}
}
function showAccountInfo(){
  if(!currentUser)return;
  alert(['RENOVA','','Cuenta: '+currentUser.email,'Nombre: '+(currentUser.name||'Usuario'),'','Estado: '+(document.getElementById('syncPill')?.textContent||''),'Cambios pendientes de subir: '+syncQueue.length].join('\n'));
}
async function logoutRenova(){
  const n=syncQueue.length;
  if(!confirm('¿Cerrar sesión de RENOVA en este dispositivo?'+(n?'\n\n⚠️ Hay '+n+' cambios sin subir; se subirán cuando vuelvas a entrar.':'')))return;
  calendarToken=null;sessionStorage.removeItem('reset12_calendar_token');
  try{await supabaseClient.auth.signOut()}catch(e){console.error(e)}
  lsDel('reset12_user');currentUser=null;supabaseUser=null;loadedForUserId=null;
  document.getElementById('profileCard').style.display='none';document.getElementById('accountChip').style.display='none';document.getElementById('loginOverlay').style.display='flex';initGoogleLogin();updateSyncPill();
}
async function boot(){
  document.getElementById('loginOverlay').style.display='flex';
  await initGoogleLogin();
  const {data:{session},error}=await supabaseClient.auth.getSession();
  if(error)console.error('Supabase session:',error);
  await handleSupabaseSession(session);
  supabaseClient.auth.onAuthStateChange((event,session)=>{if(['SIGNED_IN','TOKEN_REFRESHED','SIGNED_OUT'].includes(event))setTimeout(()=>handleSupabaseSession(session),0)});
}
window.addEventListener('load',()=>{
  if('serviceWorker' in navigator)navigator.serviceWorker.register('./sw.js').catch(e=>console.warn('SW',e));
  boot();
});
