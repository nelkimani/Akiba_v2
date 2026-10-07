/* AKIBA SMART - tiny dependency-free PDF writer (A4, Helvetica + Helvetica-Bold, WinAnsi).
   Works offline. Character widths come from the Helvetica AFM tables below (units per 1000 em),
   which lets us wrap, right-align and truncate text exactly without any library. */
(function(root){
'use strict';
// widths for ASCII 32..126
const W1=[278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
const W2=[278,333,474,556,556,889,722,238,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,333,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584];
// WinAnsi extras: char -> [byte, regular width, bold width]
const EX={'·':[0xB7,278,278],'–':[0x96,556,556],'—':[0x97,1000,1000],'•':[0x95,350,350],'‘':[0x91,222,278],'’':[0x92,222,278],'“':[0x93,333,500],'”':[0x94,333,500],' ':[0xA0,278,278],'é':[0xE9,556,556],'…':[0x85,1000,1000]};
// characters we cannot draw are swapped for a readable ASCII stand-in
const SUB={'−':'-','→':'->','←':'<-','≈':'~','✓':'Yes','✔':'Yes','✗':'No','×':'x','≥':'>=','≤':'<=','›':'>','‹':'<','\t':' ','\n':' ','\r':' '};
function code(ch){
  if(SUB[ch]!==undefined)return null;
  const c=ch.charCodeAt(0);
  if(c>=32&&c<=126)return c;
  if(EX[ch])return EX[ch][0];
  return 63; // '?'
}
function clean(s){s=String(s==null?'':s);let o='';for(const ch of s)o+=SUB[ch]!==undefined?SUB[ch]:ch;return o}
function cw(ch,bold){
  const c=ch.charCodeAt(0);
  if(c>=32&&c<=126)return(bold?W2:W1)[c-32];
  if(EX[ch])return bold?EX[ch][2]:EX[ch][1];
  return 556;
}
function width(s,size,bold){s=clean(s);let w=0;for(const ch of s)w+=cw(ch,bold);return w*size/1000}
function fit(s,w,size,bold){ // truncate with "..." so the text fits in w points
  s=clean(s);if(width(s,size,bold)<=w)return s;
  const dots='...',dw=width(dots,size,bold);let o='';
  for(const ch of s){if(width(o+ch,size,bold)+dw>w)break;o+=ch}
  return o.replace(/\s+$/,'')+dots}
function wrap(s,w,size,bold){
  s=clean(s);const out=[];
  s.split(/\n/).forEach(par=>{
    let line='';
    par.split(' ').forEach(word=>{
      if(!word&&!line)return;
      const t=line?line+' '+word:word;
      if(width(t,size,bold)<=w){line=t;return}
      if(line)out.push(line);
      if(width(word,size,bold)<=w){line=word;return}
      let piece='';for(const ch of word){if(width(piece+ch,size,bold)>w){out.push(piece);piece=ch}else piece+=ch}
      line=piece});
    out.push(line)});
  return out}
function esc(s){let o='';for(const ch of clean(s)){const c=code(ch);if(c===40||c===41||c===92)o+='\\'+String.fromCharCode(c);else o+=String.fromCharCode(c)}return o}
const n2=v=>(Math.round(v*100)/100).toString();
const rgb=c=>c.map(n2).join(' ');
const GREEN=[.055,.231,.2],GREEN2=[.055,.42,.322],INK=[.09,.13,.12],MUTE=[.41,.46,.44],LINE=[.85,.88,.87],SOFT=[.93,.96,.95],AMBER=[.66,.42,0],RED=[.7,.15,.12];

function Doc(o){
  o=o||{};this.title=o.title||'Report';this.short=o.short||this.title;this.sub=o.sub||'';this.foot=o.foot||'AKIBA SMART';this.date=o.date||'';
  this.W=595;this.H=842;this.M=40;this.top=54;this.bot=800;
  this.pages=[];this.cs=null;this.y=0;this.newPage(true);
}
const P=Doc.prototype;
P.newPage=function(first){
  this.cs=[];this.pages.push(this.cs);
  // running header bar
  this.rect(0,0,this.W,34,GREEN);
  this.text(this.M,10,'AKIBA SMART',12,true,[1,1,1]);
  this.text(this.W-this.M,12,this.short,9,false,[.8,.9,.86],'r');
  this.y=this.top;
  if(first){
    this.text(this.M,this.y,this.title,20,true,INK);this.y+=26;
    if(this.sub){wrap(this.sub,this.W-2*this.M,10,false).forEach(l=>{this.text(this.M,this.y,l,10,false,MUTE);this.y+=14})}
    this.y+=8}
};
P.ensure=function(h){if(this.y+h>this.bot)this.newPage(false)};
// y is the TOP of the text box; baseline sits ~0.8em lower
P.text=function(x,y,s,size,bold,color,align,w){
  s=String(s==null?'':s);
  let px=x;
  if(align==='r')px=x-width(s,size,bold);else if(align==='c')px=x-width(s,size,bold)/2;
  this.cs.push('BT /'+(bold?'F2':'F1')+' '+n2(size)+' Tf '+rgb(color||INK)+' rg '+n2(px)+' '+n2(this.H-y-size*.82)+' Td ('+esc(s)+') Tj ET');
};
P.rect=function(x,y,w,h,fill,stroke){
  if(fill)this.cs.push(rgb(fill)+' rg '+n2(x)+' '+n2(this.H-y-h)+' '+n2(w)+' '+n2(h)+' re f');
  if(stroke)this.cs.push(rgb(stroke)+' RG 0.6 w '+n2(x)+' '+n2(this.H-y-h)+' '+n2(w)+' '+n2(h)+' re S');
};
P.hline=function(x1,x2,y,color,lw){this.cs.push(rgb(color||LINE)+' RG '+n2(lw||.6)+' w '+n2(x1)+' '+n2(this.H-y)+' m '+n2(x2)+' '+n2(this.H-y)+' l S')};
P.space=function(h){this.y+=h;return this};
P.h2=function(s){this.ensure(34);this.y+=8;this.text(this.M,this.y,s,12.5,true,GREEN2);this.y+=18;this.hline(this.M,this.W-this.M,this.y-2,GREEN2,.8);this.y+=6;return this};
P.p=function(s,o){o=o||{};const size=o.size||9.5,bold=!!o.bold,lh=size*1.45;
  wrap(s,this.W-2*this.M-(o.indent||0),size,bold).forEach(l=>{this.ensure(lh);this.text(this.M+(o.indent||0),this.y,l,size,bold,o.color||INK);this.y+=lh});
  this.y+=o.after==null?3:o.after;return this};
P.note=function(s){return this.p(s,{size:8,color:MUTE,after:2})};
P.kpis=function(items){ // [[label,value],...]
  const gap=8,n=items.length,w=(this.W-2*this.M-gap*(n-1))/n,h=48;this.ensure(h+8);
  items.forEach((it,i)=>{const x=this.M+i*(w+gap);this.rect(x,this.y,w,h,SOFT);
    this.text(x+9,this.y+8,fit(it[0],w-18,8,false),8,false,MUTE);
    this.text(x+9,this.y+23,fit(it[1],w-18,14,true),14,true,it[2]||INK)});
  this.y+=h+10;return this};
P.kv=function(rows,o){o=o||{};const lw=o.lw||170;rows.forEach(r=>{this.ensure(16);this.text(this.M,this.y,r[0],9.5,false,MUTE);this.text(this.M+lw,this.y,fit(r[1],this.W-2*this.M-lw,9.5,true),9.5,true,r[2]||INK);this.y+=15});this.y+=4;return this};
// cols: [{h:'Name',w:140,a:'l'|'r'|'c'}] ; rows: arrays of cell strings or {t,c,b}; a row may be {cells:[...],b:true,fill:[..]}
P.table=function(cols,rows,o){
  o=o||{};const rh=o.rh||17,size=o.size||8.5;
  const total=cols.reduce((s,c)=>s+c.w,0),scale=Math.min(1,(this.W-2*this.M)/total);
  const ws=cols.map(c=>c.w*scale);
  const head=()=>{this.rect(this.M,this.y,ws.reduce((a,b)=>a+b,0),rh+2,GREEN);let x=this.M;
    cols.forEach((c,i)=>{const pad=5,tx=c.a==='r'?x+ws[i]-pad:c.a==='c'?x+ws[i]/2:x+pad;this.text(tx,this.y+5,fit(c.h,ws[i]-2*pad,size,true),size,true,[1,1,1],c.a)
      ;x+=ws[i]});this.y+=rh+2};
  this.ensure(rh*3+4);head();
  if(!rows.length){this.ensure(rh);this.text(this.M+5,this.y+4,o.empty||'No records.',size,false,MUTE);this.y+=rh;this.hline(this.M,this.M+ws.reduce((a,b)=>a+b,0),this.y);this.y+=6;return this}
  rows.forEach((r,ri)=>{
    if(this.y+rh>this.bot){this.newPage(false);head()}
    const ro=Array.isArray(r)?{}:r,cells=ro.cells||r;let x=this.M;
    if(ro.fill)this.rect(this.M,this.y,ws.reduce((a,b)=>a+b,0),rh,ro.fill);else if(ri%2)this.rect(this.M,this.y,ws.reduce((a,b)=>a+b,0),rh,[.975,.985,.98]);
    cols.forEach((c,i)=>{let cell=cells[i];const co=cell&&typeof cell==='object'?cell:null,t=co?co.t:cell,col=co&&co.c||ro.c,bold=co&&co.b!==undefined?co.b:!!ro.b,pad=5;
      const tx=c.a==='r'?x+ws[i]-pad:c.a==='c'?x+ws[i]/2:x+pad;
      this.text(tx,this.y+4.5,fit(t==null?'':t,ws[i]-2*pad,size,bold),size,bold,col||INK,c.a);x+=ws[i]});
    this.y+=rh;this.hline(this.M,this.M+ws.reduce((a,b)=>a+b,0),this.y)});
  this.y+=8;return this};
P.build=function(){
  const N=this.pages.length;
  // footers now that the page count is known
  this.pages.forEach((cs,i)=>{this.cs=cs;
    this.hline(this.M,this.W-this.M,812,LINE);
    this.text(this.M,818,this.foot+(this.date?'  ·  Generated '+this.date:''),7.5,false,MUTE);
    this.text(this.W-this.M,818,'Page '+(i+1)+' of '+N,7.5,false,MUTE,'r')});
  const objs=[];let s='%PDF-1.4\n%âãÏÓ\n';const off=[0];
  const add=body=>{objs.push(body)};
  add('<< /Type /Catalog /Pages 2 0 R >>');
  const kids=this.pages.map((_,i)=>(5+i*2)+' 0 R').join(' ');
  add('<< /Type /Pages /Kids ['+kids+'] /Count '+N+' >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  this.pages.forEach((cs,i)=>{
    const pid=5+i*2,cid=pid+1,stream=cs.join('\n');
    add('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 '+this.W+' '+this.H+'] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents '+cid+' 0 R >>');
    add('<< /Length '+stream.length+' >>\nstream\n'+stream+'\nendstream')});
  const info=objs.length+1;
  add('<< /Title ('+esc(this.title)+') /Producer (AKIBA SMART) /Creator (AKIBA SMART) >>');
  objs.forEach((b,i)=>{off.push(s.length);s+=(i+1)+' 0 obj\n'+b+'\nendobj\n'});
  const xr=s.length;
  s+='xref\n0 '+(objs.length+1)+'\n0000000000 65535 f \n'+off.slice(1).map(o=>String(o).padStart(10,'0')+' 00000 n \n').join('');
  s+='trailer\n<< /Size '+(objs.length+1)+' /Root 1 0 R /Info '+info+' 0 R >>\nstartxref\n'+xr+'\n%%EOF\n';
  const u=new Uint8Array(s.length);for(let i=0;i<s.length;i++)u[i]=s.charCodeAt(i)&255;
  return u};
P.blob=function(){return new Blob([this.build()],{type:'application/pdf'})};

const API={Doc,width,fit,wrap,clean,colors:{GREEN,GREEN2,INK,MUTE,LINE,SOFT,AMBER,RED}};
if(typeof module!=='undefined'&&module.exports)module.exports=API;else root.PDF=API;
})(typeof self!=='undefined'?self:this);
