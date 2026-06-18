import sharp from 'sharp';
const d='public/sprites-test/anim-obj/kingdom_falcon_hood';
const W=192,H=192;
for(const f of ['idle',...Array.from({length:15},(_,i)=>String(i))]){
 const {data}=await sharp(`${d}/${f}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 let cl=0;
 for(let y=0;y<62;y++)for(let x=0;x<60;x++){const p=(y*W+x)*4;if(data[p+3]){data[p+3]=0;cl++;}}
 await sharp(data,{raw:{width:W,height:H,channels:4}}).png().toFile(`${d}/${f}.png`);
}
console.log('falcon_hood top-left corner cleared');
