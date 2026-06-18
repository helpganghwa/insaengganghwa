import sharp from 'sharp';
const base='public/sprites-test/anim-obj';
const sets:[string,string[]][]=[
 ['19_falcon',['kingdom_falcon_claw','kingdom_falcon_bracer','kingdom_falcon_hood']],
 ['20_angler',['marsh_angler_harpoon','marsh_angler_cape','marsh_angler_creel']],
 ['21_meteor',['volcano_meteor_flail','volcano_meteor_pauldron','volcano_meteor_earring']],
 ['22_monk',['temple_monk_staff','temple_monk_sash','temple_monk_censer']],
 ['23_penitent',['angel_penitent_sickle','angel_penitent_drape','angel_penitent_cuff']],
 ['24_hunter',['orc_hunter_boomerang','orc_hunter_boots','orc_hunter_earring']],
];
for(const [name,keys] of sets){const comps=await Promise.all(keys.map(async(k,i)=>({input:await sharp(`${base}/${k}/idle.png`).resize(192,192,{fit:'contain',background:{r:30,g:30,b:38,alpha:1}}).png().toBuffer(),left:i*192,top:0})));await sharp({create:{width:576,height:192,channels:4,background:{r:30,g:30,b:38,alpha:1}}}).composite(comps).png().toFile(`/tmp/set_${name}.png`);}
console.log('montage4 done');
