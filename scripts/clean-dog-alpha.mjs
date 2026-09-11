import sharp from 'sharp';
import { copyFile } from 'node:fs/promises';
// User-authorized local cleanup: isolate the silver mark from its navy background.
const {data,info} = await sharp('public/brand/argos-dog-logo.png').removeAlpha().raw().toBuffer({resolveWithObject:true});
const {width:w,height:h}=info;
const mask=Buffer.alloc(w*h);
for(let i=0;i<w*h;i++) mask[i]=data[i*3]>110 ? 255 : 0;
const labels=new Int32Array(w*h); let label=0; const sizes=[0];
for(let i=0;i<mask.length;i++) { if(!mask[i]||labels[i])continue; const queue=[i]; labels[i]=++label; let n=0;
 while(n<queue.length){const p=queue[n++],x=p%w,y=Math.floor(p/w);for(const q of [x>0?p-1:-1,x<w-1?p+1:-1,y>0?p-w:-1,y<h-1?p+w:-1])if(q>=0&&mask[q]&&!labels[q]){labels[q]=label;queue.push(q);}}
 sizes[label]=queue.length;
}
for(let i=0;i<mask.length;i++) if(sizes[labels[i]]<50)mask[i]=0;
const alpha=await sharp(mask,{raw:{width:w,height:h,channels:1}}).blur(0.65).toColourspace('b-w').raw().toBuffer();
const out=Buffer.alloc(w*h*4);
for(let i=0;i<w*h;i++){const a=alpha[i];if(!a)continue;let p=i; if(data[i*3]<175){const x=i%w,y=Math.floor(i/w);let best=1e9;
 for(let dy=-4;dy<=4;dy++)for(let dx=-4;dx<=4;dx++){const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const q=ny*w+nx,d=dx*dx+dy*dy;if(data[q*3]>=175&&mask[q]&&d<best){p=q;best=d;}}
 }for(let c=0;c<3;c++)out[i*4+c]=data[p*3+c];out[i*4+3]=a;}
await sharp(out,{raw:{width:w,height:h,channels:4}}).png().toFile('public/brand/argos-dog-transparent.png');
await copyFile('public/brand/argos-dog-transparent.png','../Argos Bot Transparent.png');
console.log('Saved clean RGBA dog. Retained component areas:',sizes.filter(x=>x>=50));



