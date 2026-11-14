const fs=require('fs'),path=require('path');
const {LogParser}=require('../core/logparser');const {locate}=require('../core/ranks');
const dir=process.argv[2],seen=new Set(),S=[];
for(const f of fs.readdirSync(dir).filter(f=>/^Launch.*\.log$/.test(f))){const p=new LogParser({onSample:s=>{const k=s.time+'|'+s.mu;if(!seen.has(k)){seen.add(k);S.push(s)}}});p.feedText(fs.readFileSync(path.join(dir,f),'utf8'));}
S.sort((a,b)=>a.ts-b.ts);
const by={};for(const s of S){(by[s.playlist+'/t'+s.tier]??=[]).push(s.mmr)}
for(const [k,v] of Object.entries(by))console.log(k,'n='+v.length,'min',Math.min(...v),'max',Math.max(...v));
let prev=null;for(const s of S){if(prev&&prev.playlist===s.playlist&&prev.tier!==s.tier)console.log('CHANGEMENT de tier',prev.time,'->',s.time,'playlist',s.playlist,'tier',prev.tier,'->',s.tier,'mmr',prev.mmr,'->',s.mmr);prev=s}
let mis=0;for(const s of S){if(s.playlist===11&&locate(s.mmr).tier!==s.tier)mis++}console.log('2v2 relevés où le tier de la table != tier du journal:',mis);

