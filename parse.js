/* AKIBA SMART - bank / M-Pesa message parser.
   Pure functions, no DOM. Paste any mix of SMS texts (M-Pesa, Paybill, Equity, KCB, Co-op, generic bank alerts);
   returns one row per message with amount, reference code, date, time, sender and the matched member. */
(function(root){
'use strict';
const MONS={jan:1,feb:2,mar:3,apr:4,may:5,jun:6,jul:7,aug:8,sep:9,oct:10,nov:11,dec:12};
const pad=n=>String(n).padStart(2,'0');
const AMTRE=/\b(?:KSHS?|KES|KS)(?![A-Za-z])\.?\s*:?\s*(\d[\d,]*(?:\.\d{1,2})?)/i;
const dec=s=>s.replace(/&quot;/g,'"').replace(/&apos;/g,"'").replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#10;|&#13;/g,' ').replace(/&amp;/g,'&');

function split(text){
  text=String(text||'').replace(/\r/g,'');
  if(/<sms\b/i.test(text)){ // "SMS Backup & Restore" XML export
    const out=[];text.replace(/<sms\b[^>]*?\bbody="([^"]*)"/gi,(m,b)=>{out.push(dec(b).trim())});return out.filter(Boolean)}
  const out=[];
  text.split(/\n\s*\n+/).map(s=>s.trim()).filter(Boolean).forEach(block=>{
    const ls=block.split('\n').map(s=>s.trim()).filter(Boolean),withAmt=ls.filter(l=>AMTRE.test(l));
    if(ls.length>1&&withAmt.length>1&&withAmt.length>=ls.length*.8)ls.forEach(l=>out.push(l));else out.push(ls.join(' '))});
  return out}

const isDateTok=s=>/^\d{1,2}[A-Z]{3}\d{2,4}$/i.test(s);
function findRef(t){
  let m=t.match(/\b(?:ref(?:erence)?(?:\s*(?:no|number|id|code))?|txn(?:\s*id)?|trans(?:action)?\s*(?:id|no|ref|code)|conf(?:irmation)?\s*code|receipt(?:\s*no)?|code)\b\.?\s*[:#=\-]?\s*([A-Z0-9][A-Z0-9\-]{5,19})\b/i);
  if(m&&/\d/.test(m[1])&&!isDateTok(m[1]))return m[1].toUpperCase();
  m=t.match(/^\s*([A-Z0-9]{10})\s+confirmed/i);if(m)return m[1].toUpperCase();
  m=t.match(/\b(?=[A-Z0-9]*\d)(?=[A-Z0-9]*[A-Z])[A-Z0-9]{8,14}\b/);
  if(m&&!isDateTok(m[0]))return m[0];
  return ''}

function findDate(t,today){
  let m=t.match(/\b(20\d\d)-(\d{2})-(\d{2})\b/);
  if(m&&ok(+m[1],+m[2],+m[3]))return m[1]+'-'+m[2]+'-'+m[3];
  const re1=/\b(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})\b/g;
  while((m=re1.exec(t))){let d=+m[1],mo=+m[2],y=+m[3];if(y<100)y+=2000;if(mo>12&&d<=12)[d,mo]=[mo,d];if(ok(y,mo,d))return y+'-'+pad(mo)+'-'+pad(d)}
  const re2=/\b(\d{1,2})(?:st|nd|rd|th)?[\s\-]?([A-Za-z]{3})[a-z]*\.?[\s\-,]*(\d{2,4})\b/g;
  while((m=re2.exec(t))){const mo=MONS[m[2].toLowerCase()];if(!mo)continue;let y=+m[3];if(y<100)y+=2000;if(ok(y,mo,+m[1]))return y+'-'+pad(mo)+'-'+pad(+m[1])}
  const re3=/\b([A-Za-z]{3})[a-z]*\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/g;
  while((m=re3.exec(t))){const mo=MONS[m[1].toLowerCase()];if(mo&&ok(+m[3],mo,+m[2]))return m[3]+'-'+pad(mo)+'-'+pad(+m[2])}
  return ''}
function ok(y,m,d){if(y<2000||y>2100||m<1||m>12||d<1||d>31)return false;const x=new Date(Date.UTC(y,m-1,d));return x.getUTCMonth()===m-1}
function findTime(t){
  const m=t.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*([AaPp])\.?[Mm]?\.?(?![A-Za-z])|\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  if(!m)return'';
  let h,mi,ap;if(m[1]!==undefined){h=+m[1];mi=+m[2];ap=m[3]}else{h=+m[4];mi=+m[5]}
  if(ap){ap=ap.toLowerCase();if(ap==='p'&&h<12)h+=12;if(ap==='a'&&h===12)h=0}
  if(h>23||mi>59)return'';return pad(h)+':'+pad(mi)}
function phoneOf(t){const m=t.match(/(?:\+?254|\b0)([71]\d{8})\b/);return m?'254'+m[1]:''}
const STOP=/\s+(?:\+?254\d{6,}|0[17]\d{6,}|\d{7,})|\s+\d{3,4}\*+\d*|\s+on\s+\d|\s+on\s+[A-Za-z]{3}\b|\s+at\s+\d|\s+(?:ref|acc|account|a\/c|new|via|narr|trans|bal|being|for|id|date)\b|[.,;:(]|\s+-\s|$/i;
function findName(t){
  const cands=[/\bfrom\s+/i,/\b(?:paid\s+)?by\s+/i,/\b(?:sender|narrative|narration|details|remitter|payer)\s*[:\-]\s*/i];
  for(const c of cands){
    const m=c.exec(t);if(!m)continue;
    let rest=t.slice(m.index+m[0].length).replace(/^(?:\+?254|0)?\d[\d\s*]{6,}\s*[-–:]?\s*/,'');
    const cut=rest.search(STOP);const name=(cut>=0?rest.slice(0,cut):rest).replace(/[^A-Za-z '\-]/g,' ').replace(/\s+/g,' ').replace(/\s+(?:weekly|contribution|contributions|savings|chama|shares?|akiba|payment|deposit)\b.*$/i,'').trim();
    if(name.length>=3&&!/^(?:the|your|you|account|a\/c|acc)$/i.test(name))return name}
  return''}

function kindOf(t){
  const bal=t.search(/\b(?:new|available|actual|current|ledger|book)?\s*(?:m-?pesa|utility|working|account|acc|a\/c)?\s*balance\b/i),head=bal>0?t.slice(0,bal):t;
  const cr=/\b(received|credited|deposit(?:ed)?|credit)\b/i.test(head),out=/\b(sent to|debited|withdraw(?:n|al)?|paid to|purchase|bought|airtime|you have paid|transferred to)\b/i.test(head);
  return{head,kind:cr&&!out?'credit':out?'debit':cr?'credit':'unknown'}}
function findAmount(head){
  let m=head.match(AMTRE);
  if(!m)m=head.match(/\bamount\s*[:\-]?\s*(\d[\d,]*(?:\.\d\d)?)/i);
  return m?parseFloat(m[1].replace(/,/g,'')):0}

const tok=s=>String(s||'').toUpperCase().replace(/[^A-Z ]/g,' ').split(/\s+/).filter(x=>x.length>1);
const nkey=s=>'n:'+tok(s).sort().join(' ');
function matchMember(name,ph,members,alias){
  alias=alias||{};
  if(ph&&alias['p:'+ph])return{id:alias['p:'+ph],conf:'ok'};
  const nk=nkey(name);if(name&&alias[nk])return{id:alias[nk],conf:'ok'};
  if(ph){const m=members.find(x=>x.ph&&x.ph===ph);if(m)return{id:m.id,conf:'ok'}}
  const st=tok(name);if(!st.length)return{id:0,conf:'none'};
  let best=0,ids=[];
  members.forEach(m=>{const mt=tok(m.n),sc=st.filter(x=>mt.includes(x)).length;if(sc>best){best=sc;ids=[m.id]}else if(sc===best&&sc>0)ids.push(m.id)});
  if(best>=2&&ids.length===1)return{id:ids[0],conf:'ok'};
  if(best===1){ // a single shared name is only trusted if that name belongs to exactly one member
    const shared=st.filter(x=>members.some(m=>tok(m.n).includes(x)));
    const owners=members.filter(m=>shared.some(x=>tok(m.n).includes(x)));
    if(owners.length===1)return{id:owners[0].id,conf:'likely'}}
  return{id:0,conf:'none',maybe:ids}}

/* parse(text,{members:[{id,n,ph}],alias:{},seen:{ref:1},today:'YYYY-MM-DD'}) */
function parse(text,o){
  o=o||{};const members=o.members||[],alias=o.alias||{},seen=o.seen||{},today=o.today||'',rows=[],inBatch={};
  split(text).forEach((raw,i)=>{
    const k=kindOf(raw),amt=findAmount(k.head);
    if(!amt&&k.kind==='unknown')return; // not a money message at all
    const ref=findRef(raw),name=findName(raw),ph=phoneOf(raw),d=findDate(raw,today),t=findTime(raw),mm=k.kind==='credit'?matchMember(name,ph,members,alias):{id:0,conf:'none'};
    const row={n:i,raw,amt,kind:k.kind,ref,name,ph,d:d||today,dMissing:!d,t,mid:mm.id,conf:mm.conf,maybe:mm.maybe||[],dup:false,warn:[]};
    const fp=ref?'r:'+ref:'f:'+[amt,d,t,nkey(name)].join('|');
    if((ref&&seen[ref])||(!ref&&seen[fp])||inBatch[fp]){row.dup=true;row.warn.push('Already imported')}
    inBatch[fp]=1;
    if(!ref)row.warn.push('No reference code found');
    if(!d)row.warn.push('No date in message - using today');
    if(k.kind==='credit'&&!mm.id)row.warn.push(name?'Sender "'+name+'" not matched to a member':'Sender name not found');
    if(mm.conf==='likely')row.warn.push('Matched on a single name - please check');
    if(k.kind==='unknown')row.warn.push('Could not tell if money came in or went out');
    row.fp=fp;
    // default action: c = contribution, x = skip
    row.type=k.kind==='credit'&&mm.id&&!row.dup&&amt>0?'c':'x';
    rows.push(row)});
  return rows}

const API={parse,split,findRef,findDate,findTime,findName,findAmount,matchMember,nkey,tok,phoneOf,kindOf};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.BANKPARSE=API;
})(typeof self!=='undefined'?self:this);
