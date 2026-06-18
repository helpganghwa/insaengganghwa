import sharp from 'sharp';
const base='public/sprites-test/anim-obj';
const sets:[string,string[]][]=[
 ['13_masque',['kingdom_masque_saber','kingdom_masque_gown','kingdom_masque_mask']],
 ['14_oracle',['marsh_oracle_khopesh','marsh_oracle_shawl','marsh_oracle_orb']],
 ['15_dancer',['volcano_dancer_daggers','volcano_dancer_cape','volcano_dancer_fan']],
 ['16_clock',['temple_clock_blade','temple_clock_shield','temple_clock_watch']],
 ['17_papillon',['angel_papillon_rapier','angel_papillon_gown','angel_papillon_brooch']],
 ['18_drum',['orc_drum_maul','orc_drum_shield','orc_drum_horn']],
];
for(const [name,keys] of sets){const comps=await Promise.all(keys.map(async(k,i)=>({input:await sharp(`${base}/${k}/idle.png`).resize(192,192,{fit:'contain',background:{r:30,g:30,b:38,alpha:1}}).png().toBuffer(),left:i*192,top:0})));await sharp({create:{width:576,height:192,channels:4,background:{r:30,g:30,b:38,alpha:1}}}).composite(comps).png().toFile(`/tmp/set_${name}.png`);}
console.log('montage3 done');
