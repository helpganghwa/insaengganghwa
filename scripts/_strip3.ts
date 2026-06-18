import sharp from 'sharp';
const d='public/sprites-test/anim-obj/os_staff';
const comps=await Promise.all([0,4,8,12].map(async(f,i)=>({input:await sharp(`${d}/${f}.png`).png().toBuffer(),left:i*192,top:0})));
await sharp({create:{width:768,height:192,channels:4,background:{r:40,g:40,b:48,alpha:1}}}).composite(comps).png().toFile('/tmp/osstaff.png');
// 하단 행별 불투명 픽셀수(가로줄 탐지)
const {data,info}=await sharp(`${d}/4.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;
let out='';
for(let y=H-20;y<H;y++){let n=0;for(let x=0;x<W;x++){if(data[(y*W+x)*C+3]>40)n++;}out+=`y${y}:${n} `;}
console.log(out);
