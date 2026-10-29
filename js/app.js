const $=s=>document.querySelector(s);
const esc=s=>String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const BY={};ITEMS.forEach(i=>BY[i.id]=i);
const SEC_ORDER=['V','S','P','R','W'];
const AR_RE=/[\u0600-\u06FF]/;
const LAT_RE=/[A-Za-z]/;
const arSpan=t=>{if(!AR_RE.test(t))return esc(t);if(!LAT_RE.test(t))return `<span class="ar" dir="rtl" lang="ar">${esc(t)}</span>`;
  return esc(t).replace(/([\u0600-\u06FF][\u0600-\u06FF\u064B-\u0652\s]*[\u0600-\u06FF\u064B-\u0652]|[\u0600-\u06FF])/g,'<bdi class="arin" lang="ar">$1</bdi>');};
const norm=s=>String(s||'').replace(/[\u064B-\u065F\u0670\u0640]/g,'').replace(/[.,،؟?!؛:]/g,' ').replace(/\s+/g,' ').trim();
function shuffle(a){a=a.slice();for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
const isGraded=it=>it.type==='teacher'||it.type==='draw';
const SCALES={a:[['right','صح'],['partial','جزئي'],['wrong','خطأ']],q:[['right','جيد'],['partial','متوسط'],['wrong','ضعيف']]};
const KNOW={sure:'أعرفها طبعًا',maybe:'أعرفها ربما',never:'لم أرها أبدًا'};
// الفئات التي يراها المعلم
const CATS={mastered:'متقن',review:'يحتاج تثبيتًا',unknown:'مجهول'};
const CAT_CLASS={mastered:'m',review:'s',unknown:'u',ungraded:'p'};
function correctOf(a){if(a.teacherMark)return a.teacherMark==='right'?true:a.teacherMark==='partial'?'partial':false;return a.correct;}
function category(a){
  if(!a||a.skipped)return null;
  if(a.know==='never')return 'unknown';
  const c=correctOf(a);
  if(c===null||c===undefined)return 'ungraded';
  if(c===true&&a.know==='sure')return 'mastered';
  return 'review'; // صح مع ربما، أو جزئي، أو خطأ مع أعرفها
}
function expectedOf(it){if(it.type==='teacher')return it.passage?PASSAGE:(it.ar||'');return it.ans||'';}
function respText(it,a){if(!a||a.skipped||a.know==='never')return '—';if(it.type==='teacher')return 'أداء أمام المعلم';if(it.type==='draw')return a.response&&a.response.startsWith('data:image')?'':'كتبها في الكراسة';return a.response||'';}
const markLabel=(it,m)=>{const s=SCALES[it.scale||'a'].find(x=>x[0]===m);return s?s[1]:'';};

// ---------- الصوت
let arVoice=null;
function loadVoices(){try{const v=speechSynthesis.getVoices().filter(x=>/^ar/i.test(x.lang));arVoice=v.find(x=>/natural|online|neural/i.test(x.name))||v.find(x=>/maged|majed|tarik|laila|hamed|zariyah|salma|shakir|hoda|naayf/i.test(x.name))||v[0]||null;}catch(e){arVoice=null;}}
if('speechSynthesis' in window){loadVoices();try{speechSynthesis.onvoiceschanged=loadVoices;}catch(e){}}
function speak(t){if(!('speechSynthesis' in window))return false;loadVoices();if(!arVoice)return false;const u=new SpeechSynthesisUtterance(t);u.voice=arVoice;u.lang=arVoice.lang;u.rate=.75;speechSynthesis.cancel();speechSynthesis.speak(u);return true;}
const lsGet=k=>{try{return localStorage.getItem(k)}catch(e){return null}};
const lsSet=(k,v)=>{try{v==null?localStorage.removeItem(k):localStorage.setItem(k,v)}catch(e){}};

// ---------- الحالة
const S={open:{V:true},db:null,user:null,downloads:null,role:null,tab:'setup',
 secMode:{V:'req',S:'req',P:'req',R:'req',W:'req'},picked:new Set(ITEMS.filter(i=>i.rec).map(i=>i.id)),
 student:'',homework:false,students:[],openSessions:[],watchSid:null,session:null,answers:{},subs:[],
 resStudent:'',resAnswers:null,filter:'review',run:null,lastLocal:null,notice:'',voiceMsg:'',myName:lsGet('u2-name'),waitSub:null};

async function boot(){
  render();
  const SITE=window.SITE;
  if(!SITE){S.role='teacher';S.offline=true;render();return;}
  S.db=SITE.db;
  if(window.APP_ROLE==='teacher'){
    SITE.auth.onChange(async email=>{
      if(email&&email.toLowerCase()===String(window.TEACHER_EMAIL||'').toLowerCase()){S.role='teacher';if(!S.watching){S.watching=true;teacherWatch();loadMedia();}}
      else{S.role='login';}
      render();
    });
  }else{
    try{await SITE.auth.loginStudent();}catch(e){S.notice='Couldn’t connect. Check your internet and reload.';}
    S.role='student';loadMedia();studentWatch();render();
  }
}
// ---------- التسجيلات الصوتية
S.media={};
async function loadMedia(){try{const q=await S.db.collection('media').get();q.docs.forEach(d=>{S.media[d.id]=d.data().data;});render();}catch(e){}}
function playItem(it){const rec=S.media['aud_'+it.id];if(rec){try{const au=new Audio(rec);au.play();return true;}catch(e){}}return speak(it.say);}
let mediaRec=null;
async function startRec(id){
  try{const stream=await navigator.mediaDevices.getUserMedia({audio:true});
    const type=['audio/mp4','audio/webm;codecs=opus','audio/webm'].find(t=>window.MediaRecorder&&MediaRecorder.isTypeSupported(t))||'';
    const mr=new MediaRecorder(stream,type?{mimeType:type,audioBitsPerSecond:48000}:undefined);const chunks=[];
    mr.ondataavailable=e=>chunks.push(e.data);
    mr.onstop=async()=>{stream.getTracks().forEach(t=>t.stop());const blob=new Blob(chunks,{type:mr.mimeType||type});
      const url=await new Promise(r=>{const fr=new FileReader();fr.onload=()=>r(fr.result);fr.readAsDataURL(blob);});
      if(url.length>900000){S.notice='التسجيل طويل جدًا. سجّل الكلمة بس.';mediaRec=null;render();return;}
      try{await S.db.doc('media/aud_'+id).set({data:url,at:Date.now()});S.media['aud_'+id]=url;}catch(e){S.notice='تعذر حفظ التسجيل.';}
      mediaRec=null;render();};
    mr.start();mediaRec={id,mr};render();
  }catch(e){S.notice='المتصفح ما سمحش باستخدام الميكروفون. اسمح له من علامة القفل جنب الرابط.';render();}
}
function stopRec(){if(mediaRec)mediaRec.mr.stop();}
function loginView(){return `<div class="center"><div class="ar title" dir="rtl">لوحة المعلم</div><p class="muted">ادخل بحساب المعلم.</p>
<form class="login" onsubmit="return false"><input id="lem" type="email" placeholder="البريد" autocomplete="username" dir="ltr"><input id="lpw" type="password" placeholder="كلمة المرور" autocomplete="current-password" dir="ltr"><button class="btn" data-act="login">دخول</button></form>${S.notice?`<p class="warn">${esc(S.notice)}</p>`:''}</div>`;}
// ---------- المعلم
function clearSubs(){S.subs.forEach(u=>{try{u()}catch(e){}});S.subs=[];}
function teacherWatch(){
  S.db.collection('sessions').where('status','==','open').onSnapshot(q=>{
    S.openSessions=q.docs.map(d=>Object.assign({sid:d.id},d.data())).sort((a,b)=>b.createdAt-a.createdAt);
    if(!S.openSessions.find(x=>x.sid===S.watchSid))watchSession(S.openSessions[0]?S.openSessions[0].sid:null);
    render();
  },e=>{S.notice='تعذر الاتصال بقاعدة البيانات.';render();});
  loadStudents();
}
function watchSession(sid){
  if(sid===S.watchSid)return;clearSubs();S.watchSid=sid;S.session=null;S.answers={};
  if(!sid)return;
  S.subs.push(S.db.doc('sessions/'+sid).onSnapshot(s=>{S.session=s.exists?s.data():null;render();}));
  S.subs.push(S.db.collection('sessions/'+sid+'/answers').onSnapshot(q=>{const o={};q.docs.forEach(d=>o[d.id]=d.data());S.answers=o;render();}));
}
async function loadStudents(){try{const q=await S.db.collection('sessions').get();S.students=[...new Set(q.docs.map(d=>d.data().student).filter(Boolean))];render();}catch(e){}}
function chosenItems(){return ITEMS.filter(i=>S.secMode[i.sec]!=='off'&&S.picked.has(i.id)).map(i=>i.id);}
async function startSession(){
  const name=(S.student||'').trim();if(!name){S.notice='اكتب اسم الطالب أولًا.';render();return;}
  const items=chosenItems();if(!items.length){S.notice='لم تختر أي بند.';render();return;}
  const sid='s'+Date.now().toString(36);const modes={};SEC_ORDER.forEach(k=>modes[k]=S.secMode[k]);
  try{
    for(const o of S.openSessions.filter(x=>x.student===name)){await S.db.doc('sessions/'+o.sid).update({status:'closed'});}
    await S.db.doc('sessions/'+sid).set({student:name,items,secModes:modes,homework:S.homework,createdAt:Date.now(),status:'open'});
    if(!S.students.includes(name))S.students.push(name);
    clearSubs();S.watchSid=null;watchSession(sid);S.tab='live';S.notice='';render();
  }catch(e){S.notice='لم تبدأ الجلسة. تأكد من الاتصال وحاول مرة أخرى.';render();}
}
async function endSession(sid){try{await S.db.doc('sessions/'+sid).update({status:'closed'});}catch(e){S.notice='تعذر إنهاء الجلسة.';render();}}
async function markAnswer(id,mark,src){
  if(src==='local'){const a=S.lastLocal&&S.lastLocal.answers[id];if(a){a.teacherMark=mark;render();}return;}
  let sid,a;
  if(src==='live'){sid=S.watchSid;a=S.answers[id];}else{a=S.resAnswers&&S.resAnswers[id];sid=a&&a.sid;}
  if(!sid||!a)return;
  try{await S.db.doc(`sessions/${sid}/answers/${id}`).update({teacherMark:mark});
    if(src==='res'){S.resAnswers[id]=Object.assign({},a,{teacherMark:mark});render();}}catch(e){S.notice='تعذر حفظ التقييم.';render();}
}
async function loadResults(name){
  S.resStudent=name;S.resAnswers=null;render();
  try{const q=await S.db.collection('sessions').where('student','==',name).get();const merged={};
    for(const d of q.docs){const a=await S.db.collection('sessions/'+d.id+'/answers').get();a.docs.forEach(x=>{const v=Object.assign({sid:d.id},x.data());if(!merged[x.id]||(merged[x.id].ts||0)<(v.ts||0))merged[x.id]=v;});}
    S.resAnswers=merged;render();}catch(e){S.notice='تعذر تحميل النتائج.';render();}
}

// ---------- الطالب
function studentWatch(){
  S.db.collection('sessions').where('status','==','open').onSnapshot(q=>{
    S.openSessions=q.docs.map(d=>Object.assign({sid:d.id},d.data())).sort((a,b)=>b.createdAt-a.createdAt);
    const r=S.run;
    if(r&&!r.done&&!S.openSessions.find(x=>x.sid===r.sid)){S.run=null;S.notice='Your teacher closed this test.';}
    if(S.myName){const mine=S.openSessions.find(x=>x.student===S.myName);if(mine&&(!S.run||(S.run.done&&S.run.sid!==mine.sid)))loadRun(mine);}
    render();
  },e=>{S.notice='Connection lost. Reload the page.';render();});
}
async function loadRun(sess){
  try{const prev=await S.db.collection('sessions/'+sess.sid+'/answers').get();const answers={};prev.docs.forEach(x=>answers[x.id]=x.data());
    S.run=newRun(sess.items,sess.secModes,false,sess.sid,sess.student,answers,!!sess.homework);S.notice='';render();}
  catch(e){S.notice='Couldn’t load the test. Ask your teacher to restart it.';render();}
}
function newRun(items,modes,local,sid,student,answers,homework){
  const ord=SEC_ORDER.flatMap(k=>items.filter(id=>BY[id]&&BY[id].sec===k));
  const r={items:ord,modes,local,sid,student,answers:answers||{},idx:0,ui:{},done:false,homework};
  r.idx=ord.findIndex(id=>!r.answers[id]);if(r.idx<0){r.idx=ord.length;r.done=true;}
  prep(r);return r;
}
function prep(r){const id=r.items[r.idx];if(!id)return;const it=BY[id];
  let pool=null;if(it.tokens){do{pool=shuffle(it.tokens.map((t,i)=>({t,i})));}while(pool.map(p=>p.t).join(' ')===it.ans&&it.tokens.length>1);}
  r.ui={resp:null,opts:it.opts?shuffle(it.opts):null,pool,built:[],strokes:[],notebook:false,grade:null,noVoice:false};}
function snapshotPad(){const c=$('#pad');if(!c||!S.run.ui.strokes.length)return null;try{return c.toDataURL('image/jpeg',0.6);}catch(e){return null;}}
async function commit(know){
  const r=S.run;const id=r.items[r.idx];const it=BY[id];const u=r.ui;
  let response=null,correct=null;
  if(know!=='never'){
    if(it.type==='mcq'){response=u.resp;correct=u.resp===it.ans;}
    else if(it.type==='order'){response=u.built.map(b=>b.t).join(' ');correct=response===it.ans;}
    else if(it.type==='draw'){response=snapshotPad()||'notebook';}
  }
  const rec={itemId:id,response,correct,know,ts:Date.now()};
  if(r.local&&isGraded(it)&&u.grade&&know!=='never')rec.teacherMark=u.grade;
  if(!r.local){try{await S.db.doc(`sessions/${r.sid}/answers/${id}`).set(rec);}catch(e){S.notice='Your answer wasn’t saved. Tell your teacher.';render();return;}}
  r.answers[id]=rec;
  if(!r.local&&!r.homework&&isGraded(it)&&know!=='never'){waitForTeacher(id);return;}
  advance();
}
function waitForTeacher(id){
  const r=S.run;r.waiting=id;render();
  S.waitSub=S.db.doc(`sessions/${r.sid}/answers/${id}`).onSnapshot(s=>{const d=s.exists?s.data():null;
    if(d&&d.teacherMark&&S.run&&S.run.waiting===id){try{S.waitSub()}catch(e){}S.waitSub=null;S.run.waiting=null;S.run.answers[id]=d;advance();}});
}
async function skipSection(){
  const r=S.run;const sec=BY[r.items[r.idx]].sec;
  while(r.idx<r.items.length&&BY[r.items[r.idx]].sec===sec){const id=r.items[r.idx];const rec={itemId:id,skipped:true,ts:Date.now()};
    if(!r.local){try{await S.db.doc(`sessions/${r.sid}/answers/${id}`).set(rec);}catch(e){}}r.answers[id]=rec;r.idx++;}
  r.idx--;advance();
}
async function advance(){const r=S.run;r.idx++;if(r.idx>=r.items.length){r.done=true;if(!r.local){try{await S.db.doc('sessions/'+r.sid).update({finishedAt:Date.now()});}catch(e){}}}else prep(r);render();window.scrollTo(0,0);}

// ---------- لوحة الكتابة
function initPad(){
  const c=$('#pad');if(!c)return;const u=S.run.ui;const ctx=c.getContext('2d');
  const W=c.width,H=c.height;
  const paint=()=>{ctx.fillStyle='#ffffff';ctx.fillRect(0,0,W,H);ctx.strokeStyle='#d6dfd9';ctx.lineWidth=1;for(let y=H/3;y<H;y+=H/3){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(W,y);ctx.stroke();}
    ctx.strokeStyle='#14332F';ctx.lineWidth=5;ctx.lineCap='round';ctx.lineJoin='round';
    u.strokes.forEach(st=>{ctx.beginPath();st.forEach((p,i)=>i?ctx.lineTo(p[0],p[1]):ctx.moveTo(p[0],p[1]));if(st.length===1)ctx.lineTo(st[0][0]+.1,st[0][1]);ctx.stroke();});};
  paint();
  let cur=null;
  const pos=e=>{const b=c.getBoundingClientRect();return [(e.clientX-b.left)*W/b.width,(e.clientY-b.top)*H/b.height];};
  c.onpointerdown=e=>{c.setPointerCapture(e.pointerId);cur=[pos(e)];u.strokes.push(cur);paint();};
  c.onpointermove=e=>{if(!cur)return;cur.push(pos(e));paint();};
  c.onpointerup=c.onpointercancel=()=>{if(!cur)return;cur=null;if(u.strokes.length===1)render();};
}

// ---------- العرض
function render(){
  const app=$('#app');
  if(!S.role){app.innerHTML=`<div class="center"><div class="ar big" dir="rtl">الوَحْدَةُ الثّانِيَةُ: الأُسْرَةُ</div><p class="muted">Loading…</p></div>`;return;}
  if(S.run&&(S.role==='student'||S.run.local)){document.documentElement.dir='ltr';app.innerHTML=S.run.waiting?waitTeacherView():runnerView();initPad();return;}
  if(S.role==='student'){document.documentElement.dir='ltr';app.innerHTML=pickerView();return;}
  if(S.role==='login'){document.documentElement.dir='rtl';app.innerHTML=loginView();return;}
  document.documentElement.dir='rtl';app.innerHTML=teacherView();
}
function pickerView(){
  const names=[...new Set(S.openSessions.map(x=>x.student))];
  const warn=S.notice?`<p class="warn">${esc(S.notice)}</p>`:'';
  if(S.myName&&!names.includes(S.myName))return `<div class="center student"><div class="ar huge" dir="rtl">الأُسْرَةُ</div><h1>Hi, ${esc(S.myName)}</h1><p class="muted">No test is open for you right now. Keep this page open. It starts by itself when your teacher opens one.</p>${warn}<button class="link" data-act="notme">Not ${esc(S.myName)}?</button></div>`;
  if(!names.length)return `<div class="center student"><div class="ar huge" dir="rtl">الأُسْرَةُ</div><h1>Unit 2: Family</h1><p class="muted">Waiting for your teacher to open the test. Keep this page open.</p>${warn}</div>`;
  return `<div class="center student"><div class="ar huge" dir="rtl">الأُسْرَةُ</div><h1>Who are you?</h1><div class="names">${names.map(n=>`<button class="btn" data-act="iam" data-n="${esc(n)}">${esc(n)}</button>`).join('')}</div>${warn}</div>`;
}
function waitTeacherView(){return `<div class="center student"><div class="ar huge" dir="rtl">لَحْظَة</div><h1>Your teacher is checking this one</h1><p class="muted">The next question opens by itself.</p></div>`;}
function runnerView(){
  const r=S.run;
  if(r.done){const n=Object.keys(r.answers).length;
    return `<div class="center student"><div class="ar huge" dir="rtl">أَحْسَنْتَ</div><h1>Mission complete</h1><p class="muted">You went through ${n} questions. Your teacher has your answers.</p>${r.local?`<button class="btn" data-act="exitLocal">عرض النتائج</button>`:''}</div>`;}
  const id=r.items[r.idx],it=BY[id],u=r.ui,sec=it.sec;
  const secItems=r.items.filter(x=>BY[x].sec===sec);const pos=secItems.indexOf(id)+1;
  const pct=Math.round(r.idx/r.items.length*100);
  let answered=it.type==='mcq'?u.resp!=null:it.type==='order'?u.built.length===it.tokens.length:it.type==='draw'?(r.local||u.strokes.length>0||u.notebook):true;
  if(r.local&&isGraded(it))answered=answered&&!!u.grade;
  let body='';
  if(it.passage)body+=`<div class="passage" dir="rtl" lang="ar">${esc(PASSAGE)}</div>`;
  if(it.img)body+=`<div class="picwrap" data-emoji="${esc(it.emoji)}"><img class="pic" src="images/${it.id}.png" alt="" onerror="this.parentNode.classList.add('noimg')"></div>`;
  else if(it.emoji)body+=`<div class="emoji" aria-hidden="true">${esc(it.emoji)}</div>`;
  if(it.ar)body+=`<div class="prompt ar" dir="rtl" lang="ar">${esc(it.ar)}</div>`;
  if(it.say)body+=`<div class="listen"><button class="btn play" data-act="play">🔊 Play</button>${u.noVoice?`<p class="warn">No Arabic voice on this device. Your teacher will say the word.</p>`:''}</div>`;
  if(it.type==='mcq')body+=`<div class="opts ${it.opts.length===2?'two':''}">${u.opts.map((o,i)=>`<button class="opt ${u.resp===o?'on':''}" data-act="pick" data-i="${i}">${arSpan(o)}</button>`).join('')}</div>`;
  if(it.type==='order')body+=`<div class="built" dir="rtl">${u.built.length?u.built.map((b,i)=>`<button class="tok on" data-act="unbuild" data-i="${i}" lang="ar">${esc(b.t)}</button>`).join(''):'<span class="muted ltr">Tap the words below</span>'}</div><div class="pool" dir="rtl">${u.pool.filter(p=>!u.built.includes(p)).map(p=>`<button class="tok" data-act="build" data-k="${p.i}" lang="ar">${esc(p.t)}</button>`).join('')}</div>`;
  if(it.type==='draw')body+=r.local?`<p class="muted">Write it in your notebook and show it to your teacher.</p>`:`<canvas id="pad" width="900" height="300" aria-label="Writing pad"></canvas><div class="padbar"><button class="link" data-act="clearpad">Clear</button><label><input type="checkbox" data-act="notebook" ${u.notebook?'checked':''}> I wrote it in my notebook</label></div>`;
  if(it.type==='teacher'&&!r.local)body+=`<p class="muted">Do it now with your teacher, then choose a button below.</p>`;
  if(r.local&&isGraded(it))body+=`<div class="tgrade" dir="rtl"><span>تقييم المعلم${it.type==='draw'?` (المطلوب: <b lang="ar">${esc(it.ans)}</b>)`:''}:</span>${gradeBtns(it,u.grade,'lgrade')}</div>`;
  const optional=r.modes&&r.modes[sec]==='opt';
  return `<div class="runner student">
  <header class="rhead"><div class="sec"><span class="secname">${esc(SECS[sec].en)}</span><span class="muted"> ${pos} of ${secItems.length}</span><span class="code">${id}</span></div>
  <div class="bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><i style="width:${pct}%"></i></div></header>
  <main class="card"><p class="q">${arSpan(it.q)}</p>${body}</main>
  <footer class="know">
   <button class="kbtn never" data-act="know" data-k="never"><b>Never seen it</b><span class="ar" lang="ar">لم أرها أبدًا</span></button>
   <button class="kbtn maybe" data-act="know" data-k="maybe" ${answered?'':'disabled'}><b>I know it, maybe</b><span class="ar" lang="ar">أعرفها ربما</span></button>
   <button class="kbtn sure" data-act="know" data-k="sure" ${answered?'':'disabled'}><b>I know it, for sure</b><span class="ar" lang="ar">أعرفها طبعًا</span></button>
  </footer>
  ${optional?`<button class="link skip" data-act="skipsec">Skip this part</button>`:''}
  ${S.notice?`<p class="warn">${esc(S.notice)}</p>`:''}
  ${r.local?`<button class="link exit" data-act="exitLocal">إيقاف التجربة وعرض النتائج</button>`:''}
  </div>`;
}
function gradeBtns(it,cur,act,id,src){return SCALES[it.scale||'a'].map(([k,l])=>`<button class="g g-${k} ${cur===k?'on':''}" data-act="${act}" data-k="${k}" ${id?`data-id="${id}" data-src="${src}"`:''}>${l}</button>`).join('');}

function teacherView(){
  const tabs=[['setup','إعداد الاختبار'],['live','المتابعة المباشرة'],['results','النتائج']];
  return `<div class="teacher">
  <header class="thead"><div><div class="ar title">الوَحْدَةُ الثّانِيَةُ: الأُسْرَةُ</div><p class="muted">الاختبار القبلي التشخيصي، لوحة المعلم ${window.SITE?'<button class="link" data-act="logout">خروج</button>':''}</p></div>
  <nav class="tabs">${tabs.map(([k,l])=>`<button class="${S.tab===k?'on':''}" data-act="tab" data-k="${k}">${l}${k==='live'&&S.openSessions.length?' <i class="dot"></i>':''}</button>`).join('')}</nav></header>
  ${S.offline?`<p class="banner">الموقع مش متصل بقاعدة البيانات. راجع ملف الإعداد، أو شغّل الاختبار على شاشتك وشاركها.</p>`:''}
  ${S.notice?`<p class="warn">${esc(S.notice)}</p>`:''}
  ${S.tab==='setup'?setupView():S.tab==='live'?liveView():resultsView()}
  </div>`;
}
function setupView(){
  const ids=chosenItems();
  const sheet=ids.map(id=>BY[id]).filter(i=>i.say);
  return `<section class="setup">
  <div class="startbar">
   <label>اسم الطالب<input id="stname" list="stlist" value="${esc(S.student)}" placeholder="مثلًا: يوسف"><datalist id="stlist">${S.students.map(s=>`<option value="${esc(s)}">`).join('')}</datalist></label>
   <div class="count"><b>${ids.length}</b> بندًا مختارًا</div>
   ${S.offline?'':`<button class="btn" data-act="start">افتح الاختبار للطالب</button>`}
   <button class="btn ghost" data-act="local">${S.offline?'ابدأ على شاشتي':'شغّله على شاشتي'}</button>
  </div>
  <div class="voice"><button class="btn ghost small" data-act="voicetest">🔊 اختبار الصوت على هذا الجهاز</button>${S.voiceMsg?`<span>${S.voiceMsg}</span>`:''}</div>
  <p class="hint">لكل قسم اختر: إلزامي، أو يمكن تخطيه (يظهر للطالب زر لتخطي الجزء)، أو مستبعد. البنود المعلّمة «مقترح» مختارة تلقائيًا. ولو قسمت الاختبار على أكثر من جلسة، النتائج بتتجمع للطالب نفسه في تبويب النتائج.</p>
  ${sheet.length?`<details class="secbox sheet" data-s="sheet" ${S.open.sheet!==false?'open':''}><summary><span class="sname">كلمات الاستماع والإملاء: سجّلها بصوتك</span><span class="muted">${sheet.length} كلمة</span></summary><p class="hint pad">سجّل كل كلمة بصوتك مرة واحدة، والطالب هيسمع تسجيلك بدل صوت الجهاز. ولو ما سجلتش، الطالب بيسمع صوت جهازه العربي، ولو مش موجود انطق الكلمة إنت لما يظهر رقم البند في أعلى شاشته.</p><ul class="items">${sheet.map(i=>{const has=!!S.media['aud_'+i.id];const recNow=mediaRec&&mediaRec.id===i.id;return `<li class="recrow"><span class="tag">${i.id}</span><b class="prev big2" lang="ar">${esc(i.say)}</b><span class="recbtns">${recNow?`<button class="btn small rec on" data-act="recstop">⏹ إيقاف</button>`:`<button class="btn ghost small" data-act="rec" data-id="${i.id}">🎙 ${has?'أعد التسجيل':'سجّل'}</button>`}${has?`<button class="btn ghost small" data-act="recplay" data-id="${i.id}">▶ اسمع</button><span class="ok">متسجل</span>`:''}</span></li>`;}).join('')}</ul></details>`:''}
  ${SEC_ORDER.map(k=>{const its=ITEMS.filter(i=>i.sec===k);const n=its.filter(i=>S.picked.has(i.id)).length;const m=S.secMode[k];
   return `<details class="secbox ${m==='off'?'off':''}" data-s="${k}" ${S.open[k]?'open':''}><summary><span class="sname">${SECS[k].ar}</span><span class="muted">${n} من ${its.length}</span>
   <span class="modes">${[['req','إلزامي'],['opt','يمكن تخطيه'],['off','مستبعد']].map(([v,l])=>`<button class="${m===v?'on':''}" data-act="mode" data-s="${k}" data-k="${v}">${l}</button>`).join('')}</span></summary>
   <div class="secact"><button class="link" data-act="pickall" data-s="${k}">اختر الكل</button><button class="link" data-act="pickrec" data-s="${k}">المقترح فقط</button><button class="link" data-act="picknone" data-s="${k}">إلغاء الكل</button></div>
   <ul class="items">${its.map(i=>`<li><label><input type="checkbox" data-act="toggle" data-id="${i.id}" ${S.picked.has(i.id)?'checked':''}><span class="tag">${esc(i.tag)}</span>${i.rec?'<span class="rec">مقترح</span>':''}${isGraded(i)?'<span class="tg">يقيّمه المعلم</span>':''}</label><div class="prev" lang="ar">${esc(previewOf(i))}</div></li>`).join('')}</ul></details>`;}).join('')}
  </section>`;
}
function previewOf(i){if(i.say)return 'يسمع: '+i.say+(i.type==='draw'?' ثم يكتب':'');if(i.ar)return i.ar;if(i.passage)return 'فقرة القراءة';if(i.tokens)return i.tokens.join(' / ');if(i.emoji)return i.emoji+'  ←  '+i.ans;return i.opts?i.opts.join(' / '):'';}
function liveView(){
  if(S.offline)return `<p class="empty">المتابعة المباشرة تحتاج قاعدة البيانات. في وضع الشاشة الواحدة تظهر النتائج في آخر الاختبار.</p>`;
  if(!S.openSessions.length)return `<p class="empty">لا يوجد اختبار مفتوح. افتح اختبارًا من تبويب «إعداد الاختبار»، وابعت للطالب رابط الصفحة الرئيسية للموقع.</p>`;
  const sess=S.session;
  const chooser=S.openSessions.length>1?`<div class="tabs inline">${S.openSessions.map(o=>`<button class="${o.sid===S.watchSid?'on':''}" data-act="watch" data-k="${o.sid}">${esc(o.student)}</button>`).join('')}</div>`:'';
  if(!sess)return chooser+`<p class="empty">جارٍ التحميل…</p>`;
  const ids=SEC_ORDER.flatMap(k=>sess.items.filter(id=>BY[id]&&BY[id].sec===k));
  const done=ids.filter(id=>S.answers[id]).length;
  const waitingIds=ids.filter(id=>{const a=S.answers[id];return a&&isGraded(BY[id])&&a.know!=='never'&&!a.skipped&&!a.teacherMark;});
  const status=sess.finishedAt?'أنهى الطالب الاختبار':done?'الطالب يحل الآن':'بانتظار دخول الطالب';
  const curId=ids.find(id=>!S.answers[id]);const cur=curId&&BY[curId];
  return `<section class="live">${chooser}<div class="livehead"><div><b>${esc(sess.student)}</b> <span class="muted">${status}${sess.homework?'، واجب منزلي':''}</span></div><div class="count"><b>${done}</b> من ${ids.length}</div><button class="btn ghost" data-act="end" data-k="${S.watchSid}">إغلاق الاختبار</button></div>
  ${waitingIds.length&&!sess.homework?`<p class="banner">الطالب منتظر تقييمك للبند <b>${waitingIds[0]}</b>. قيّمه من الجدول تحت.</p>`:''}
  ${cur&&cur.say&&!sess.finishedAt?`<p class="banner">البند الحالي ${cur.id}: لو الصوت مش شغال عنده، انطق له <b class="ar big2" lang="ar">${esc(cur.say)}</b></p>`:''}
  ${answerTable(ids,S.answers,'live',null)}</section>`;
}
function answerTable(ids,ans,src,filter){
  let cur='';
  const rows=ids.filter(id=>{const a=ans[id];if(a&&a.skipped)return false;if(!filter)return true;return category(a)===filter;});
  if(!rows.length)return `<p class="empty">لا توجد بنود هنا.</p>`;
  return `<div class="tw"><table class="atab"><thead><tr><th>البند</th><th>المطلوب أو الصحيح</th><th>إجابة الطالب</th><th>معرفته</th><th>الفئة</th><th>تقييم المعلم</th></tr></thead><tbody>${rows.map(id=>{const it=BY[id];const a=ans[id];const c=category(a);
   let head='';if(it.sec!==cur){cur=it.sec;head=`<tr class="sechead"><td colspan="6">${SECS[cur].ar}</td></tr>`;}
   const img=a&&it.type==='draw'&&a.response&&a.response.startsWith('data:image')?`<img class="hw" src="${a.response}" alt="كتابة الطالب">`:'';
   const exp=expectedOf(it);
   return head+`<tr class="${a?'':'wait'} ${c==='ungraded'?'needs':''}"><td><span class="tag">${esc(it.tag)}</span><div class="muted small">${it.id}${it.say?' • يسمع: <span lang="ar">'+esc(it.say)+'</span>':''}</div></td>
   <td dir="auto" class="cellar ${exp.length>60?'longtxt':''}">${esc(exp)}</td><td dir="auto" class="cellar">${a?(img||esc(respText(it,a))):'<span class="muted">لم يُجب بعد</span>'}</td>
   <td>${a&&a.know?KNOW[a.know]:''}</td><td>${c&&CATS[c]?`<span class="chip c-${CAT_CLASS[c]}">${CATS[c]}</span>`:c==='ungraded'?'<span class="chip c-p">ينتظر تقييمك</span>':''}</td>
   <td class="gcell">${a&&isGraded(it)&&a.know!=='never'?gradeBtns(it,a.teacherMark,'mark',id,src):''}</td></tr>`;}).join('')}</tbody></table></div>`;
}
function resultsView(){
  const local=S.lastLocal;
  if(S.offline){if(!local)return `<p class="empty">شغّل الاختبار على شاشتك أولًا، وستظهر النتائج هنا.</p>`;return resultBlock(local.items,local.answers,local.student||'تجربة','local');}
  const top=`<div class="startbar"><label>الطالب<select id="ressel"><option value="">اختر طالبًا</option>${S.students.map(s=>`<option ${S.resStudent===s?'selected':''}>${esc(s)}</option>`).join('')}</select></label><button class="btn ghost" data-act="reload">تحديث</button></div>`;
  let main='';
  if(S.resStudent)main=!S.resAnswers?`<p class="empty">جارٍ التحميل…</p>`:resultBlock(SEC_ORDER.flatMap(k=>ITEMS.filter(i=>i.sec===k&&S.resAnswers[i.id]).map(i=>i.id)),S.resAnswers,S.resStudent,'res');
  else if(!local)main=`<p class="empty">اختر طالبًا لعرض كل إجاباته في كل الجلسات مجمّعة.</p>`;
  return `<section class="results">${top}${main}${local?`<h3>آخر تشغيل على شاشتك${local.student?': '+esc(local.student):''}</h3>${resultBlock(local.items,local.answers,local.student||'تجربة','local')}`:''}</section>`;
}
function resultBlock(ids,ans,student,src){
  const count=k=>ids.filter(id=>category(ans[id])===k).length;
  const ung=count('ungraded');const f=S.filter;
  return `<div class="cats">${Object.keys(CATS).map(k=>`<button class="cat c-${CAT_CLASS[k]} ${f===k?'on':''}" data-act="filter" data-k="${k}"><span>${CATS[k]}</span><b>${count(k)}</b></button>`).join('')}
  ${ung?`<button class="cat c-p ${f==='ungraded'?'on':''}" data-act="filter" data-k="ungraded"><span>ينتظر تقييمك</span><b>${ung}</b></button>`:''}</div>
  ${CATS[f]?`<div class="exp"><button class="btn" data-act="copy" data-src="${src}" data-st="${esc(student)}">نسخ القائمة</button><button class="btn ghost" data-act="dl" data-src="${src}" data-st="${esc(student)}">تنزيل PDF</button><span class="muted small">انسخ القائمة وابعتها لي علشان أبني أنشطتها، أو نزّلها ملف جاهز للطباعة.</span></div>`:''}
  ${answerTable(ids,ans,src,f)}`;
}
function catItems(src){const ans=(src==='local'?S.lastLocal&&S.lastLocal.answers:S.resAnswers)||{};return SEC_ORDER.flatMap(k=>ITEMS.filter(i=>i.sec===k&&category(ans[i.id])===S.filter)).map(it=>({it,a:ans[it.id]}));}
const toAr=n=>String(n).replace(/\d/g,d=>'٠١٢٣٤٥٦٧٨٩'[d]);
const isLat=t=>/[A-Za-z]/.test(t)&&!AR_RE.test(t);
function partsOf(it,a){
  let main='',sub='';
  if(it.type==='teacher')main=it.passage?PASSAGE:(it.ar||'');
  else if(isLat(it.ans)){main=it.passage?PASSAGE:(it.ar||'');sub=it.ans;}
  else if(it.ar&&it.ar.includes('......'))main=it.ar.replace('......',it.ans);
  else main=it.ans;
  if(!main&&it.emoji)main=it.emoji;
  let wrong='';
  if(a&&a.know!=='never'&&(it.type==='mcq'||it.type==='order')&&a.correct===false&&a.response)wrong=a.response;
  return {label:`${it.grp}: ${it.pt}`,main,sub,wrong,q:it.passage&&isLat(it.ans)?it.q:''};
}
function exportText(student,src){
  const list=catItems(src);const L=[];let cur='',n=0;
  L.push('الوحدة الثانية: الأسرة','الطالب: '+student,`الفئة: ${CATS[S.filter]} (${list.length} بندًا)`,'');
  list.forEach(({it,a})=>{if(it.sec!==cur){cur=it.sec;n=0;L.push('','■ '+SECS[cur].ar);}
    const p=partsOf(it,a);n++;L.push('',`${toAr(n)}- ${p.label}`);
    if(p.main&&p.main!==PASSAGE)L.push('الصحيح: '+p.main);else if(p.main)L.push('فقرة القراءة');
    if(p.q)L.push(p.q);if(p.sub)L.push(p.sub);
    if(p.wrong){if(isLat(p.wrong)){L.push('إجابته:',p.wrong);}else L.push('إجابته: '+p.wrong);}
    if(a.teacherMark)L.push('تقييم المعلم: '+markLabel(it,a.teacherMark));});
  return L.join('\n');
}
async function buildPDF(student,src){
  const list=catItems(src);
  try{await document.fonts.load('40px "Noto Naskh Arabic"');await document.fonts.load('600 40px "Noto Naskh Arabic"');}catch(e){}
  const W=1240,H=1754,M=90,AR='"Noto Naskh Arabic","Geeza Pro","Traditional Arabic",serif',LA='"Readex Pro",Arial,sans-serif';
  const pages=[];let c,ctx,y;
  const newPage=()=>{c=document.createElement('canvas');c.width=W;c.height=H;ctx=c.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,W,H);pages.push(c);y=M;};
  const fontOf=(t,size,w)=>`${w||400} ${size}px ${isLat(t)?LA:AR}`;
  const wrap=(t,font,maxW)=>{ctx.font=font;const out=[];let cur='';for(const w of String(t).split(' ')){const s=cur?cur+' '+w:w;if(ctx.measureText(s).width>maxW&&cur){out.push(cur);cur=w;}else cur=s;}if(cur)out.push(cur);return out;};
  const blockH=(t,size,gap)=>wrap(t,fontOf(t,size),W-2*M).length*size*gap;
  const draw=(t,size,color,w,gap)=>{gap=gap||1.55;const f=fontOf(t,size,w);for(const l of wrap(t,f,W-2*M)){if(y+size*gap>H-M)newPage();ctx.font=f;ctx.fillStyle=color;ctx.textBaseline='top';ctx.direction=isLat(l)?'ltr':'rtl';ctx.textAlign='right';ctx.fillText(l,W-M,y);y+=size*gap;}};
  newPage();
  draw('الوحدة الثانية: الأسرة',46,'#14332F',700,1.6);
  draw('الفئة: '+CATS[S.filter],32,'#B9831A',600,1.6);
  draw(`الطالب: ${student}   •   ${new Date().toLocaleDateString('ar-EG')}   •   ${toAr(list.length)} بندًا`,24,'#5C706A',400,1.8);
  ctx.fillStyle='#14332F';ctx.fillRect(M,y,W-2*M,3);y+=30;
  let cur='',n=0;
  for(const {it,a} of list){
    const p=partsOf(it,a);
    if(it.sec!==cur){cur=it.sec;n=0;if(y+150>H-M)newPage();y+=10;draw(SECS[cur].ar,34,'#14332F',700,1.5);ctx.fillStyle='#C9D6CE';ctx.fillRect(M,y,W-2*M,2);y+=18;}
    n++;
    const mainSize=p.main===PASSAGE?26:36;
    let h=24*1.7+blockH(p.main,mainSize,1.7)+(p.q?24*1.7:0)+(p.sub?26*1.7:0)+(p.wrong?24*1.7*2:0)+(a.teacherMark?24*1.7:0)+22;
    if(y+h>H-M)newPage();
    draw(`${toAr(n)}- ${p.label}`,22,'#5C706A',400,1.5);
    if(p.main)draw(p.main,mainSize,'#14332F',600);
    if(p.q)draw(p.q,22,'#5C706A',400);
    if(p.sub)draw(p.sub,26,'#2E5E55',400);
    if(p.wrong){if(isLat(p.wrong)){draw('إجابته:',22,'#B0443C',400);draw(p.wrong,22,'#B0443C',400);}else draw('إجابته: '+p.wrong,24,'#B0443C',400);}
    if(a.teacherMark)draw('تقييم المعلم: '+markLabel(it,a.teacherMark),22,'#B9831A',400);
    y+=22;
  }
  pages.forEach((pc,i)=>{const x=pc.getContext('2d');x.font='20px '+LA;x.fillStyle='#9AA8A3';x.textAlign='center';x.direction='ltr';x.fillText(`${i+1} / ${pages.length}`,W/2,H-55);});
  const {jsPDF}=window.jspdf;const pdf=new jsPDF({unit:'pt',format:'a4',compress:true});
  pages.forEach((pc,i)=>{if(i)pdf.addPage();pdf.addImage(pc.toDataURL('image/jpeg',0.85),'JPEG',0,0,595.28,841.89);});
  return pdf.output('blob');
}
function showModal(title,text){
  let m=document.getElementById('modal');if(m)m.remove();
  m=document.createElement('div');m.id='modal';m.className='modal';m.dir='rtl';
  m.innerHTML=`<div class="mbox"><p>${esc(title)}</p><textarea readonly>${esc(text)}</textarea><button class="btn" data-close>اقفل</button></div>`;
  document.body.appendChild(m);const ta=m.querySelector('textarea');ta.focus();ta.select();
  m.addEventListener('click',ev=>{if(ev.target===m||ev.target.hasAttribute('data-close'))m.remove();});
}

// ---------- الأحداث
document.addEventListener('click',async e=>{
  const b=e.target.closest('[data-act]');if(!b)return;const act=b.dataset.act;
  if(act==='toggle'||act==='notebook')return;
  if(act==='mode')e.preventDefault();
  const r=S.run;if(act!=='know')S.notice='';
  switch(act){
   case 'tab':S.tab=b.dataset.k;if(S.tab==='results'&&!S.offline)loadStudents();break;
   case 'mode':S.secMode[b.dataset.s]=b.dataset.k;break;
   case 'pickall':ITEMS.filter(i=>i.sec===b.dataset.s).forEach(i=>S.picked.add(i.id));break;
   case 'pickrec':ITEMS.filter(i=>i.sec===b.dataset.s).forEach(i=>i.rec?S.picked.add(i.id):S.picked.delete(i.id));break;
   case 'picknone':ITEMS.filter(i=>i.sec===b.dataset.s).forEach(i=>S.picked.delete(i.id));break;
   case 'voicetest':{const ok=speak('مَرْحَبًا، هذا اخْتِبارُ الصَّوْتِ');S.voiceMsg=ok?`الصوت المستخدم: ${esc(arVoice.name)}. لو سمعت الجملة، الصوت شغال على الجهاز ده.`:'مفيش صوت عربي على الجهاز ده. جرّب متصفح إيدج، أو استخدم ورقة المعلم وانطق الكلمات بنفسك.';break;}
   case 'start':await startSession();return;
   case 'end':await endSession(b.dataset.k);return;
   case 'watch':watchSession(b.dataset.k);break;
   case 'local':{const items=chosenItems();if(!items.length){S.notice='لم تختر أي بند.';break;}const m={};SEC_ORDER.forEach(k=>m[k]=S.secMode[k]);S.run=newRun(items,m,true,null,S.student,{},false);break;}
   case 'exitLocal':S.lastLocal={items:S.run.items.filter(id=>S.run.answers[id]),answers:S.run.answers,student:S.run.student};S.run=null;S.tab='results';break;
   case 'iam':S.myName=b.dataset.n;lsSet('u2-name',S.myName);{const mine=S.openSessions.find(x=>x.student===S.myName);if(mine){await loadRun(mine);return;}}break;
   case 'notme':S.myName=null;lsSet('u2-name',null);break;
   case 'pick':r.ui.resp=r.ui.opts[+b.dataset.i];break;
   case 'build':{const p=r.ui.pool.find(x=>x.i===+b.dataset.k);if(p)r.ui.built.push(p);break;}
   case 'unbuild':r.ui.built.splice(+b.dataset.i,1);break;
   case 'play':r.ui.noVoice=!playItem(BY[r.items[r.idx]]);break;
   case 'clearpad':r.ui.strokes=[];break;
   case 'lgrade':r.ui.grade=b.dataset.k;break;
   case 'know':await commit(b.dataset.k);return;
   case 'skipsec':await skipSection();return;
   case 'mark':await markAnswer(b.dataset.id,b.dataset.k,b.dataset.src);return;
   case 'login':{S.notice='';try{await window.SITE.auth.loginTeacher($('#lem').value.trim(),$('#lpw').value);}catch(err){S.notice='البريد أو كلمة المرور غلط.';render();}return;}
   case 'logout':await window.SITE.auth.logout();return;
   case 'rec':await startRec(b.dataset.id);return;
   case 'recstop':stopRec();return;
   case 'recplay':{const u=S.media['aud_'+b.dataset.id];if(u)new Audio(u).play();return;}
   case 'filter':S.filter=b.dataset.k;break;
   case 'reload':if(S.resStudent)loadResults(S.resStudent);return;
   case 'copy':{const t=exportText(b.dataset.st,b.dataset.src);let ok=false;try{await navigator.clipboard.writeText(t);ok=true;}catch(err){}
     if(ok){b.textContent='تم النسخ ✓';setTimeout(()=>render(),1500);}else showModal('انسخ النص ده (حدّده كله واضغط نسخ):',t);return;}
   case 'dl':{if(!window.jspdf){S.notice='مكتبة إنشاء الملف لسه بتتحمّل. حاول تاني بعد ثواني.';break;}
     const old=b.textContent;b.textContent='جارٍ تجهيز الملف…';b.disabled=true;
     try{const blob=await buildPDF(b.dataset.st,b.dataset.src);const name=`الوحدة2 - ${b.dataset.st} - ${CATS[S.filter]}.pdf`;
       if(S.downloads){try{await S.downloads.save({filename:name,data:blob});}catch(err){if(!err||err.code!=='cancelled'){S.notice='التنزيل مش متاح في العرض ده. افتح الرابط في صفحة مستقلة وجرّب تاني.';}}}
       else{const u=URL.createObjectURL(blob);const l=document.createElement('a');l.href=u;l.download=name;document.body.appendChild(l);l.click();l.remove();setTimeout(()=>URL.revokeObjectURL(u),5000);}
     }catch(err){S.notice='حصلت مشكلة أثناء إنشاء الملف.';}
     b.textContent=old;b.disabled=false;break;}
  }
  render();
});
document.addEventListener('change',e=>{const t=e.target;const act=t.dataset&&t.dataset.act;
  if(act==='toggle'){t.checked?S.picked.add(t.dataset.id):S.picked.delete(t.dataset.id);render();}
  if(act==='hw'){S.homework=t.checked;}
  if(act==='notebook'&&S.run){S.run.ui.notebook=t.checked;render();}
  if(t.id==='ressel'){if(t.value)loadResults(t.value);else{S.resStudent='';render();}}
});
document.addEventListener('input',e=>{if(e.target.id==='stname')S.student=e.target.value;});
document.addEventListener('toggle',e=>{const d=e.target;if(d.tagName==='DETAILS'&&d.dataset.s)S.open[d.dataset.s]=d.open;},true);
if(window.SITE)boot();else{let started=false;const go=()=>{if(!started){started=true;boot();}};window.addEventListener('site-ready',go);setTimeout(()=>{if(!window.SITE)go();},8000);}
