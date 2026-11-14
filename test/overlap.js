const {locate}=require('../core/ranks');const {computeView}=require('../core/view');
const mk=(mmr,tier,t)=>({time:'2026-11-14 10:0'+t+':00',ts:Date.parse('2026-11-14T10:0'+t+':00'),mu:0,mmr,tier,playlist:11,partySize:1});
// Cas du chevauchement : Diamond III (tier 15) avec un MMR déjà dans la plage de Champion I
for (const [m,t] of [[1066,15],[1066,16],[1074,15],[1075,16]]) { const v=computeView([mk(m,t,1)],{playlist:11}); console.log('mmr',m,'tier journal',t,'=>',v.tierName,v.division,'| monter',v.toUp,'| descendre',v.toDown,'| zone',v.zone); }
