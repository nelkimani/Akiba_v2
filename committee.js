/* AKIBA SMART - committee features (officers only; members take part through WhatsApp).
   1. Payment ledger: every contribution keeps its date, time, reference code and the week it was credited to.
   2. Bank / M-Pesa message import (treasurer).
   3. Loan approval: every member votes on WhatsApp -> chairman, treasurer and secretary approve here -> disburse.
   4. Reports: per-member PDF, weekly and monthly chama summaries, sent over WhatsApp.
   Loaded before the main script; it only declares functions, and uses the main script's globals when they are called. */
(function(){
'use strict';
const MON=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'],MONL=['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY=864e5,WK=7*DAY,W0=Date.UTC(2026,8,28),WEEKLY=2000,OFF=['chairman','treasurer','secretary'];
const H=s=>String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const cap1=s=>s[0].toUpperCase()+s.slice(1),isoD=d=>d.toISOString().slice(0,10);
const wkStart=w=>new Date(W0+(w-41)*WK),wkEnd=w=>new Date(W0+(w-41)*WK+6*DAY);
const wkOf=ds=>41+Math.floor((Date.UTC(+ds.slice(0,4),+ds.slice(5,7)-1,+ds.slice(8,10))-W0)/WK);
const fdate=(ds,y)=>+ds.slice(8,10)+' '+MON[+ds.slice(5,7)-1]+(y?' '+ds.slice(0,4):'');
const wkRange=w=>fdate(isoD(wkStart(w)))+' to '+fdate(isoD(wkEnd(w)),1);
const tm=t=>{if(!t)return'';const p=t.split(':').map(Number);return(p[0]%12||12)+':'+String(p[1]).padStart(2,'0')+' '+(p[0]<12?'AM':'PM')};
const when=e=>e&&e.d?fdate(e.d)+(e.t?', '+tm(e.t):''):'-';
const nowHM=()=>new Date().toTimeString().slice(0,5);
const stamp=()=>isoD(TODAY)+' '+nowHM();
const today=()=>isoD(TODAY);
const mname=id=>(S.m.find(m=>m.id==id)||{n:'?'}).n;
const first=n=>String(n).split(' ')[0];
const cmpE=(a,b)=>(a.d+(a.t||'')).localeCompare(b.d+(b.t||''))||a.id-b.id;

/* ---------------- ledger ---------------- */
const paidIn=(mid,w,extra)=>{let s=0;S.contribs.forEach(c=>{if(c.mid==mid&&c.wk==w)s+=c.amt});(extra||[]).forEach(c=>{if(c.mid==mid&&c.wk==w)s+=c.amt});return s};
/* Per week: KSh16,500 leaves the bank as a standing order to the Transnational SACCO ordinary shares account, KSh5,500 is the Loan Kitty (started this year).
   Expected ordinary shares = (52 weeks last year + completed weeks this year) x 16,500. */
function recompute(){ORD=(52+WEEK-1)*16500;KIT=(WEEK-1)*5500;S.m.forEach(m=>{m.paid=Math.min(WEEKLY,paidIn(m.id,WEEK))})}
// oldest unpaid week first (arrears), never earlier than the first tracked week
function firstOpen(mid,d,extra){const cap=wkOf(d),w0=S.w0||41;for(let w=w0;w<=cap;w++)if(paidIn(mid,w,extra)<WEEKLY)return w;return Math.max(cap,w0)}
// split a payment over weeks: fill the target week to KSh2,000, spill the rest into the following weeks
function allocWeeks(mid,amt,d,wk,extra){
  let w=wk==null||wk===''?firstOpen(mid,d,extra):+wk,rem=amt;const out=[];
  for(let g=0;rem>0&&g<60;g++,w++){const room=Math.max(0,WEEKLY-paidIn(mid,w,extra)),take=Math.min(rem,room);if(take>0){out.push({wk:w,amt:take});rem-=take}}
  if(rem>0){if(out.length)out[out.length-1].amt+=rem;else out.push({wk:w,amt:rem})}
  return out}
function postContrib(mid,amt,d,t,ref,wk,src,raw){
  const out=allocWeeks(mid,amt,d,wk).map(a=>{const c={id:++S.cid,mid,amt:a.amt,ref:ref||'',d,t:t||'',wk:a.wk,src:src||'Manual',raw:(raw||'').slice(0,400)};S.contribs.push(c);return c});
  if(ref)S.seen[ref]=1;recompute();return out}

/* Late fine: KSh225 for every day after Sunday midnight (Monday = 1 day, Tuesday = 2 ...), added up. */
const lateRate=()=>(S.cfg&&S.cfg.lateFine)||225;
function lateDays(w,d){const e=wkEnd(w).getTime();return Math.max(0,Math.floor((Date.UTC(+d.slice(0,4),+d.slice(5,7)-1,+d.slice(8,10))-e)/DAY))}
// pay the target week first, then the late fine for it, then whatever is left goes to the following weeks
function planPay(mid,amt,d,wk,extra){
  const w=wk==null||wk===''?firstOpen(mid,d,extra):+wk,need=Math.max(0,WEEKLY-paidIn(mid,w,extra)),take=Math.min(amt,need),
    days=lateDays(w,d),due=take>0?days*lateRate():0;let rem=amt-take;const fp=Math.min(rem,due);rem-=fp;
  const parts=take>0?[{wk:w,amt:take}]:[];
  if(rem>0){const ex=(extra||[]).concat(parts.map(p=>({mid,amt:p.amt,wk:p.wk})));allocWeeks(mid,rem,d,w+1,ex).forEach(a=>parts.push(a))}
  return{parts,fine:{wk:w,days,due,paid:fp,out:due-fp}}}
function applyPay(m,amt,d,t,ref,src,raw,rec){
  const pl=planPay(m.id,amt,d,null),cn=pl.parts.reduce((s,a)=>s+a.amt,0),f=pl.fine;
  pl.parts.forEach(a=>S.contribs.push({id:++S.cid,mid:m.id,amt:a.amt,ref:ref||'',d,t:t||'',wk:a.wk,src,raw:(raw||'').slice(0,400)}));
  if(ref)S.seen[ref]=1;
  const why='Late contribution, week '+f.wk+' ('+f.days+' day'+(f.days>1?'s':'')+' after Sunday)';
  if(f.paid>0)S.fines.unshift({n:m.n,why,a:f.paid,st:'Paid',d});
  if(f.out>0){S.fines.unshift({n:m.n,why,a:f.out,st:'Outstanding',d});m.fines+=f.out}
  if(cn>0)S.bank.unshift({d,t:'Contribution: '+m.n+(ref?' ['+ref+']':''),cat:'Contribution',amt:cn,rec,ref,tm:t,src});
  if(f.paid>0)S.bank.unshift({d,t:'Late fine: '+m.n+(ref?' ['+ref+']':''),cat:'Fine',amt:f.paid,rec,ref,tm:t,src});
  S.bal+=amt;recompute();return pl}

function migrate(){
  S.m.forEach(m=>{if(m.ph==null)m.ph=''});
  S.loans.forEach(l=>{if(!l.stage)l.stage=l.ok?'live':'vote';if(!l.votes)l.votes={};if(!l.sig)l.sig={}});
  S.seen=S.seen||{};S.alias=S.alias||{};S.meetings=S.meetings||[];
  if(!S.contribs){ // first run: rebuild the ledger from contributions already recorded in the bank list
    S.contribs=[];S.cid=0;S.w0=41;S.cw=S.cw||41;
    S.bank.slice().reverse().filter(b=>b.cat=='Contribution').forEach(b=>{
      const nm=(b.t.match(/^Contribution: (.+?)(?: \(| \[|$)/)||[])[1],m=S.m.find(x=>x.n==nm);if(!m)return;
      allocWeeks(m.id,b.amt,b.d,S.cw).forEach(a=>S.contribs.push({id:++S.cid,mid:m.id,amt:a.amt,ref:'',d:b.d,t:'',wk:a.wk,src:'Earlier record',raw:''}))})}
  if((S.v||0)<3){ // KSh225 above the weekly 2,000 was a late fine, not an advance
    S.cfg.lateFine=S.cfg.lateFine||225;S.fines=S.fines||[];
    S.contribs=S.contribs.filter(x=>{if(x.src!='Earlier record'||x.wk<=41)return true;
      const base=S.contribs.find(y=>y.mid==x.mid&&y.wk==x.wk-1&&y.src=='Earlier record'&&y.d==x.d);if(!base)return true;
      S.fines.unshift({n:mname(x.mid),why:'Late contribution, week '+base.wk+' (paid after Sunday midnight)',a:x.amt,st:'Paid',d:x.d});return false});
    S.v=3}
  if((S.v||0)<4){ // loans as listed by the Treasurer on 7 Oct 2026: first interest (incl. KSh200 fee) already paid on these
    const P={'Hesbon Ogera':[50000,'2026-10-01',2500],'Mary Njogu':[20000,'2026-10-03',1000],'Francis Githui':[30000,'2026-09-24',1500],'Mercy Murugi':[50000,'2026-10-04',2500],'Achola Silas':[50000,'2026-10-04',2500],'Nelson Karanja':[50000,'2026-10-07',2500]};
    S.loans.forEach(l=>{const x=P[l.who];if(x&&l.ok&&l.p==x[0]&&!l.h.length){l.h.push({d:x[1],f:200,i:x[2],pr:0});l.feePaid=200}
      if(l.who=='Ashford Kariuki'&&l.ok&&l.p==30000&&!l.h.length)l.feePaid=0});
    S.v=4}
  if((S.v||0)<5){ // AGM was 2 June 2026; net dividends KSh46,164 arrived 31 Jan 2026. Both are already inside the real bank balance, so they are history only.
    const a=S.bank.find(b=>b.cat=='Expense'&&/AGM/i.test(b.t));if(a)a.d='2026-06-02';
    if(!S.bank.some(b=>b.cat=='Dividend'))S.bank.push({d:'2026-01-31',t:'Bank dividends (net)',cat:'Dividend',amt:46164,rec:true});
    S.v=5}
  S.cw=S.cw||41;WEEK=S.cw;recompute();save()}

/* ---------------- WhatsApp + files ---------------- */
function normPhone(s){const d=String(s||'').replace(/\D/g,'');if(/^254[17]\d{8}$/.test(d))return d;if(/^0[17]\d{8}$/.test(d))return'254'+d.slice(1);if(/^[17]\d{8}$/.test(d))return'254'+d;return''}
const showPhone=p=>p?'0'+p.slice(3):'';
function waOpen(text,phone){window.open('https://wa.me/'+(phone||'')+'?text='+encodeURIComponent(text),'_blank','noopener')}
function dl(blob,name){const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),5000)}
async function sharePdf(blob,name,text,phone){
  try{const f=new File([blob],name,{type:'application/pdf'});
    if(navigator.canShare&&navigator.canShare({files:[f]})){await navigator.share({files:[f],text,title:name});return}}catch(e){if(e&&e.name=='AbortError')return}
  dl(blob,name);waOpen(text,phone);toast('PDF saved. In WhatsApp, tap the paperclip and attach it.')}

/* ---------------- bank message import ---------------- */
let IM=null;
function fImport(){
  if(!can('import'))return toast('Only the Treasurer can import bank messages');
  sheet(`<h3>Import bank messages</h3><p class="mut">Paste M-Pesa or bank SMS texts (as many as you like), or load a text or XML file exported from your phone. Weekly contributions, time paid and reference codes are filled in for you.</p>
<label for="imt">Messages</label><textarea id="imt" rows="8" placeholder="SJK4H7P2QW Confirmed. You have received Ksh2,000.00 from FRANCIS GITHUI 0712345678 on 3/10/26 at 4:15 PM..."></textarea>
<input id="imf" type="file" accept=".txt,.csv,.xml,text/*" hidden onchange="imFile(this)"><div class="qa np"><button class="btn s o" onclick="$('imf').click()">Load file</button></div>
<p style="margin-top:.6rem"><button class="btn w" onclick="imRead()">Read messages</button></p>`)}
function imFile(el){const f=el.files[0];if(!f)return;const r=new FileReader();r.onload=()=>{$('imt').value=r.result};r.readAsText(f)}
function imRead(){
  const rows=BANKPARSE.parse($('imt').value,{members:S.m,alias:S.alias,seen:S.seen,today:today()});
  if(!rows.length)return toast('No money messages found. Paste the full SMS text.');
  IM=rows;imReview()}
const TYPES=[['c','Contribution'],['r','Loan repayment'],['x','Skip']];
function imReview(){
  const n=IM.filter(r=>r.type!='x').length;
  sheet(`<h3>Check ${IM.length} message${IM.length>1?'s':''}</h3><p class="mut">${n} will be recorded. Fix anything that looks wrong, or set a message to Skip.</p>`+IM.map((r,i)=>`<div class="rc" style="${r.type=='x'?'opacity:.75':''}">
<div class="mut" style="font-size:.75rem;overflow-wrap:anywhere">${H(r.raw.slice(0,140))}${r.raw.length>140?'...':''}</div>
${r.warn.map(w=>`<span class="bd a" style="margin:.3rem .3rem 0 0">${H(w)}</span>`).join('')}
<div class="g2"><div><label>Member</label><select onchange="imSet(${i},'mid',this.value)"><option value="0">Choose member</option>${S.m.map(m=>`<option value="${m.id}" ${m.id==r.mid?'selected':''}>${H(m.n)}</option>`).join('')}</select></div>
<div><label>Action</label><select id="imty${i}" onchange="imSet(${i},'type',this.value)">${TYPES.map(t=>`<option value="${t[0]}" ${t[0]==r.type?'selected':''}>${t[1]}</option>`).join('')}</select></div></div>
<div class="g2"><div><label>Amount (KSh)</label><input type="number" inputmode="decimal" value="${r.amt}" onchange="imSet(${i},'amt',this.value)"></div><div><label>Reference code</label><input value="${H(r.ref)}" onchange="imSet(${i},'ref',this.value)"></div></div>
<div class="g2"><div><label>Date paid</label><input type="date" value="${r.d}" onchange="imSet(${i},'d',this.value)"></div><div><label>Time paid</label><input type="time" value="${r.t}" onchange="imSet(${i},'t',this.value)"></div></div></div>`).join('')+
`<p style="margin-top:1rem"><button class="btn w" onclick="imPreview()">Preview</button></p><p style="margin-top:.5rem"><button class="btn o w" onclick="fImport()">Back</button></p>`)}
function imSet(i,k,v){const r=IM[i];
  if(k=='mid'){r.mid=+v;if(r.mid&&r.type=='x'&&r.kind=='credit'&&!r.dup){r.type='c';const el=$('imty'+i);if(el)el.value='c'}}
  else if(k=='amt')r.amt=+v;else r[k]=v}
function imPlan(){ // dry run: where would every payment land?
  const extra=[],errs=[],lines=[];let tc=0,tr=0,nc=0,nr=0,skipped=0;
  IM.forEach(r=>{
    if(r.type=='x'){skipped++;return}
    const m=S.m.find(x=>x.id==r.mid);
    if(!m)return errs.push('Choose a member for "'+(r.name||r.ref||'a message')+'"');
    if(!(r.amt>0))return errs.push(m.n+': amount must be above zero');
    if(!/^\d{4}-\d{2}-\d{2}$/.test(r.d))return errs.push(m.n+': date is missing');
    if(r.type=='c'){
      const pl=planPay(m.id,r.amt,r.d,null,extra),f=pl.fine;pl.parts.forEach(a=>extra.push({mid:m.id,amt:a.amt,wk:a.wk}));
      lines.push([m.n,KSh(r.amt)+' > '+pl.parts.map(a=>'Wk '+a.wk+(pl.parts.length>1?' ('+KSh(a.amt)+')':'')).join(', ')+(f.due?' · '+f.days+' day'+(f.days>1?'s':'')+' late, fine '+KSh(f.due)+(f.out?' ('+KSh(f.out)+' still owing)':' paid'):'')+(r.ref?' · '+r.ref:'')]);tc+=r.amt;nc++}
    else{const l=S.loans.find(x=>x.who==m.n&&x.ok&&LI(x).pr>0);
      if(!l)return errs.push(m.n+' has no active loan to repay');
      const x=alloc(l,r.amt);lines.push([m.n+' (loan)',KSh(r.amt)+' > fee '+KSh(x.f)+', interest '+KSh(x.i)+', principal '+KSh(x.pr)]);tr+=r.amt;nr++}});
  return{errs,lines,tc,tr,nc,nr,skipped}}
function imPreview(){
  const p=imPlan();
  if(p.errs.length)return toast(p.errs[0]);
  if(!p.nc&&!p.nr)return toast('Nothing to record. Choose a member and action for at least one message.');
  const rows=[];if(p.nc)rows.push(['Contributions',p.nc+' · '+KSh(p.tc)]);if(p.nr)rows.push(['Loan repayments',p.nr+' · '+KSh(p.tr)]);if(p.skipped)rows.push(['Skipped',p.skipped]);
  prev({title:'Import bank messages',rows:rows.concat(p.lines),eff:[['Bank',S.bal,S.bal+p.tc+p.tr]],msg:p.nc+p.nr+' payment'+(p.nc+p.nr>1?'s':'')+' recorded',rc:null,
    ok(){IM.forEach(r=>{
      if(r.type=='x')return;const m=S.m.find(x=>x.id==r.mid);
      if(r.type=='c')applyPay(m,r.amt,r.d,r.t,r.ref,'Bank SMS',r.raw,true)
      else{const l=S.loans.find(x=>x.who==m.n&&x.ok&&LI(x).pr>0),x=alloc(l,r.amt);
        l.feePaid+=x.f;l.h.push({d:r.d,f:x.f,i:x.i,pr:x.pr,ref:r.ref});
        S.bank.unshift({d:r.d,t:'Repayment: '+m.n+(r.ref?' ['+r.ref+']':''),cat:'Loan repayment',amt:r.amt,rec:true,ref:r.ref,tm:r.t,src:'Bank SMS'});S.bal+=r.amt;if(r.ref)S.seen[r.ref]=1}
      if(!r.ref)S.seen[r.fp]=1;
      if(r.name)S.alias[BANKPARSE.nkey(r.name)]=m.id;if(r.ph)S.alias['p:'+r.ph]=m.id; // recognise this sender next time
      log('Treasurer imported '+(r.type=='c'?'contribution':'repayment'),m.n,'—',KSh(r.amt)+(r.ref?' '+r.ref:''))});
      IM=null;recompute()},
    nx:'<p style="margin-top:.5rem"><button class="btn o w" onclick="closeSheet(1);go(\'Contributions\')">View contributions</button></p>'})}

/* ---------------- contributions page ---------------- */
let VW=null;
const vwk=d=>{VW=(VW==null?WEEK:VW)+d;if(VW<41)VW=41;if(VW>WEEK+4)VW=WEEK+4;render(1)};
function weekData(w){
  const rows=S.m.map(m=>{const es=S.contribs.filter(c=>c.mid==m.id&&c.wk==w).sort(cmpE),paid=es.reduce((s,e)=>s+e.amt,0);
    return{m,es,paid,st:paid>=WEEKLY?'Paid':paid>0?'Partial':'Pending'}});
  const col=rows.reduce((s,r)=>s+r.paid,0);
  return{w,rows,exp:S.m.length*WEEKLY,col,npaid:rows.filter(r=>r.st=='Paid').length}}
const refsOf=es=>es.map(e=>e.ref).filter(Boolean).filter((x,i,a)=>a.indexOf(x)==i).join(', ');
function contribView(){
  const w=VW==null?WEEK:VW,d=weekData(w),pc=Math.round(Math.min(d.col,d.exp)/d.exp*100),cur=w==WEEK;
  return`<div class="cd"><div class="k">Completed weeks</div><div class="v">${WEEK-1} of ${WEEK}</div><p class="mut">Week ${WEEK} is the current collection week and counts as complete once you close it. Expected per week ${KSh(22000)} (SACCO standing order ${KSh(16500)} + Loan Kitty ${KSh(5500)})</p></div>
<div class="qa np"><button class="btn s o" onclick="vwk(-1)" ${w<=41?'disabled':''}>‹ Earlier</button><b style="align-self:center;white-space:nowrap">Week ${w}${cur?' (current)':''} · ${wkRange(w)}</b><button class="btn s o" onclick="vwk(1)">Later ›</button></div>
<div class="cd"><h3>Week ${w} collection</h3><div class="pb" role="progressbar" aria-valuenow="${pc}"><i style="width:${pc}%"></i></div><p class="mut">${pc}% collected: ${KSh(d.col)} of ${KSh(d.exp)}. Outstanding ${KSh(Math.max(0,d.exp-d.col))}. ${d.npaid} of ${S.m.length} members fully paid.</p></div>
${quick(['contrib','import'])}<div class="qa np">${can('report')?`<button class="btn s o" onclick="RV.wk=${w};go('Report/Weekly summary')">Weekly summary and PDF</button>`:''}${can('contrib')&&cur?`<button class="btn s o" onclick="closeWeek()">Close week ${w}, start week ${w+1}</button>`:''}</div>
<div class="cd"><h3>Week ${w}, ${wkRange(w)}</h3>${d.rows.map(r=>`<div class="row" onclick="go('Member/${r.m.id}')"><div class="av">${ini(r.m.n)}</div><div class="grow"><b>${H(r.m.n)}</b><span class="mut">${r.es.length?r.es.map(e=>KSh(e.amt)+' · '+when(e)+(e.ref?' · '+H(e.ref):'')).join('<br>'):'Outstanding '+KSh(WEEKLY)}</span></div>${bd(r.st)}</div>`).join('')}</div>
<div class="cd"><div class="k">2026 to date</div><p>${WEEK-1} completed weeks: SACCO standing order ${KSh((WEEK-1)*16500)} + Loan Kitty ${KSh((WEEK-1)*5500)} = <b>${KSh((WEEK-1)*22000)}</b></p></div>`}
function closeWeek(){
  if(!can('contrib'))return toast('Only the Treasurer can close a week');
  const d=weekData(WEEK),un=d.rows.filter(r=>r.st!='Paid');
  if(!confirm('Close week '+WEEK+' and start week '+(WEEK+1)+'? The KSh16,500 SACCO standing order for this week will be recorded as money out.'+(un.length?'\n\n'+un.length+' member(s) have not fully paid. Their balance stays outstanding for week '+WEEK+' and the next payment they make is credited to it first.':'')))return;
  S.bank.unshift({d:today(),t:'SACCO standing order, week '+WEEK+' (Transnational SACCO ordinary shares)',cat:'SACCO standing order',amt:-16500,rec:false});S.bal-=16500;
  S.cw=WEEK+1;WEEK=S.cw;VW=null;recompute();log('Treasurer closed contribution week',String(WEEK-1),'Week '+(WEEK-1),'Week '+WEEK);save();render(1);toast('Week '+WEEK+' started')}

/* ---------------- loan approval: members vote on WhatsApp, officers approve here ---------------- */
const voters=l=>S.m.filter(m=>m.n!=l.who);
function vcount(l){const v=voters(l);let a=0,r=0;v.forEach(m=>{const x=(l.votes[m.id]||{}).v;if(x=='A')a++;else if(x=='R')r++});return{a,r,n:v.length,p:v.length-a-r}}
const pend=()=>S.loans.filter(l=>!l.ok&&l.stage!='rej');
function advance(l){
  if(l.stage=='vote'){const c=vcount(l);if(c.n>0&&c.a==c.n){l.stage='off';log('All members approved loan',l.who,'Member vote','Officer approval');toast('Every member approved. Officers can now sign off.')}}}
function castVote(lid,mid,v){
  const l=S.loans.find(x=>x.id==lid),m=S.m.find(x=>x.id==mid);
  if(!can('vote'))return toast('Your role cannot record member votes');
  if(!l||l.stage!='vote')return toast('Voting is closed for this loan');
  const old=(l.votes[mid]||{}).v;if(old==v)return;
  l.votes[mid]={v,t:stamp(),by:R};
  log('Recorded member vote (WhatsApp)',m.n+' on '+l.who+' loan',old=='A'?'Approve':old=='R'?'Reject':'—',v=='A'?'Approve':'Reject');
  advance(l);save();render(1)}
function restartVote(id){
  const l=S.loans.find(x=>x.id==id);if(!can('vote')||l.stage!='vote')return;
  if(!confirm('Clear all recorded votes for '+l.who+'?'))return;
  l.votes={};log('Restarted member voting',l.who);save();render(1)}
function reopenVote(id){
  const l=S.loans.find(x=>x.id==id);if(!can('vote')||l.stage!='off')return;
  if(!confirm('Reopen member voting for '+l.who+'? Officer approvals so far will be cleared.'))return;
  l.stage='vote';l.sig={};log('Reopened member voting',l.who);save();render(1)}
function officerSign(id){
  const l=S.loans.find(x=>x.id==id);
  if(!can('sign'))return toast('Your role cannot approve loans');
  if(l.stage!='off')return toast('Waiting for every member to approve first');
  if(l.sig[R])return;
  l.sig[R]={t:stamp()};log(cap1(R)+' approved loan for disbursement',l.who,'Officer approval',Object.keys(l.sig).length+' of 3');
  if(OFF.every(o=>l.sig[o])){l.stage='ready';log('All officers approved loan',l.who,'Officer approval','Ready to disburse');toast('All three officers approved. Treasurer can disburse.')}
  save();render(1)}
function rejectLoan(id){
  const l=S.loans.find(x=>x.id==id);if(!can('sign'))return;
  if(!confirm('Reject the KSh'+l.p.toLocaleString()+' loan for '+l.who+'? This stops the application.'))return;
  l.stage='rej';l.rej={by:R,t:stamp()};log(cap1(R)+' rejected loan',l.who,'Pending','Rejected');save();go('Loans',1);toast('Loan rejected')}
function fDisburse(id){
  const l=S.loans.find(x=>x.id==id);
  if(!can('disburse'))return toast('Only the Treasurer disburses approved loans');
  if(l.stage!='ready')return toast('All three officers must approve first');
  prev({title:'Disburse approved loan',rows:[['Borrower',l.who],['Principal',KSh(l.p)],['Processing fee',KSh(S.cfg.fee)+', collected with the first interest payment'],['Members approved',vcount(l).a+' of '+vcount(l).n],['Officers approved','Chairman, Treasurer, Secretary']],
    eff:[['Bank',S.bal,S.bal-l.p],['Loan book',book(),book()+l.p]],
    ok(){l.ok=true;l.stage='live';l.feePaid=0;l.date=today();S.bal-=l.p;
      S.bank.unshift({d:today(),t:'Loan disbursed: '+l.who,cat:'Loan disbursement',amt:-l.p,rec:false});log('Treasurer disbursed loan',l.who,'Ready to disburse','Active')},
    rc:null,msg:'Loan disbursed'})}
function loanText(l,remind){
  const c=vcount(l),w=voters(l).filter(m=>!(l.votes[m.id]||{}).v).map(m=>first(m.n));
  if(remind)return`*AKIBA SMART - vote reminder*\n${l.who}'s loan of ${KSh(l.p)} is waiting for votes.\nStill to vote (${w.length}): ${w.join(', ')||'none'}.\nPlease reply *APPROVE* or *REJECT*. Every member's approval is needed.`;
  return`*AKIBA SMART - loan request for your vote*\nMember: ${l.who}\nAmount: ${KSh(l.p)}\nInterest: ${S.cfg.rate}% a month (${KSh(l.p*S.cfg.rate/100)} a month)\nProcessing fee: ${KSh(S.cfg.fee)}\nMaximum term: ${S.cfg.maxm} months\n\nPlease reply *APPROVE* or *REJECT*.\nThe loan goes ahead only when every member approves.${c.a||c.r?`\nVotes so far: ${c.a} approved, ${c.r} rejected, ${c.p} waiting.`:''}`}
function loanWA(id,remind){const l=S.loans.find(x=>x.id==id);waOpen(loanText(l,remind))}
// paste the WhatsApp group chat and let the app read the replies
let RP=null;
function fReplies(id){
  if(!can('vote'))return toast('Your role cannot record member votes');
  sheet(`<h3>Read WhatsApp replies</h3><p class="mut">Copy the replies from the group chat and paste them here. Lines like "Mary Njogu: Approve" are read automatically. In WhatsApp, long-press a message, tap Copy, or use Export chat.</p><label for="rpt">Replies</label><textarea id="rpt" rows="8" placeholder="[06/10/2026, 10:15] Mary Njogu: Approve&#10;Francis Githui: Yes"></textarea><p style="margin-top:.8rem"><button class="btn w" onclick="rpRead(${id})">Read replies</button></p>`)}
function voteOf(msg){
  const t=msg.toLowerCase();
  if(/(do not|don't|dont|not|never)\s+(approve|agree|accept|support)|disapprove|\b(reject|rejected|decline|declined|against|disagree|oppose|opposed)\b|❌|👎|🚫/.test(t))return'R';
  if(/\b(approve|approved|agree|agreed|yes|yeah|ok|okay|accept|accepted|support|fine|sawa|ndio)\b|✅|👍|✔/.test(t))return'A';
  if(/^\s*(no|hapana)\b/.test(t))return'R';
  return''}
function rpRead(id){
  const l=S.loans.find(x=>x.id==id),vs=voters(l),latest={},unmatched=[],unclear=[];
  $('rpt').value.split('\n').forEach(line=>{
    line=line.replace(/[‎‏]/g,'').trim();if(!line)return;
    let pre='',body=line;const m=line.match(/^\[?(\d{1,2}[\/.\-]\d{1,2}[\/.\-]\d{2,4}),?\s*(\d{1,2}[:.]\d{2}(?::\d{2})?\s*(?:[AaPp]\.?[Mm]\.?)?)?\]?\s*[-–]?\s*(.*)$/);
    if(m){pre=m[1]+' '+(m[2]||'').replace('.',':');body=m[3]}
    const ci=body.indexOf(':');if(ci<1)return;
    const who=body.slice(0,ci).replace(/^~\s*/,'').trim(),msg=body.slice(ci+1).trim(),v=voteOf(msg);
    if(!v)return unclear.push(who+': '+msg.slice(0,40));
    const mm=BANKPARSE.matchMember(who,BANKPARSE.phoneOf(who.replace(/[\s-]/g,'')),vs,S.alias);
    if(!mm.id||!vs.some(x=>x.id==mm.id))return unmatched.push(who+(mm.id&&mm.id!=0&&!vs.some(x=>x.id==mm.id)?' (the borrower cannot vote)':''));
    const d=BANKPARSE.findDate(pre,today()),t=BANKPARSE.findTime(pre);
    latest[mm.id]={v,t:(d||today())+' '+(t||nowHM()),line:msg.slice(0,50)}});
  RP={id,votes:latest};
  const ids=Object.keys(latest);
  sheet(`<h3>${ids.length} vote${ids.length==1?'':'s'} found</h3>${ids.map(k=>`<div class="ef"><span><b>${H(mname(k))}</b><br><span class="mut">${H(latest[k].line)} · ${H(latest[k].t)}</span></span>${bd(latest[k].v=='A'?'Approved':'Rejected')}</div>`).join('')||'<p class="mut">No clear Approve or Reject replies were found.</p>'}
${unmatched.length?`<p class="mut" style="margin-top:.6rem">Could not match these senders to a member (record them by hand): ${H(unmatched.filter((x,i,a)=>a.indexOf(x)==i).join(', '))}</p>`:''}${unclear.length?`<p class="mut" style="margin-top:.6rem">Not a clear vote, ignored: ${H(unclear.slice(0,4).join(' | '))}</p>`:''}
${ids.length?`<p style="margin-top:1rem"><button class="btn w" onclick="rpApply()">Record these votes</button></p>`:''}<p style="margin-top:.5rem"><button class="btn o w" onclick="fReplies(${id})">Back</button></p>`)}
function rpApply(){
  const l=S.loans.find(x=>x.id==RP.id);if(l.stage!='vote')return toast('Voting is closed for this loan');
  Object.keys(RP.votes).forEach(k=>{const v=RP.votes[k],old=(l.votes[k]||{}).v;if(old==v.v)return;
    l.votes[k]={v:v.v,t:v.t,by:R};log('Recorded member vote (WhatsApp)',mname(k)+' on '+l.who+' loan',old=='A'?'Approve':old=='R'?'Reject':'—',v.v=='A'?'Approve':'Reject')});
  RP=null;advance(l);save();closeSheet(1);render(1);toast('Votes recorded')}

function stepper(l){
  if(l.stage=='rej')return`<div class="au cd" style="margin:.8rem 0"><b>Rejected</b><p class="mut">${H(cap1((l.rej||{}).by||'officer'))} rejected this loan ${H((l.rej||{}).t||'')}. No money was released.</p></div>`;
  const idx={vote:2,off:3,ready:4,live:5}[l.stage]||2;
  return'<div class="flow" style="margin:.8rem 0">'+['Application','Member vote','Officers','Disburse'].map((n,i)=>{const c=i+1<idx?'':i+1==idx?'cu':'up';return(i?'<em>›</em>':'')+'<span class="'+c+'">'+(c==''?'✓ ':'')+n+'</span>'}).join('')+'</div>'}
function loanFlow(l){
  const c=vcount(l),edit=can('vote')&&l.stage=='vote',pct=c.n?Math.round(c.a/c.n*100):0;let h=stepper(l);
  h+=`<h3 style="margin-top:1rem">Member vote on WhatsApp</h3><p class="mut">${H(l.who)} does not vote on their own loan. All ${c.n} other members must approve.</p><div class="pb"><i style="width:${pct}%"></i></div><p class="mut">${c.a} of ${c.n} approved${c.r?' · <b style="color:var(--rd)">'+c.r+' rejected</b>':''}${c.p?' · '+c.p+' waiting':''}</p>`;
  if(c.r&&l.stage=='vote')h+=`<div class="au cd" style="margin:.5rem 0"><b>A member rejected.</b><p class="mut">The loan needs everyone. If they change their mind on WhatsApp, record the new vote. Otherwise reject the application.</p></div>`;
  h+=voters(l).map(m=>{const v=l.votes[m.id]||{};
    return`<div class="ef" style="gap:.4rem;flex-wrap:wrap;align-items:center"><span><b>${H(m.n)}</b><br><span class="mut">${v.v?(v.v=='A'?'Approved':'Rejected')+' · '+H(v.t):'Waiting for reply'}</span></span>${edit?`<span><button class="btn s ${v.v=='A'?'':'o'}" onclick="castVote(${l.id},${m.id},'A')">Approve</button> <button class="btn s ${v.v=='R'?'r':'o'}" onclick="castVote(${l.id},${m.id},'R')">Reject</button></span>`:bd(v.v=='A'?'Approved':v.v=='R'?'Rejected':'Waiting')}</div>`}).join('');
  if(l.stage=='vote'){
    h+=`<div class="qa np" style="margin-top:.8rem"><button class="btn s" onclick="loanWA(${l.id})">Send request to WhatsApp</button><button class="btn s o" onclick="loanWA(${l.id},1)">Remind those waiting</button>${can('vote')?`<button class="btn s o" onclick="fReplies(${l.id})">Read WhatsApp replies</button>`:''}${can('vote')&&Object.keys(l.votes).length?`<button class="btn s o" onclick="restartVote(${l.id})">Clear votes</button>`:''}</div>`}
  else if(l.stage=='off'&&can('vote'))h+=`<div class="qa np" style="margin-top:.8rem"><button class="btn s o" onclick="reopenVote(${l.id})">A member changed their vote</button></div>`;
  h+=`<h3 style="margin-top:1.2rem">Officer approval</h3><p class="mut">${l.stage=='vote'?'Opens once every member has approved.':'Chairman, Treasurer and Secretary must each approve on the app.'}</p>`;
  h+=OFF.map(o=>{const s=l.sig[o],mine=R==o&&l.stage=='off'&&!s&&can('sign');
    return`<div class="ef" style="gap:.4rem;flex-wrap:wrap;align-items:center"><span><b>${cap1(o)}</b><br><span class="mut">${s?'Approved · '+H(s.t):l.stage=='vote'||l.stage=='rej'?'Not yet open':'Waiting'}</span></span>${mine?`<button class="btn s" onclick="officerSign(${l.id})">Approve</button>`:bd(s?'Approved':'Waiting')}</div>`}).join('');
  if(l.stage=='ready')h+=can('disburse')?`<p style="margin-top:1rem"><button class="btn w" onclick="fDisburse(${l.id})">Disburse ${KSh(l.p)}</button></p>`:`<p class="mut" style="margin-top:.8rem">All officers approved. The Treasurer disburses the money.</p>`;
  if(can('sign')&&['vote','off','ready'].includes(l.stage))h+=`<p style="margin-top:.8rem"><button class="btn s r" onclick="rejectLoan(${l.id})">Reject this application</button></p>`;
  return h}
function loanRecord(l){ // read-only record on loans that already went through voting
  if(!Object.keys(l.votes).length&&!Object.keys(l.sig).length)return'';
  const c=vcount(l);return`<details style="margin-top:1rem"><summary style="cursor:pointer;min-height:32px">Approval record</summary><p class="mut">${c.a} of ${c.n} members approved on WhatsApp.</p>${voters(l).map(m=>{const v=l.votes[m.id]||{};return`<div class="ef"><span>${H(m.n)}</span><span class="mut">${v.v?(v.v=='A'?'Approved':'Rejected')+' · '+H(v.t):'-'}</span></div>`}).join('')}${OFF.map(o=>`<div class="ef"><span>${cap1(o)}</span><span class="mut">${l.sig[o]?'Approved · '+H(l.sig[o].t):'-'}</span></div>`).join('')}</details>`}
function approvals(){
  const p=pend();
  return`<div class="cd"><h3>Loan approvals</h3>${p.map(l=>{const c=vcount(l),need=l.stage=='vote'?can('vote'):l.stage=='off'?(can('sign')&&!l.sig[R]):l.stage=='ready'?can('disburse'):false;
    const done=OFF.filter(o=>l.sig[o]).map(cap1).join(', ')||'none yet';
    const sub=l.stage=='vote'?c.a+' of '+c.n+' members approved on WhatsApp'+(c.r?' · '+c.r+' rejected':''):l.stage=='off'?'Everyone approved on WhatsApp. Officers approved: '+done:'All officers approved, ready to disburse';
    return`<div class="row" onclick="go('Loan/${l.id}')"><div class="av">${ini(l.who)}</div><div class="grow"><b>${H(l.who)} · ${KSh(l.p)}</b><span class="mut">${sub}</span></div><div class="r2">${bd(LI(l).st)}${need?'<div><span class="bd a">Your turn</span></div>':''}</div></div>`}).join('')||empty('No loans waiting','New applications appear here. Members vote on WhatsApp, then the three officers approve.')}</div>`}
function loanAttn(){
  const a=[];
  S.loans.filter(l=>l.ok&&LI(l).pr>0&&overdueN(l)>0).forEach(l=>a.push(['r',l.who+': '+overdueN(l)+' interest payment'+(overdueN(l)>1?'s':'')+' overdue','Loan/'+l.id]));
  pend().forEach(l=>{const c=vcount(l);
    if(l.stage=='vote'&&can('vote'))a.push([c.r?'r':'a',l.who+': '+c.a+' of '+c.n+' members approved'+(c.r?', '+c.r+' rejected':''),'Loan/'+l.id]);
    else if(l.stage=='off'&&can('sign')&&!l.sig[R])a.push(['a','Your approval needed: '+l.who+' '+KSh(l.p),'Loan/'+l.id]);
    else if(l.stage=='ready'&&can('disburse'))a.push(['a','Approved by all officers, ready to disburse: '+l.who,'Loan/'+l.id])});
  return a.concat(meetAttn())}


/* ---------------- meetings: 1st Wednesday of the month, or a special date agreed by the group through the Chairman ---------------- */
const lateM=()=>(S.cfg&&S.cfg.lateMeet)||200,absM=()=>(S.cfg&&S.cfg.absent)||500;
const ATT={P:'Present',L:'Late',A:'Absent, with apology',X:'Absent, no apology'};
const DOW=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const dow=d=>DOW[new Date(d+'T00:00:00Z').getUTCDay()];
const longD=d=>dow(d)+' '+fdate(d,1);
function firstWed(ym){const p=ym.split('-').map(Number);let d=new Date(Date.UTC(p[0],p[1]-1,1));while(d.getUTCDay()!=3)d=new Date(d.getTime()+DAY);return isoD(d)}
function ensureMeetings(){
  S.meetings=S.meetings||[];let y=2026,m=10;const t=new Date(TODAY),end=new Date(Date.UTC(t.getUTCFullYear(),t.getUTCMonth()+3,1));
  while(Date.UTC(y,m-1,1)<=end.getTime()){const d=firstWed(y+'-'+String(m).padStart(2,'0'));
    if(!S.meetings.some(x=>x.type=='Regular'&&x.d==d))S.meetings.push({id:Math.max(0,...S.meetings.map(x=>x.id))+1,d,type:'Regular',title:'Monthly meeting',att:{},done:false});
    if(++m>12){m=1;y++}}
  S.meetings.sort((a,b)=>a.d.localeCompare(b.d))}
function meetingsView(){
  ensureMeetings();const up=S.meetings.filter(x=>!x.done),past=S.meetings.filter(x=>x.done).reverse();
  const row=x=>`<div class="row" onclick="go('Meeting/${x.id}')"><div class="av">${dow(x.d)[0]}</div><div class="grow"><b>${H(x.title)}</b><span class="mut">${longD(x.d)} · ${x.type}</span></div>${x.done?bd('Closed'):x.d<=today()?'<span class="bd a">Record attendance</span>':bd('Upcoming')}</div>`;
  return`<div class="cd"><h3>Meeting rules</h3><p class="mut">Regular meetings are on the first Wednesday of every month. A special meeting is added by the Chairman once the group has agreed the date. Late: ${KSh(lateM())}. Absent without apology: ${KSh(absM())}.</p>${can('schedule')?'<p style="margin-top:.6rem"><button class="btn s" onclick="fSpecial()">+ Special meeting</button></p>':''}</div>
<div class="cd"><h3>Upcoming and open</h3>${up.map(row).join('')||empty('Nothing scheduled','')}</div><div class="cd"><h3>Past meetings</h3>${past.map(row).join('')||empty('No closed meetings yet','Attendance and fines appear here once the Secretary closes a meeting.')}</div>`}
function fSpecial(){
  if(!can('schedule'))return toast('Only the Chairman schedules special meetings');
  sheet(`<h3>Special meeting</h3><p class="mut">Only after the group has agreed the date.</p><label for="smd">Date</label><input id="smd" type="date" value="${today()}"><label for="smt">Purpose</label><input id="smt" placeholder="e.g. Emergency general meeting"><label style="display:flex;gap:.5rem;align-items:center;margin-top:1rem;color:var(--tx)"><input id="sma" type="checkbox" style="width:22px;min-height:22px"> The group agreed this date unanimously</label><p style="margin-top:1rem"><button class="btn w" onclick="saveSpecial()">Add meeting</button></p>`)}
function saveSpecial(){
  const d=$('smd').value,t=$('smt').value.trim()||'Special meeting';
  if(!/^\d{4}-\d{2}-\d{2}$/.test(d))return toast('Pick a date');if(!$('sma').checked)return toast('Confirm the group agreed the date');
  ensureMeetings();const id=Math.max(0,...S.meetings.map(x=>x.id))+1;S.meetings.push({id,d,type:'Special',title:t,att:{},done:false});S.meetings.sort((a,b)=>a.d.localeCompare(b.d));
  log('Chairman scheduled special meeting',t,'—',d);save();closeSheet(1);render(1);toast('Meeting added. Send the notice on WhatsApp.')}
function meetText(x){return`*AKIBA SMART - ${x.title}*\n${longD(x.d)}\n${x.type=='Special'?'Special meeting agreed by the group.\n':''}\nLate arrival: ${KSh(lateM())} fine\nAbsent without apology: ${KSh(absM())} fine\nPlease send apologies to the Secretary before the meeting.`}
function meetingPage(id){
  ensureMeetings();const x=S.meetings.find(y=>y.id==id),edit=can('attend')&&!x.done,n=Object.keys(x.att).length;
  const fine=v=>v=='L'?lateM():v=='X'?absM():0,tot=S.m.reduce((s,m)=>s+fine(x.att[m.id]),0);
  sheet(`<div class="k">${x.type} meeting</div><h3>${H(x.title)}</h3><p class="mut">${longD(x.d)}</p>
<div class="qa np"><button class="btn s o" onclick="waOpen(meetText(S.meetings.find(y=>y.id==${x.id})))">Send notice on WhatsApp</button></div>
<h3 style="margin-top:1rem">Attendance</h3><p class="mut">${n} of ${S.m.length} marked${tot?' · fines '+KSh(tot):''}</p>
${S.m.map(m=>{const v=x.att[m.id]||'';return`<div class="ef" style="gap:.4rem;flex-wrap:wrap;align-items:center"><span><b>${H(m.n)}</b>${fine(v)?'<br><span class="mut">Fine '+KSh(fine(v))+'</span>':''}</span>${edit?`<select style="width:auto;min-width:150px" aria-label="Attendance for ${H(m.n)}" onchange="setAtt(${x.id},${m.id},this.value)"><option value="">Not marked</option>${Object.keys(ATT).map(k=>`<option value="${k}" ${k==v?'selected':''}>${ATT[k]}</option>`).join('')}</select>`:`<span class="${v=='X'||v=='L'?'bd a':'bd'}">${v?ATT[v]:'-'}</span>`}</div>`}).join('')}
${x.done?`<p class="mut" style="margin-top:.8rem">Closed. Fines were added to each member's record.</p>`:edit?`<p style="margin-top:1rem"><button class="btn w" onclick="closeMeeting(${x.id})">Close meeting and record fines</button></p>`:`<p class="mut" style="margin-top:.8rem">The Secretary records attendance.</p>`}`)}
function setAtt(id,mid,v){const x=S.meetings.find(y=>y.id==id);if(!can('attend')||x.done)return;if(v)x.att[mid]=v;else delete x.att[mid];save();render(1)}
function closeMeeting(id){
  const x=S.meetings.find(y=>y.id==id);if(!can('attend')||x.done)return;
  const un=S.m.filter(m=>!x.att[m.id]);if(un.length)return toast('Mark everyone first: '+un.length+' not marked');
  const fines=S.m.filter(m=>x.att[m.id]=='L'||x.att[m.id]=='X');
  if(!confirm('Close this meeting? '+(fines.length?fines.length+' fine(s) totalling KSh'+fines.reduce((s,m)=>s+(x.att[m.id]=='L'?lateM():absM()),0).toLocaleString('en-KE')+' will be recorded.':'No fines.')))return;
  fines.forEach(m=>{const a=x.att[m.id]=='L'?lateM():absM();S.fines.unshift({n:m.n,why:(x.att[m.id]=='L'?'Late to meeting':'Absent without apology, meeting')+' '+fdate(x.d,1),a,st:'Outstanding',d:x.d});m.fines+=a;log('Secretary recorded meeting fine',m.n,'—',KSh(a))});
  x.done=true;log('Secretary closed meeting',x.title+' '+x.d,'Open','Closed');save();render(1);toast('Meeting closed')}
function meetAttn(){ensureMeetings();return S.meetings.filter(x=>!x.done&&x.d<=today()).map(x=>['a',x.title+' ('+fdate(x.d)+'): attendance not closed','Meeting/'+x.id])}

/* ---------------- loan schedule, overdue interest, group reminder ---------------- */
// first interest payment also carries the KSh200 processing fee (e.g. 1,500 + 200 = 1,700)
function instRows(l){
  const mi=l.p*S.cfg.rate/100,fee=S.cfg.fee,paid=(l.feePaid||0)+l.h.reduce((s,h)=>s+h.i,0),pp=l.h.reduce((s,h)=>s+h.pr,0);let cum=0;const rows=[];
  for(let k=1;k<=S.cfg.maxm;k++){const amt=mi+(k==1?fee:0);cum+=amt;rows.push({k,due:isoD(addM(l.date,k)),amt,paid:paid>=cum-.005})}
  return{rows,pr:{due:isoD(addM(l.date,S.cfg.maxm)),amt:l.p,paid:pp>=l.p}}}
const overdueN=l=>instRows(l).rows.filter(r=>!r.paid&&r.due<today()).length;
function schedHtml(l){const s=instRows(l);
  return s.rows.map(r=>`<div>${fdate(r.due,1)}<br><span class="mut">Interest ${KSh(r.amt-(r.k==1?S.cfg.fee:0))}${r.k==1?' + fee '+KSh(S.cfg.fee):''}${r.paid?' · paid ✓':r.due<today()?' · overdue':''}</span></div>`).join('')+`<div>${fdate(s.pr.due,1)}<br><span class="mut">Principal ${KSh(s.pr.amt)}${s.pr.paid?' · paid ✓':''}</span></div>`}
function loanReminderText(){
  const ls=S.loans.filter(l=>l.ok&&LI(l).pr>0),d=x=>x.slice(8,10)+'/'+x.slice(5,7)+'/'+x.slice(0,4),n=v=>Number(v).toLocaleString('en-KE');
  return'*REMINDER TO AKIBA NJENGA*\n_Outstanding loans as at '+d(today())+'_\n\n'+ls.map(l=>{const s=instRows(l);
    return'Name: '+l.who+'\nAmount issued: '+n(l.p)+'\nIssued on: '+d(l.date)+'\nINTEREST REPAYMENT DATES\n'+s.rows.map(r=>d(r.due)+' '+n(r.amt)+(r.paid?' ✅':r.due<today()?' ⚠️ overdue':'')).join('\n')+'\nPRINCIPAL REPAYMENT DATE\n'+d(s.pr.due)+' '+n(s.pr.amt)+(s.pr.paid?' ✅':'')}).join('\n\n')+'\n\nPlease pay on or before the due date. Thank you. - '+who()}

/* ---------------- cash check: what should be in the bank this year ---------------- */
function cashCheck(){
  const yr=String(today().slice(0,4)),Y=d=>d&&d.slice(0,4)==yr,cw=WEEK-1,sum=(a,f)=>a.reduce((s,x)=>s+f(x),0);
  const L=[];const add=(k,v,note)=>L.push({k,v,note});
  add('Weekly contributions, '+cw+' completed weeks',cw*22000,'11 members x KSh2,000, assuming all paid');
  const cur=sum(S.contribs.filter(x=>x.wk>=WEEK),x=>x.amt);add('Week '+WEEK+' contributions received so far',cur,'from the payment ledger');
  add('SACCO standing orders, '+cw+' weeks',-cw*16500,'KSh16,500 a week to Transnational SACCO');
  add('Bank dividends (net), 31 Jan',sum(S.bank.filter(b=>b.cat=='Dividend'&&Y(b.d)),b=>b.amt),'');
  add('Expenses, incl. AGM 2 Jun',sum(S.bank.filter(b=>b.cat=='Expense'&&Y(b.d)),b=>b.amt),'');
  const lo=S.loans.filter(l=>l.ok&&Y(l.date));add('Loans given out in '+yr+' ('+lo.length+')',-sum(lo,l=>l.p),'');
  const hs=[];S.loans.forEach(l=>l.h.forEach(h=>{if(Y(h.d))hs.push(h)}));
  add('Loan principal repaid',sum(hs,h=>h.pr),'');add('Loan interest and fees received',sum(hs,h=>h.i+h.f),'first payment includes the KSh200 fee');
  add('Fines paid',sum(S.fines.filter(f=>f.st=='Paid'&&Y(f.d)),f=>f.a),'late contribution and meeting fines');
  const net=sum(L,x=>x.v),open=S.cfg.open==null?null:+S.cfg.open;
  return{L,net,open,implied:S.bal-net,expected:open==null?null:open+net,bal:S.bal,loans:book(),cw}}
function cashCheckView(){
  const d=cashCheck(),dif=d.expected==null?null:d.bal-d.expected;
  return`<div class="cd hero"><div class="k">Bank balance in the app</div><div class="v">${KSh(d.bal)}</div><div class="k">Outstanding loans ${KSh(d.loans)} · Cash plus loans ${KSh(d.bal+d.loans)}</div></div>
<div class="cd"><h3>Money in and out this year</h3>${d.L.map(x=>`<div class="ef" style="gap:.5rem"><span>${H(x.k)}${x.note?'<br><span class="mut">'+H(x.note)+'</span>':''}</span><b style="color:${x.v<0?'var(--rd)':'inherit'};white-space:nowrap">${x.v<0?'−':''}${KSh(Math.abs(x.v))}</b></div>`).join('')}<div class="ef"><b>Net movement this year</b><b>${d.net<0?'−':''}${KSh(Math.abs(d.net))}</b></div></div>
<div class="cd"><h3>What should be in the account</h3><label for="opn">Bank balance on 1 January ${today().slice(0,4)} (from your statement)</label><input id="opn" type="number" inputmode="decimal" value="${d.open==null?'':d.open}" placeholder="Enter the opening balance">${can('bank')?'<p style="margin-top:.6rem"><button class="btn s" onclick="setOpen()">Save opening balance</button></p>':''}
${d.expected==null?`<p class="mut" style="margin-top:.8rem">With this year's movement of ${d.net<0?'−':''}${KSh(Math.abs(d.net))}, the balance in the app is only right if the account held <b>${KSh(d.implied)}</b> on 1 January. Enter the real opening balance to check.</p>`:`<div class="ef" style="margin-top:.8rem"><span>Expected in the account</span><b>${KSh(d.expected)}</b></div><div class="ef"><span>Balance in the app</span><b>${KSh(d.bal)}</b></div><div class="ef"><b>Difference</b><b style="color:${Math.abs(dif)<1?'var(--g)':'var(--rd)'}">${dif<0?'−':''}${KSh(Math.abs(dif))}</b></div><p class="mut" style="margin-top:.5rem">${Math.abs(dif)<1?'The app agrees with what the account should hold.':dif<0?'The app shows less than expected. Check for a missing deposit or an unrecorded refund.':'The app shows more than expected. Check for a missing withdrawal or a payment recorded twice.'}</p>`}
<p class="mut" style="margin-top:.6rem">The Loan Kitty (${KSh(KIT)}) is part of this cash and the loans, not extra money. The SACCO shares (${KSh(ORD)}) are held at the SACCO, not in this account.</p></div>`}
function setOpen(){const v=$('opn').value;if(v==='')S.cfg.open=null;else S.cfg.open=+v;log('Treasurer set opening bank balance','1 Jan','—',v===''?'cleared':KSh(+v));save();render(1);toast('Saved')}

/* ---------------- phone numbers ---------------- */
function fPhone(id){
  if(!can('member')&&!can('report'))return toast('Your role cannot change phone numbers');
  const m=S.m.find(x=>x.id==id);
  sheet(`<h3>WhatsApp number</h3><p class="mut">${H(m.n)}. Used only to open a WhatsApp chat with this member.</p><label for="phn">Phone number</label><input id="phn" inputmode="tel" value="${showPhone(m.ph)}" placeholder="0712 345 678"><p style="margin-top:1rem"><button class="btn w" onclick="savePhone(${id})">Save</button></p>`)}
function savePhone(id){
  const m=S.m.find(x=>x.id==id),v=$('phn').value.trim();
  if(v&&!normPhone(v))return toast('Enter a Kenyan number like 0712 345 678');
  m.ph=normPhone(v);log('Updated member phone',m.n);save();closeSheet(1);render(1);toast('Saved')}
function memberExtra(m){
  const es=S.contribs.filter(c=>c.mid==m.id).sort(cmpE).reverse().slice(0,6);
  return`<div class="ef" style="margin-top:1rem"><span>WhatsApp</span><span>${m.ph?showPhone(m.ph):'<span class="mut">Not saved</span>'} ${can('member')||can('report')?`<button class="btn s o" onclick="fPhone(${m.id})">${m.ph?'Edit':'Add'}</button>`:''}</span></div>
<h3 style="margin-top:1rem">Recent payments</h3>${es.map(e=>`<div class="ef"><span>Week ${e.wk}<br><span class="mut">${when(e)}${e.ref?' · '+H(e.ref):''}</span></span><b>${KSh(e.amt)}</b></div>`).join('')||'<p class="mut">No payments recorded in the app yet.</p>'}
${can('report')?`<div class="qa np" style="margin-top:1rem"><button class="btn s" onclick="rptPdf('member',${m.id},'share')">Send statement on WhatsApp</button><button class="btn s o" onclick="rptPdf('member',${m.id},'dl')">Download PDF</button></div>`:''}`}

/* ---------------- reports ---------------- */
const RV={wk:null,mo:null};
const rvWk=d=>{RV.wk=Math.max(41,(RV.wk==null?WEEK:RV.wk)+d);render(1)};
const curMo=()=>RV.mo||today().slice(0,7);
function rvMo(d){const[y,m]=curMo().split('-').map(Number),x=new Date(Date.UTC(y,m-1+d,1));let s=isoD(x).slice(0,7);if(s<'2026-09')s='2026-09';RV.mo=s;render(1)}
const moName=ym=>MONL[+ym.slice(5,7)-1]+' '+ym.slice(0,4);
const inMo=(d,ym)=>d&&d.slice(0,7)==ym;
const who=()=>cap1(R);

function reportExt(r){
  if(r=='Weekly summary'||r=='Monthly summary'||r=='Member statements'){
    if(!can('report')){sheet(`<h3>${r}</h3><p class="mut">Reports are prepared and sent by the Chairman and the Treasurer.</p><p style="margin-top:1rem"><button class="btn w o" onclick="closeS()">Close</button></p>`);return true}
    if(r=='Weekly summary')weeklyPage();else if(r=='Monthly summary')monthlyPage();else membersPage();return true}
  return false}
function weeklyPage(){
  const w=RV.wk==null?WEEK:RV.wk,d=weekData(w);
  sheet(`<h3>Weekly summary</h3>
<div class="qa np"><button class="btn s o" onclick="rvWk(-1)" ${w<=41?'disabled':''}>‹ Earlier</button><b style="align-self:center;white-space:nowrap">Week ${w}</b><button class="btn s o" onclick="rvWk(1)">Later ›</button></div><p class="mut">${wkRange(w)}</p>
<div class="g4" style="margin:.6rem 0"><div class="cd"><div class="k">Collected</div><div class="vs">${KSh(d.col)}</div></div><div class="cd"><div class="k">Outstanding</div><div class="vs">${KSh(Math.max(0,d.exp-d.col))}</div></div><div class="cd"><div class="k">Fully paid</div><div class="vs">${d.npaid} of ${S.m.length}</div></div></div>
${d.rows.map(r=>`<div class="ef"><span>${H(r.m.n)}<br><span class="mut">${r.es.length?when(r.es[r.es.length-1])+(refsOf(r.es)?' · '+H(refsOf(r.es)):''):'No payment'}</span></span><span style="text-align:right"><b>${KSh(r.paid)}</b><br>${bd(r.st)}</span></div>`).join('')}
<div class="qa np" style="margin-top:1rem"><button class="btn s" onclick="rptPdf('week',${w},'share')">Send PDF on WhatsApp</button><button class="btn s o" onclick="rptPdf('week',${w},'dl')">Download PDF</button><button class="btn s o" onclick="waOpen(weekText(${w}))">Send text to group</button><button class="btn s o" onclick="sendEach('week',${w})">Send to each member</button></div>
<details style="margin-top:.6rem"><summary class="mut" style="cursor:pointer">WhatsApp message preview</summary><pre style="white-space:pre-wrap;font:inherit;margin:.5rem 0" class="mut">${H(weekText(w))}</pre></details>`)}
function monthlyPage(){
  const ym=curMo(),d=monthData(ym);
  sheet(`<h3>Monthly summary</h3>
<div class="qa np"><button class="btn s o" onclick="rvMo(-1)" ${ym<='2026-09'?'disabled':''}>‹ Earlier</button><b style="align-self:center;white-space:nowrap">${moName(ym)}</b><button class="btn s o" onclick="rvMo(1)">Later ›</button></div>
<div class="g4" style="margin:.6rem 0"><div class="cd"><div class="k">Contributions received</div><div class="vs">${KSh(d.contrib)}</div></div><div class="cd"><div class="k">Loans given out</div><div class="vs">${KSh(d.disb)}</div></div><div class="cd"><div class="k">Repayments received</div><div class="vs">${KSh(d.rep)}</div></div><div class="cd"><div class="k">Closing bank balance</div><div class="vs">${KSh(d.close)}</div></div></div>
${d.rows.map(r=>`<div class="ef"><span>${H(r.m.n)}<br><span class="mut">${r.es.length} payment${r.es.length==1?'':'s'}${r.wks.length?' · weeks '+r.wks.join(', '):''}</span></span><b>${KSh(r.tot)}</b></div>`).join('')}
<div class="qa np" style="margin-top:1rem"><button class="btn s" onclick="rptPdf('month','${ym}','share')">Send PDF on WhatsApp</button><button class="btn s o" onclick="rptPdf('month','${ym}','dl')">Download PDF</button><button class="btn s o" onclick="waOpen(monthText('${ym}'))">Send text to group</button><button class="btn s o" onclick="sendEach('month','${ym}')">Send to each member</button></div>`)}
function membersPage(){
  sheet(`<h3>Member statements</h3><p class="mut">One PDF per member. Send it straight to that member on WhatsApp, so members do not need an account.</p>${S.m.map(m=>`<div class="ef" style="gap:.4rem;flex-wrap:wrap;align-items:center"><span><b>${H(m.n)}</b><br><span class="mut">${m.ph?showPhone(m.ph):'No number saved'}</span></span><span><button class="btn s" onclick="rptPdf('member',${m.id},'share')">WhatsApp</button> <button class="btn s o" onclick="rptPdf('member',${m.id},'dl')">PDF</button></span></div>`).join('')}`)}
function sendEach(kind,arg){
  closeSheet(1);
  sheet(`<h3>Send to each member</h3><p class="mut">Each button opens WhatsApp with a personal message for that member. Members without a saved number are skipped until you add one.</p>${S.m.map(m=>`<div class="ef" style="gap:.4rem;flex-wrap:wrap;align-items:center"><span><b>${H(m.n)}</b><br><span class="mut">${m.ph?showPhone(m.ph):'No number saved'}</span></span>${m.ph?`<button class="btn s" onclick="waOpen(personalText('${kind}','${arg}',${m.id}),'${m.ph}')">Send</button>`:`<button class="btn s o" onclick="fPhone(${m.id})">Add number</button>`}</div>`).join('')}<p style="margin-top:1rem"><button class="btn w o" onclick="closeSheet(1)">Done</button></p>`)}

function monthData(ym){
  const es=S.contribs.filter(c=>inMo(c.d,ym)),rows=S.m.map(m=>{const e=es.filter(c=>c.mid==m.id).sort(cmpE);return{m,es:e,tot:e.reduce((s,c)=>s+c.amt,0),wks:e.map(c=>c.wk).filter((x,i,a)=>a.indexOf(x)==i)}});
  const disb=S.loans.filter(l=>l.ok&&inMo(l.date,ym)&&l.stage!='rej').reduce((s,l)=>s+l.p,0);
  const reps=[];S.loans.forEach(l=>l.h.forEach(h=>{if(inMo(h.d,ym))reps.push({l,h})}));
  const last=ym+'-31',after=S.bank.filter(b=>b.d>last).reduce((s,b)=>s+b.amt,0),inM=S.bank.filter(b=>inMo(b.d,ym)),close=S.bal-after;
  return{ym,rows,contrib:es.reduce((s,c)=>s+c.amt,0),disb,reps,rep:reps.reduce((s,x)=>s+x.h.f+x.h.i+x.h.pr,0),
    fines:S.fines.filter(f=>inMo(f.d,ym)),exps:S.bank.filter(b=>b.amt<0&&b.cat=='Expense'&&inMo(b.d,ym)),
    inn:inM.filter(b=>b.amt>0).reduce((s,b)=>s+b.amt,0),out:inM.filter(b=>b.amt<0).reduce((s,b)=>s+b.amt,0),close,open:close-inM.reduce((s,b)=>s+b.amt,0)}}

function weekText(w){
  const d=weekData(w),paid=d.rows.filter(r=>r.st=='Paid').map(r=>first(r.m.n)),un=d.rows.filter(r=>r.st!='Paid');
  const lb=book(),pl=pend().length;
  return`*AKIBA SMART - Week ${w} contributions*\n${wkRange(w)}\n\n✅ Paid (${paid.length}): ${paid.join(', ')||'none yet'}\n${un.length?`⏳ Not fully paid (${un.length}): ${un.map(r=>first(r.m.n)+(r.paid?' (KSh'+(WEEKLY-r.paid).toLocaleString('en-KE')+' short)':'')).join(', ')}\n`:''}\nCollected: ${KSh(d.col)} of ${KSh(d.exp)}\nLoan book: ${KSh(lb)}${pl?`\nLoan applications in progress: ${pl}`:''}\nCash in bank: ${KSh(S.bal)}\n\nThank you. - ${who()}\n_Working figures, subject to audit._`}
function monthText(ym){
  const d=monthData(ym);
  return`*AKIBA SMART - ${moName(ym)} summary*\n\nContributions received: ${KSh(d.contrib)}\nLoans given out: ${KSh(d.disb)}\nLoan repayments received: ${KSh(d.rep)}\nMoney in: ${KSh(d.inn)} · Money out: ${KSh(-d.out)}\nBank balance at month end: ${KSh(d.close)}\nLoan book now: ${KSh(book())}\n\nThank you. - ${who()}\n_Working figures, subject to audit._`}
function personalText(kind,arg,mid){
  const m=S.m.find(x=>x.id==mid);
  if(kind=='week'){const r=weekData(+arg).rows.find(x=>x.m.id==mid),w=+arg;
    return`Hello ${first(m.n)}, this is your AKIBA SMART update for week ${w} (${wkRange(w)}).\n\n${r.es.length?'You paid '+KSh(r.paid)+(r.es.length?' on '+when(r.es[r.es.length-1]):'')+(refsOf(r.es)?', ref '+refsOf(r.es):'')+'.':'We have not yet received your contribution for this week.'}${r.paid<WEEKLY?'\nBalance for the week: '+KSh(WEEKLY-r.paid)+'.':'\nYou are fully paid up for the week. Thank you.'}\n\n- ${who()}`}
  if(kind=='month'){const d=monthData(arg),r=d.rows.find(x=>x.m.id==mid);
    return`Hello ${first(m.n)}, your AKIBA SMART contributions for ${moName(arg)}: ${KSh(r.tot)} in ${r.es.length} payment${r.es.length==1?'':'s'}.\n\n- ${who()}`}
  return statementText(m)}
function statementText(m){
  const ls=S.loans.filter(l=>l.who==m.n&&l.ok),bal=ls.reduce((s,l)=>s+LI(l).pr,0);
  return`Hello ${first(m.n)}, here is your AKIBA SMART statement as at ${fdate(today(),1)}.\n\nThis week (week ${WEEK}): ${m.paid>=WEEKLY?'paid '+KSh(m.paid):'owing '+KSh(WEEKLY-m.paid)}\nLoan balance: ${KSh(bal)}\nOutstanding fines: ${KSh(m.fines)}\n\nYour full statement is attached.\n- ${who()}`}

/* ---------------- PDF builders ---------------- */
const C=()=>PDF.colors;
function mkDoc(title,short,sub){return new PDF.Doc({title,short,sub,foot:'AKIBA SMART  ·  Prepared by the '+who()+'  ·  Working figures, subject to audit',date:fdate(today(),1)})}
function pdfWeekly(w){
  const d=weekData(w),doc=mkDoc('Weekly Contribution Summary','Week '+w,'Week '+w+'  ·  '+wkRange(w)+'  ·  Weekly contribution KSh2,000 per member');
  doc.kpis([['Expected',KSh(d.exp)],['Collected',KSh(d.col)],['Outstanding',KSh(Math.max(0,d.exp-d.col)),d.col<d.exp?C().AMBER:C().GREEN2],['Members fully paid',d.npaid+' of '+S.m.length]]);
  doc.h2('Contributions by member');
  const col=s=>s=='Paid'?C().GREEN2:s=='Partial'?C().AMBER:C().RED;
  const rows=d.rows.map(r=>[r.m.id,r.m.n,{t:KSh(r.paid),b:true},r.es.length?when(r.es[r.es.length-1])+(r.es.length>1?' (+'+(r.es.length-1)+' more)':''):'-',refsOf(r.es)||'-',{t:r.st=='Pending'?'Unpaid':r.st,c:col(r.st),b:true}]);
  rows.push({cells:['','Total',KSh(d.col),'','',''],b:true,fill:C().SOFT});
  doc.table([{h:'No.',w:30,a:'c'},{h:'Member',w:140},{h:'Amount paid',w:78,a:'r'},{h:'Date and time paid',w:122},{h:'Reference code',w:100},{h:'Status',w:45}],rows);
  doc.h2('Loans');
  const lv=live().reduce((s,l)=>s+LI(l).mi,0);
  doc.kv([['Loan book (principal outstanding)',KSh(book())],['Interest due this month',KSh(lv)],['Loans in default',S.loans.filter(l=>LI(l).st=='Default').length+'']]);
  const p=pend();
  if(p.length){doc.p('Applications in progress',{bold:true,after:2});
    doc.table([{h:'Borrower',w:150},{h:'Amount',w:80,a:'r'},{h:'Stage',w:130},{h:'Member votes',w:155}],p.map(l=>{const c=vcount(l);return[l.who,KSh(l.p),LI(l).st,c.a+' of '+c.n+' approved'+(c.r?', '+c.r+' rejected':'')]}))}
  doc.h2('Other');
  doc.kv([['Cash in bank',KSh(S.bal)],['Outstanding fines',KSh(S.m.reduce((s,m)=>s+m.fines,0))]]);
  doc.note('Reference codes are taken from the bank and M-Pesa messages imported by the Treasurer. Payments after Sunday midnight carry a late fine of KSh225 for each day late; any amount above that is credited to the following week.');
  return doc}
function pdfMonthly(ym){
  const d=monthData(ym),doc=mkDoc('Monthly Summary','Month: '+moName(ym),moName(ym)+'  ·  Contributions by date received, loans and bank movement');
  doc.kpis([['Contributions received',KSh(d.contrib)],['Loans given out',KSh(d.disb)],['Repayments received',KSh(d.rep)],['Bank balance, month end',KSh(d.close)]]);
  doc.h2('Contributions by member');
  const rows=d.rows.map(r=>[r.m.id,r.m.n,r.es.length,r.wks.length?r.wks.join(', '):'-',{t:KSh(r.tot),b:true}]);
  rows.push({cells:['','Total',d.rows.reduce((s,r)=>s+r.es.length,0),'',KSh(d.contrib)],b:true,fill:C().SOFT});
  doc.table([{h:'No.',w:30,a:'c'},{h:'Member',w:190},{h:'Payments',w:70,a:'c'},{h:'Weeks credited',w:130},{h:'Amount received',w:95,a:'r'}],rows,{empty:'No contributions recorded in this month.'});
  doc.h2('Loans');
  doc.kv([['Loans given out in the month',KSh(d.disb)],['Repayments received (fees, interest, principal)',KSh(d.rep)],['Interest received',KSh(d.reps.reduce((s,x)=>s+x.h.i,0))],['Loan book now',KSh(book())]],{lw:230});
  if(d.reps.length)doc.table([{h:'Date',w:80},{h:'Borrower',w:170},{h:'Fee',w:60,a:'r'},{h:'Interest',w:70,a:'r'},{h:'Principal',w:70,a:'r'},{h:'Total',w:65,a:'r'}],d.reps.map(x=>[fdate(x.h.d),x.l.who,KSh(x.h.f),KSh(x.h.i),KSh(x.h.pr),{t:KSh(x.h.f+x.h.i+x.h.pr),b:true}]));
  const disbL=S.loans.filter(l=>l.ok&&inMo(l.date,ym));
  if(disbL.length){doc.p('Loans disbursed',{bold:true,after:2});doc.table([{h:'Date',w:80},{h:'Borrower',w:230},{h:'Amount',w:90,a:'r'},{h:'Matures',w:115}],disbL.map(l=>[fdate(l.date),l.who,KSh(l.p),fdate(isoD(LI(l).mat),1)]))}
  doc.h2('Fines and expenses');
  doc.kv([['Fines recorded',KSh(d.fines.reduce((s,f)=>s+f.a,0))+(d.fines.length?' ('+d.fines.length+')':'')],['Expenses',KSh(-d.exps.reduce((s,b)=>s+b.amt,0))]]);
  if(d.exps.length)doc.table([{h:'Date',w:80},{h:'Description',w:355},{h:'Amount',w:80,a:'r'}],d.exps.map(b=>[fdate(b.d),b.t,KSh(-b.amt)]));
  doc.h2('Bank');
  doc.kv([['Opening balance',KSh(d.open)],['Money in',KSh(d.inn)],['Money out',KSh(-d.out)],['Closing balance',KSh(d.close),C().GREEN2]]);
  doc.note('Contributions are grouped by the date the money arrived. The week column shows which contribution week each payment was credited to.');
  return doc}
function pdfMember(id){
  const m=S.m.find(x=>x.id==id),es=S.contribs.filter(c=>c.mid==id).sort((a,b)=>a.wk-b.wk||cmpE(a,b)),ls=S.loans.filter(l=>l.who==m.n&&l.stage!='rej'),
    doc=mkDoc('Member Statement',m.n,m.n+'  ·  Member no. '+m.id+'  ·  as at '+fdate(today(),1)),owe=ls.filter(l=>l.ok).reduce((s,l)=>s+LI(l).pr,0),tot=es.reduce((s,c)=>s+c.amt,0);
  doc.kpis([['Paid, recorded in app',KSh(tot)],['Week '+WEEK,m.paid>=WEEKLY?'Paid':'Owing '+KSh(WEEKLY-m.paid),m.paid>=WEEKLY?C().GREEN2:C().RED],['Loan balance',KSh(owe)],['Outstanding fines',KSh(m.fines)]]);
  doc.h2('Contributions');
  doc.table([{h:'Week',w:42,a:'c'},{h:'Credited for',w:120},{h:'Date and time paid',w:128},{h:'Reference code',w:105},{h:'Amount',w:70,a:'r'},{h:'Source',w:50}],
    es.map(e=>[e.wk,wkRange(e.wk).replace(/ 20\d\d$/,''),when(e),e.ref||'-',{t:KSh(e.amt),b:true},e.src=='Bank SMS'?'Bank':e.src=='Manual'?'Manual':'Record']).concat(es.length?[{cells:['','','','Total',KSh(tot),''],b:true,fill:C().SOFT}]:[]),{empty:'No contributions recorded in the app yet.'});
  doc.h2('Loans');
  if(!ls.length)doc.p('No loans.',{color:C().MUTE});
  else{doc.table([{h:'Date',w:62},{h:'Principal',w:75,a:'r'},{h:'Outstanding',w:80,a:'r'},{h:'Interest paid',w:75,a:'r'},{h:'Status',w:105},{h:'Matures',w:118}],
      ls.map(l=>{const i=LI(l);return[fdate(l.date,1),KSh(l.p),l.ok?KSh(i.pr):'-',KSh(i.ip),i.st,l.ok?fdate(isoD(i.mat),1):'-']}));
    const hs=[];ls.forEach(l=>l.h.forEach(h=>hs.push({l,h})));
    if(hs.length){doc.p('Repayments',{bold:true,after:2});doc.table([{h:'Date',w:80},{h:'Fee',w:80,a:'r'},{h:'Interest',w:100,a:'r'},{h:'Principal',w:100,a:'r'},{h:'Total',w:100,a:'r'}],hs.map(x=>[fdate(x.h.d,1),KSh(x.h.f),KSh(x.h.i),KSh(x.h.pr),{t:KSh(x.h.f+x.h.i+x.h.pr),b:true}]))}}
  const fs=S.fines.filter(f=>f.n==m.n);
  doc.h2('Fines');
  if(fs.length)doc.table([{h:'Date',w:80},{h:'Reason',w:255},{h:'Amount',w:90,a:'r'},{h:'Status',w:90}],fs.map(f=>[fdate(f.d,1),f.why,KSh(f.a),f.st]));else doc.p('No fines.',{color:C().MUTE});
  doc.h2('Shares');
  doc.kv([['Ordinary shares (indicative)',KSh(ORD/S.m.length)]],{lw:200});
  doc.note('Indicative share = group total divided by members. Individual share history has not been entered yet. Contributions paid before week 41 were kept outside this app and are not listed.');
  return doc}
function build(kind,arg){
  if(kind=='week')return{doc:pdfWeekly(+arg),name:'AKIBA-Week'+arg+'-summary.pdf',text:weekText(+arg)};
  if(kind=='month')return{doc:pdfMonthly(arg),name:'AKIBA-'+arg+'-monthly-summary.pdf',text:monthText(arg)};
  const m=S.m.find(x=>x.id==arg);return{doc:pdfMember(+arg),name:'AKIBA-'+m.n.replace(/\s+/g,'-')+'-statement.pdf',text:statementText(m),phone:m.ph}}
function rptPdf(kind,arg,mode){
  if(!can('report'))return toast('Reports are sent by the Chairman and the Treasurer');
  let b;try{b=build(kind,arg)}catch(e){console.error(e);return toast('Could not build the PDF')}
  const blob=b.doc.blob();log('Generated report PDF',b.name,'—',mode=='share'?'Shared':'Downloaded');
  if(mode=='dl'){dl(blob,b.name);toast('PDF saved')}else sharePdf(blob,b.name,b.text,b.phone)}

Object.assign(window,{cashCheck,cashCheckView,setOpen,instRows,overdueN,schedHtml,loanReminderText,meetingsView,meetingPage,fSpecial,saveSpecial,setAtt,closeMeeting,meetText,ensureMeetings,meetAttn,planPay,applyPay,lateDays,migrate,recompute,postContrib,allocWeeks,paidIn,wkOf,wkRange,fdate,normPhone,waOpen,dl,sharePdf,
  fImport,imFile,imRead,imSet,imPreview,imReview,contribView,vwk,closeWeek,
  castVote,restartVote,reopenVote,officerSign,rejectLoan,fDisburse,loanWA,fReplies,rpRead,rpApply,loanFlow,loanRecord,approvals,loanAttn,
  fPhone,savePhone,memberExtra,reportExt,RV,rvWk,rvMo,sendEach,weekText,monthText,personalText,statementText,rptPdf,build,weekData,monthData,
  COMMITTEE:{voteOf,voters,vcount,pend,TYPES,get IM(){return IM},get RP(){return RP}}});
})();
