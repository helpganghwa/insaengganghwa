import sharp from 'sharp';
const d='public/sprites-test/anim-obj/kingdom_falcon_hood';
for(const f of ['idle','0','4','8']){
 const {data,info}=await sharp(`${d}/${f}.png`).ensureAlpha().raw().toBuffer({resolveWithObject:true});
 const W=info.width,H=info.height,C=info.channels;
 // 좌상단 사분면 박스: x<80,y<80 의 불투명 픽셀 bbox
 let t=H,b=-1,l=W,r=-1,n=0;
 for(let y=0;y<90;y++)for(let x=0;x<90;x++){if(data[(y*W+x)*C+3]>40){n++;if(y<t)t=y;if(y>b)b=y;if(x<l)l=x;if(x>r)r=x;}}
 console.log(`${f}: 좌상단 opaque=${n} bbox=(${l},${t})-(${r},${b})`);
}
