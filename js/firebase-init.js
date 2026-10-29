import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getFirestore,doc,getDoc,setDoc,updateDoc,onSnapshot,collection,query,where,getDocs} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {getAuth,signInAnonymously,signInWithEmailAndPassword,onAuthStateChanged,signOut} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';

const app=initializeApp(window.FIREBASE_CONFIG);
const fs=getFirestore(app);
const auth=getAuth(app);

const wrapDoc=s=>({id:s.id,exists:s.exists(),data:()=>s.data()});
const wrapQ=s=>({docs:s.docs.map(wrapDoc),size:s.size,empty:s.empty});
const err=e=>({code:e&&e.code||'unavailable',message:e&&e.message||''});
function mkDoc(path){const r=doc(fs,path);return{
  get:async()=>wrapDoc(await getDoc(r)),set:d=>setDoc(r,d),update:d=>updateDoc(r,d),
  onSnapshot:(n,e)=>onSnapshot(r,s=>n(wrapDoc(s)),x=>e&&e(err(x)))};}
function mkQuery(q){return{
  where:(f,op,v)=>mkQuery(query(q,where(f,op,v))),
  get:async()=>wrapQ(await getDocs(q)),
  onSnapshot:(n,e)=>onSnapshot(q,s=>n(wrapQ(s)),x=>e&&e(err(x)))};}
const db={doc:mkDoc,collection:p=>mkQuery(collection(fs,p))};

window.SITE={db,auth:{
  onChange:cb=>onAuthStateChanged(auth,u=>cb(u&&!u.isAnonymous?u.email:null)),
  loginTeacher:(e,p)=>signInWithEmailAndPassword(auth,e,p),
  loginStudent:()=>auth.currentUser?Promise.resolve():signInAnonymously(auth),
  logout:()=>signOut(auth)}};
window.dispatchEvent(new Event('site-ready'));
