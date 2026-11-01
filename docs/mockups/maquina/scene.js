// Bed + wavy vase in a fake iso projection. opts: {bed:[w,d], offset:[x,y], h, layers, amp, lobes, cx, cy, scale, out}
function drawScene(o){
  const c=document.getElementById('stage');c.width=1440;c.height=900;const g=c.getContext('2d');
  const az=-0.6,el=0.5,s=o.scale||2.3,cx=o.cx||720,cy=o.cy||520;
  const P=(x,y,z)=>{const X=x*Math.cos(az)-y*Math.sin(az),Y=x*Math.sin(az)+y*Math.cos(az);return[cx+X*s,cy-(z*Math.cos(el)-Y*Math.sin(el))*s]};
  const [bw,bd]=o.bed;g.fillStyle='#E6E6EA';g.strokeStyle='#8A8A93';g.lineWidth=1.2;g.beginPath();
  [[0,0],[bw,0],[bw,bd],[0,bd]].forEach((p,i)=>{const q=P(p[0]-bw/2,p[1]-bd/2,0);i?g.lineTo(...q):g.moveTo(...q)});g.closePath();g.fill();g.stroke();
  g.strokeStyle='#D4D4D8';g.lineWidth=.6;for(let i=20;i<bw;i+=20){g.beginPath();g.moveTo(...P(i-bw/2,-bd/2,0));g.lineTo(...P(i-bw/2,bd/2,0));g.stroke();g.beginPath();g.moveTo(...P(-bw/2,i-bd/2,0));g.lineTo(...P(bw/2,i-bd/2,0));g.stroke()}
  g.fillStyle='#63636B';g.font='11px GSCode';const o0=P(-bw/2,-bd/2,0);g.fillText('0,0',o0[0]-26,o0[1]+12);
  const ramp=t=>`hsl(${235+t*(380-235)},62%,${52+t*4}%)`;
  const [ox,oy]=o.offset,R=o.r||45;
  for(let l=0;l<o.layers;l++){const t=l/(o.layers-1),z=l*o.h/(o.layers-1);g.beginPath();
    for(let i=0;i<=240;i++){const a=i/240*2*Math.PI,r=R*(1+.12*Math.sin(o.lobes*a))+o.amp*Math.sin(a*36+l*.15);const q=P(ox+r*Math.cos(a),oy+r*Math.sin(a),z);i?g.lineTo(...q):g.moveTo(...q)}
    g.strokeStyle=ramp(t);g.globalAlpha=.75;g.lineWidth=1;g.stroke()}
  g.globalAlpha=1;
  if(o.out){g.strokeStyle='#DC2626';g.lineWidth=2;g.setLineDash([5,4]);g.beginPath();[[-bw/2,-bd/2],[bw/2,-bd/2],[bw/2,bd/2],[-bw/2,bd/2]].forEach((p,i)=>{const q=P(p[0],p[1],0);i?g.lineTo(...q):g.moveTo(...q)});g.closePath();g.stroke();g.setLineDash([])}
}
