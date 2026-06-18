import sharp from 'sharp';
const {data,info}=await sharp('public/sprites-test/anim-obj/os_staff/4.png').ensureAlpha().raw().toBuffer({resolveWithObject:true});
const W=info.width,H=info.height,C=info.channels;let o='';
for(let y=H-16;y<H;y++){let n=0;for(let x=0;x<W;x++)if(data[(y*W+x)*C+3]>40)n++;o+=`${n} `;}
console.log(o);
