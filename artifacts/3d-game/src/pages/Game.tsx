import { useEffect, useRef, useCallback, useState } from "react";

const W = 400;
const H = 600;
const GRAVITY = 0.4;
const BASE_JUMP = -14;
const SPRING_JUMP = -20;
const MOVE_SPEED = 7;
const MAX_LIVES = 3;
const INVINCIBLE_FRAMES = 130;

// ── ZONES ────────────────────────────────────────────────────────
const ZONES = [
  { name: "Notebook",      emoji: "📓", threshold: 0    },
  { name: "Cloud Kingdom", emoji: "☁️",  threshold: 1000 },
  { name: "Outer Space",   emoji: "🚀", threshold: 2000 },
  { name: "Deep Ocean",    emoji: "🌊", threshold: 3000 },
];
function getZone(score: number) {
  let z = 0;
  for (let i = ZONES.length - 1; i >= 0; i--) if (score >= ZONES[i].threshold) { z = i; break; }
  return z;
}
const ZONE_PLAT_COLORS = [
  ["#90e870","#38c020","#208010","#186010","rgba(255,255,255,0.4)"],
  ["#fff8f0","#f0d890","#c8a840","#8a6010","rgba(255,255,255,0.6)"],
  ["#c060ff","#8020e0","#5000b0","#3000a0","rgba(200,140,255,0.5)"],
  ["#50e8d0","#10b8a0","#008870","#005850","rgba(180,255,240,0.45)"],
];

// ── SOUND ENGINE ─────────────────────────────────────────────────
let _ac: AudioContext | null = null;
let _muted = false;
function ac() {
  if (!_ac) _ac = new AudioContext();
  if (_ac.state === "suspended") _ac.resume();
  return _ac;
}
function sfxJump() {
  if (_muted) return; try {
    const c = ac(), t = c.currentTime, o = c.createOscillator(), g = c.createGain();
    o.connect(g); g.connect(c.destination); o.type = "sine";
    o.frequency.setValueAtTime(190,t); o.frequency.exponentialRampToValueAtTime(460,t+.07); o.frequency.exponentialRampToValueAtTime(340,t+.13);
    g.gain.setValueAtTime(.22,t); g.gain.exponentialRampToValueAtTime(.001,t+.15); o.start(t); o.stop(t+.15);
  } catch(_){}
}
function sfxSpring() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type="sine";
    o.frequency.setValueAtTime(260,t);o.frequency.exponentialRampToValueAtTime(1100,t+.1);o.frequency.exponentialRampToValueAtTime(680,t+.18);
    g.gain.setValueAtTime(.28,t);g.gain.exponentialRampToValueAtTime(.001,t+.22);o.start(t);o.stop(t+.22);
    const o2=c.createOscillator(),g2=c.createGain();o2.connect(g2);g2.connect(c.destination);o2.type="triangle";
    o2.frequency.setValueAtTime(520,t);o2.frequency.exponentialRampToValueAtTime(2200,t+.08);
    g2.gain.setValueAtTime(.1,t);g2.gain.exponentialRampToValueAtTime(.001,t+.12);o2.start(t);o2.stop(t+.12);
  } catch(_){}
}
function sfxStomp(combo: number) {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type="square";
    o.frequency.setValueAtTime(220,t);o.frequency.exponentialRampToValueAtTime(55,t+.18);
    g.gain.setValueAtTime(.35,t);g.gain.exponentialRampToValueAtTime(.001,t+.2);o.start(t);o.stop(t+.2);
    const buf=c.createBuffer(1,c.sampleRate*.08,c.sampleRate),d=buf.getChannelData(0);
    for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1;
    const src=c.createBufferSource();src.buffer=buf;
    const flt=c.createBiquadFilter();flt.type="bandpass";flt.frequency.value=800;flt.Q.value=.8;
    const ng=c.createGain();ng.gain.setValueAtTime(.25,t);ng.gain.exponentialRampToValueAtTime(.001,t+.08);
    src.connect(flt);flt.connect(ng);ng.connect(c.destination);src.start(t);src.stop(t+.08);
    if(combo>=2){const notes=[523.25,659.26,783.99,1046.5];const count=Math.min(combo,4);
      for(let i=0;i<count;i++){const nt=t+.05+i*.055,co=c.createOscillator(),cg=c.createGain();
        co.connect(cg);cg.connect(c.destination);co.type="triangle";co.frequency.setValueAtTime(notes[i],nt);
        co.frequency.exponentialRampToValueAtTime(notes[i]*1.06,nt+.06);cg.gain.setValueAtTime(.18,nt);
        cg.gain.exponentialRampToValueAtTime(.001,nt+.1);co.start(nt);co.stop(nt+.1);}}
  } catch(_){}
}
function sfxPowerup() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime;
    [523.25,659.26,783.99,1046.5,1318.51].forEach((freq,i)=>{
      const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="triangle";
      o.frequency.setValueAtTime(freq,t+i*.065);g.gain.setValueAtTime(0,t+i*.065);
      g.gain.linearRampToValueAtTime(.22,t+i*.065+.02);g.gain.exponentialRampToValueAtTime(.001,t+i*.065+.12);
      o.start(t+i*.065);o.stop(t+i*.065+.12);});
  } catch(_){}
}
function sfxHit() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type="square";
    o.frequency.setValueAtTime(440,t);o.frequency.exponentialRampToValueAtTime(140,t+.28);
    g.gain.setValueAtTime(.32,t);g.gain.exponentialRampToValueAtTime(.001,t+.32);o.start(t);o.stop(t+.32);
  } catch(_){}
}
function sfxCheckpoint() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime;
    [440,554,659].forEach((freq,i)=>{
      const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="sine";
      const st=t+i*.08;o.frequency.value=freq;g.gain.setValueAtTime(.13,st);
      g.gain.exponentialRampToValueAtTime(.001,st+.2);o.start(st);o.stop(st+.2);});
  } catch(_){}
}
function sfxRespawn() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime;
    [261,329,392,523,659].forEach((freq,i)=>{
      const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="triangle";
      const st=t+i*.06;o.frequency.value=freq;g.gain.setValueAtTime(0,st);
      g.gain.linearRampToValueAtTime(.18,st+.02);g.gain.exponentialRampToValueAtTime(.001,st+.18);
      o.start(st);o.stop(st+.18);});
  } catch(_){}
}
function sfxDash() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type="sawtooth";
    o.frequency.setValueAtTime(100,t);o.frequency.exponentialRampToValueAtTime(900,t+.15);o.frequency.exponentialRampToValueAtTime(1800,t+.28);
    g.gain.setValueAtTime(.4,t);g.gain.exponentialRampToValueAtTime(.001,t+.32);o.start(t);o.stop(t+.32);
  } catch(_){}
}
function sfxDie() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime,o=c.createOscillator(),g=c.createGain();
    o.connect(g);g.connect(c.destination);o.type="sawtooth";
    o.frequency.setValueAtTime(380,t);o.frequency.exponentialRampToValueAtTime(90,t+.55);
    g.gain.setValueAtTime(.3,t);g.gain.setValueAtTime(.3,t+.1);g.gain.exponentialRampToValueAtTime(.001,t+.6);o.start(t);o.stop(t+.6);
    const o2=c.createOscillator(),g2=c.createGain();o2.connect(g2);g2.connect(c.destination);o2.type="sine";
    o2.frequency.setValueAtTime(110,t);o2.frequency.exponentialRampToValueAtTime(40,t+.3);
    g2.gain.setValueAtTime(.25,t);g2.gain.exponentialRampToValueAtTime(.001,t+.35);o2.start(t);o2.stop(t+.35);
  } catch(_){}
}
function sfxStart() {
  if (_muted) return; try {
    const c=ac(),t=c.currentTime;
    [261.63,329.63,392,523.25].forEach((freq,i)=>{
      const o=c.createOscillator(),g=c.createGain();o.connect(g);g.connect(c.destination);o.type="triangle";o.frequency.value=freq;
      const st=t+i*.08;g.gain.setValueAtTime(0,st);g.gain.linearRampToValueAtTime(.18,st+.02);
      g.gain.exponentialRampToValueAtTime(.001,st+.14);o.start(st);o.stop(st+.14);});
  } catch(_){}
}

// ── TYPES ─────────────────────────────────────────────────────────
type PType = "normal"|"moving"|"broken"|"spring"|"disappear";
interface Platform { id:number;x:number;y:number;w:number;h:number;type:PType;vx:number;cracked:boolean;crackedTimer:number;bounceTimer:number;used:boolean; }
interface Monster { id:number;x:number;y:number;w:number;h:number;vx:number;type:"worm"|"ufo"|"bat";alive:boolean;frame:number;hp:number; }
interface Particle { id:number;x:number;y:number;vx:number;vy:number;life:number;color:string;r:number;trail?:boolean; }
interface FloatingText { id:number;x:number;y:number;vy:number;text:string;life:number;color:string;big?:boolean; }
type PUType = "jetpack"|"hat"|"dash"|"heart";
interface PowerUp { id:number;x:number;y:number;type:PUType;collected:boolean; }
interface Checkpoint { score:number;camY:number; }
interface GS {
  phase:"menu"|"playing"|"dead";
  px:number;py:number;pvx:number;pvy:number;pface:number;animT:number;
  platforms:Platform[];monsters:Monster[];particles:Particle[];floats:FloatingText[];powerups:PowerUp[];
  score:number;hi:number;camY:number;scrolled:number;
  keys:Record<string,boolean>;touchTargetX:number|null;tiltX:number;
  // power-ups
  jetpack:number;hat:number;dash:number;
  // lives & shield
  lives:number;invincible:number;
  // checkpoint
  checkpoint:Checkpoint|null;checkpointUsed:boolean;
  // combo & zone
  combo:number;comboTimer:number;zone:number;
  pid:number;mid:number;fid:number;puid:number;pcid:number;frameN:number;
}

const PW=66,PH=14,PLAYER_W=46,PLAYER_H=50;

function platGap(score:number){return 55+Math.min(score/100,70)+Math.random()*20;}
function makePlat(id:number,_x:number,y:number,score:number):Platform{
  const r=Math.random(),d=Math.min(score/2000,1);
  let type:PType="normal";
  if(r<.06*d)type="spring";else if(r<.2*d)type="broken";else if(r<.38*d)type="moving";else if(r<.45*d)type="disappear";
  const w=type==="spring"?60:PW;
  return{id,x:Math.max(0,Math.min(W-w,Math.random()*(W-w))),y,w,h:PH,type,vx:type==="moving"?(Math.random()>.5?1.8:-1.8):0,cracked:false,crackedTimer:0,bounceTimer:0,used:false};
}
function makeMonster(id:number,camY:number,score:number):Monster{
  const zone=getZone(score);
  const available:Array<"worm"|"ufo"|"bat">=zone>=2?["worm","ufo","bat"]:zone>=1?["worm","bat"]:["worm"];
  const type=available[Math.floor(Math.random()*available.length)];
  return{id,x:Math.random()*(W-52),y:camY-80-Math.random()*200,w:type==="ufo"?52:type==="bat"?44:48,h:type==="ufo"?30:type==="bat"?26:28,vx:(Math.random()>.5?1:-1)*(1.5+Math.random()*1.5),type,alive:true,frame:0,hp:type==="ufo"?2:1};
}
function freshPlatforms(camY:number,score:number){
  const plats:Platform[]=[];
  // Safe landing platform right at respawn spot
  plats.push({id:0,x:W/2-PW/2,y:camY+H*.6,w:PW+20,h:PH,type:"normal",vx:0,cracked:false,crackedTimer:0,bounceTimer:0,used:false});
  for(let i=1;i<22;i++) plats.push(makePlat(i+1,0,camY+H*.6-i*platGap(score),score));
  return plats;
}
function init(hi:number):GS{
  const platforms:Platform[]=[];
  platforms.push({id:0,x:W/2-PW/2,y:H-100,w:PW+10,h:PH,type:"normal",vx:0,cracked:false,crackedTimer:0,bounceTimer:0,used:false});
  for(let i=1;i<18;i++) platforms.push(makePlat(i+1,0,H-100-i*50,0));
  return{phase:"menu",px:W/2-PLAYER_W/2,py:H-100-PLAYER_H-2,pvx:0,pvy:0,pface:1,animT:0,
    platforms,monsters:[],particles:[],floats:[],powerups:[],
    score:0,hi,camY:0,scrolled:0,keys:{},touchTargetX:null,tiltX:0,
    jetpack:0,hat:0,dash:0,lives:MAX_LIVES,invincible:0,
    checkpoint:null,checkpointUsed:false,
    combo:0,comboTimer:0,zone:0,
    pid:20,mid:0,fid:0,puid:0,pcid:0,frameN:0};
}

function addParticles(gs:GS,x:number,y:number,color:string,n=8){
  for(let i=0;i<n;i++){const angle=(Math.PI*2*i)/n+Math.random()*.8,spd=1.5+Math.random()*3;
    gs.particles.push({id:gs.pcid++,x,y,vx:Math.cos(angle)*spd,vy:Math.sin(angle)*spd-1.5,life:1,color,r:3+Math.random()*4});}
}
function addFloat(gs:GS,x:number,y:number,text:string,color:string,big=false){
  gs.floats.push({id:gs.fid++,x,y,vy:big?-2.2:-1.5,text,life:1,color,big});
}
function addTrail(gs:GS,x:number,y:number,color:string,speed:number){
  const n=Math.random()<.6?1:2;
  for(let i=0;i<n;i++) gs.particles.push({id:gs.pcid++,x:x+(Math.random()-.5)*2.5,y:y+(Math.random()-.5)*2.5,vx:-speed*.18+(Math.random()-.5)*1.2,vy:-.4+(Math.random()-.5)*.8,life:.55+Math.random()*.35,color,r:2.5+Math.random()*2.5,trail:true});
}

export default function Game() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gsRef = useRef<GS>(init(0));
  const rafRef = useRef(0);
  const hiRef = useRef(parseInt(localStorage.getItem("djhi")||"0",10));
  const [muted,setMuted] = useState(false);
  const toggleMute = useCallback(()=>{_muted=!_muted;setMuted(_muted);},[]);

  const startGame = useCallback(()=>{
    const gs=init(hiRef.current);gs.phase="playing";gsRef.current=gs;sfxStart();
  },[]);

  useEffect(()=>{
    gsRef.current=init(hiRef.current);
    const onKey=(e:KeyboardEvent)=>{
      gsRef.current.keys[e.code]=e.type==="keydown";
      if(e.type==="keydown"&&(e.code==="Space"||e.code==="Enter")&&gsRef.current.phase!=="playing")startGame();
    };
    window.addEventListener("keydown",onKey);window.addEventListener("keyup",onKey);
    return()=>{window.removeEventListener("keydown",onKey);window.removeEventListener("keyup",onKey);};
  },[startGame]);

  useEffect(()=>{
    const onTilt=(e:DeviceOrientationEvent)=>{if(e.gamma!==null)gsRef.current.tiltX=Math.max(-1,Math.min(1,e.gamma/25));};
    window.addEventListener("deviceorientation",onTilt);
    return()=>window.removeEventListener("deviceorientation",onTilt);
  },[]);

  useEffect(()=>{
    const canvas=canvasRef.current!;
    const ctx=canvas.getContext("2d")!;
    function toScreen(worldY:number){return worldY-gsRef.current.camY;}

    const decorItems:{x:number;y:number;r:number;spd:number;phase:number}[]=[];
    for(let i=0;i<30;i++) decorItems.push({x:Math.random()*W,y:Math.random()*H,r:10+Math.random()*30,spd:.2+Math.random()*.4,phase:Math.random()*Math.PI*2});

    // ── BACKGROUNDS ──────────────────────────────────────────────
    function drawBgNotebook(gs:GS){
      const g=ctx.createRadialGradient(W/2,H/2,60,W/2,H/2,Math.max(W,H)*.75);
      g.addColorStop(0,"#fefaf2");g.addColorStop(.6,"#faf5e8");g.addColorStop(1,"#f0e8d8");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      const gridSize=28,offsetY=(gs.scrolled*.3)%gridSize;ctx.lineCap="round";
      for(let i=0;i<Math.ceil(H/gridSize)+2;i++){
        const y=-gridSize+offsetY+i*gridSize,isMajor=i%4===0;
        ctx.strokeStyle=isMajor?"rgba(150,190,230,0.55)":"rgba(170,205,240,0.38)";ctx.lineWidth=isMajor?1.1:.8;
        const wobble=Math.sin(i*3.7+gs.scrolled*.001)*.6;
        ctx.beginPath();ctx.moveTo(0,y+wobble);ctx.bezierCurveTo(W*.25,y+Math.sin(i+1.2)*.8+wobble,W*.75,y+Math.sin(i+2.4)*.8+wobble,W,y+wobble*.5);ctx.stroke();
      }
      ctx.lineWidth=.6;ctx.strokeStyle="rgba(170,205,240,0.22)";
      for(let x=gridSize;x<W;x+=gridSize){ctx.beginPath();ctx.moveTo(x,0);ctx.lineTo(x,H);ctx.stroke();}
    }
    function drawBgClouds(gs:GS){
      const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#a8d8ff");g.addColorStop(.5,"#c8eaff");g.addColorStop(1,"#e8f6ff");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      decorItems.forEach((d,i)=>{
        const cx=(d.x+gs.scrolled*d.spd*.1)%(W+80)-40,cy=d.y;
        ctx.globalAlpha=.55+Math.sin(d.phase+gs.frameN*.008)*.15;ctx.fillStyle="#fff";
        ctx.beginPath();ctx.ellipse(cx,cy,d.r*1.8,d.r*.9,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx-d.r*.7,cy+d.r*.2,d.r*1.1,d.r*.75,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(cx+d.r*.8,cy+d.r*.1,d.r,d.r*.7,0,0,Math.PI*2);ctx.fill();
        if(i<3){ctx.globalAlpha=.06;ctx.fillStyle="#ffe080";const sa=(i-1)*.25;
          ctx.beginPath();ctx.moveTo(W*.8,-20);ctx.lineTo(W*.8+Math.cos(1.4+sa)*700,Math.sin(1.4+sa)*700);ctx.lineTo(W*.8+Math.cos(1.5+sa)*700,Math.sin(1.5+sa)*700);ctx.fill();}
      });ctx.globalAlpha=1;
    }
    function drawBgSpace(gs:GS){
      const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#080418");g.addColorStop(.5,"#0e0828");g.addColorStop(1,"#180840");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      decorItems.forEach((d,i)=>{
        const blink=.6+Math.sin(d.phase+gs.frameN*.04+i)*.4;ctx.globalAlpha=blink;
        const ss=d.r*.18,sx=d.x,sy=(d.y+gs.scrolled*.05)%H;
        ctx.fillStyle=i%5===0?"#ffeecc":i%5===1?"#ccddff":"#ffffff";
        ctx.beginPath();ctx.arc(sx,sy,ss,0,Math.PI*2);ctx.fill();
        if(i%8===0){ctx.strokeStyle=ctx.fillStyle;ctx.lineWidth=.5;ctx.globalAlpha=blink*.5;
          ctx.beginPath();ctx.moveTo(sx-ss*3,sy);ctx.lineTo(sx+ss*3,sy);ctx.moveTo(sx,sy-ss*3);ctx.lineTo(sx,sy+ss*3);ctx.stroke();}
      });
      ctx.globalAlpha=.07+Math.sin(gs.frameN*.005)*.03;
      const nb=ctx.createRadialGradient(W*.3,H*.4,0,W*.3,H*.4,200);nb.addColorStop(0,"#8040ff");nb.addColorStop(1,"transparent");ctx.fillStyle=nb;ctx.fillRect(0,0,W,H);
      const nb2=ctx.createRadialGradient(W*.7,H*.7,0,W*.7,H*.7,160);nb2.addColorStop(0,"#ff4080");nb2.addColorStop(1,"transparent");ctx.fillStyle=nb2;ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=1;
    }
    function drawBgOcean(gs:GS){
      const g=ctx.createLinearGradient(0,0,0,H);g.addColorStop(0,"#001428");g.addColorStop(.5,"#002840");g.addColorStop(1,"#003858");
      ctx.fillStyle=g;ctx.fillRect(0,0,W,H);
      ctx.globalAlpha=.06;
      for(let i=0;i<8;i++){const cx=(i*55+gs.frameN*.3+Math.sin(i)*30)%W,cy=(i*80+gs.scrolled*.2)%H;
        const cg=ctx.createRadialGradient(cx,cy,0,cx,cy,60+Math.sin(gs.frameN*.02+i)*20);cg.addColorStop(0,"#80ffee");cg.addColorStop(1,"transparent");ctx.fillStyle=cg;ctx.fillRect(0,0,W,H);}
      decorItems.forEach((d,i)=>{if(i>=15)return;
        const by=((d.y-gs.scrolled*d.spd*.2+gs.frameN*d.spd)%(H+40)),bx=d.x+Math.sin(d.phase+gs.frameN*.02)*12;
        ctx.globalAlpha=.18+Math.sin(d.phase+gs.frameN*.03)*.08;ctx.strokeStyle="#80ddff";ctx.lineWidth=1.2;
        ctx.beginPath();ctx.arc(bx,by,d.r*.35,0,Math.PI*2);ctx.stroke();ctx.fillStyle="rgba(180,240,255,0.15)";ctx.fill();});
      ctx.globalAlpha=.25;ctx.strokeStyle="#20c060";ctx.lineWidth=3;ctx.lineCap="round";
      for(let i=0;i<5;i++){const wx=30+i*80,sway=Math.sin(gs.frameN*.03+i)*15;
        ctx.beginPath();ctx.moveTo(wx,H);ctx.quadraticCurveTo(wx+sway,H-30,wx+sway*.5,H-60);ctx.stroke();}
      ctx.globalAlpha=1;
    }
    function drawBg(){const gs=gsRef.current,z=gs.zone;
      if(z===0)drawBgNotebook(gs);else if(z===1)drawBgClouds(gs);else if(z===2)drawBgSpace(gs);else drawBgOcean(gs);}

    // ── PLATFORM ─────────────────────────────────────────────────
    function drawPlatform(p:Platform){
      const gs=gsRef.current,sy=toScreen(p.y);if(sy>H+30||sy<-50)return;
      const bounce=p.bounceTimer>0?Math.sin(p.bounceTimer*.6)*5:0,zc=ZONE_PLAT_COLORS[gs.zone];
      ctx.save();ctx.translate(p.x+p.w/2,sy+p.h/2-bounce*.5);
      if(p.type==="spring"){
        const g=ctx.createLinearGradient(0,-p.h/2,0,p.h/2);g.addColorStop(0,"#ff8faa");g.addColorStop(.5,"#e8305a");g.addColorStop(1,"#c01840");
        ctx.fillStyle=g;ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,7);ctx.fill();ctx.strokeStyle="#801030";ctx.lineWidth=2;ctx.stroke();
        ctx.strokeStyle="#ffd0e0";ctx.lineWidth=3;ctx.lineCap="round";
        for(let i=0;i<3;i++){const cy=-p.h/2-6-i*7;ctx.beginPath();ctx.moveTo(-8,cy);ctx.quadraticCurveTo(0,cy-6,8,cy);ctx.stroke();}
        ctx.strokeStyle="#e8305a";ctx.lineWidth=2;
        ctx.beginPath();ctx.moveTo(-6,-p.h/2-18-bounce*2);ctx.lineTo(-6,-p.h/2);ctx.moveTo(6,-p.h/2-18-bounce*2);ctx.lineTo(6,-p.h/2);ctx.stroke();
      } else if(p.type==="broken"||p.cracked){
        ctx.fillStyle=p.cracked?"#a06830":"#c87840";ctx.strokeStyle="#7a4818";ctx.lineWidth=2;
        ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,5);ctx.fill();ctx.stroke();
        if(p.cracked){ctx.globalAlpha=1-p.crackedTimer/30;ctx.strokeStyle="#7a4818";ctx.lineWidth=1.5;
          ctx.beginPath();ctx.moveTo(-p.w/4,-p.h/2);ctx.lineTo(-p.w/6,p.h/2);ctx.moveTo(p.w/5,-p.h/2+2);ctx.lineTo(p.w/3,p.h/2);ctx.moveTo(0,-p.h/2);ctx.lineTo(-p.w/8,p.h/2);ctx.stroke();}
        else{ctx.strokeStyle="#7a4818";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(-10,-p.h/2+3);ctx.lineTo(-5,p.h/2-2);ctx.moveTo(10,-p.h/2+2);ctx.lineTo(6,p.h/2-3);ctx.stroke();}
        ctx.globalAlpha=1;
      } else if(p.type==="moving"){
        const g=ctx.createLinearGradient(0,-p.h/2,0,p.h/2);g.addColorStop(0,"#80c8ff");g.addColorStop(.5,"#2090e8");g.addColorStop(1,"#0060b8");
        ctx.fillStyle=g;ctx.strokeStyle="#004090";ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,7);ctx.fill();ctx.stroke();
        ctx.fillStyle="rgba(255,255,255,0.4)";ctx.fillRect(-p.w/2+5,-p.h/2+3,p.w-10,4);
        ctx.fillStyle="rgba(255,255,255,0.6)";ctx.font="9px sans-serif";ctx.textAlign="center";ctx.fillText(p.vx>0?"▶▶":"◀◀",0,3);
      } else if(p.type==="disappear"){
        ctx.globalAlpha=p.used?.3:1;ctx.fillStyle="#e8f8ff";ctx.strokeStyle="#90c8e8";ctx.lineWidth=2;
        ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,7);ctx.fill();ctx.stroke();
        ctx.fillStyle="rgba(255,255,255,0.8)";
        ctx.beginPath();ctx.ellipse(-p.w/4,-p.h/2-5,12,8,0,0,Math.PI*2);ctx.fill();
        ctx.beginPath();ctx.ellipse(p.w/4,-p.h/2-5,12,8,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      } else {
        const g=ctx.createLinearGradient(0,-p.h/2,0,p.h/2);g.addColorStop(0,zc[0]);g.addColorStop(.5,zc[1]);g.addColorStop(1,zc[2]);
        ctx.fillStyle=g;ctx.strokeStyle=zc[3];ctx.lineWidth=2;ctx.beginPath();ctx.roundRect(-p.w/2,-p.h/2,p.w,p.h,7);ctx.fill();ctx.stroke();
        ctx.fillStyle=zc[4];ctx.fillRect(-p.w/2+5,-p.h/2+3,p.w-10,4);
      }
      ctx.restore();
    }

    // ── FROG ─────────────────────────────────────────────────────
    function drawDoodler(gs:GS){
      // Flash when invincible
      if(gs.invincible>0&&Math.floor(gs.invincible/7)%2===0){return;}
      const sx=gs.px,sy=toScreen(gs.py),f=gs.pface,t=gs.animT;
      const falling=gs.pvy>2,rising=gs.pvy<-3;
      ctx.save();ctx.translate(sx+PLAYER_W/2,sy+PLAYER_H/2-4);ctx.scale(f,1);
      const sqX=rising?.84:falling?1.12:1,sqY=rising?1.16:falling?.88:1;
      ctx.scale(sqX*.68,sqY*.68);

      // Shield glow if lives > 1
      if(gs.lives===MAX_LIVES){
        ctx.globalAlpha=.18+Math.sin(gs.frameN*.08)*.06;
        const sg=ctx.createRadialGradient(0,0,5,0,0,30);sg.addColorStop(0,"#60c0ff");sg.addColorStop(1,"transparent");
        ctx.fillStyle=sg;ctx.beginPath();ctx.arc(0,0,30,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      }

      if(gs.jetpack>0){
        ctx.fillStyle="#cc3010";ctx.strokeStyle="#881000";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.roundRect(-28,-10,10,22,4);ctx.fill();ctx.stroke();
        ctx.fillStyle="#ff5020";ctx.beginPath();ctx.moveTo(-27,12);ctx.lineTo(-22,12+10+Math.sin(t*.5)*5);ctx.lineTo(-17,12);ctx.closePath();ctx.fill();
      }
      if(gs.dash>0){
        // Lightning wings
        ctx.strokeStyle="#ffee40";ctx.lineWidth=2;ctx.globalAlpha=.7+Math.sin(gs.frameN*.3)*.3;
        ctx.beginPath();ctx.moveTo(-24,-5);ctx.lineTo(-38,5);ctx.lineTo(-28,5);ctx.lineTo(-42,18);ctx.stroke();
        ctx.beginPath();ctx.moveTo(24,-5);ctx.lineTo(38,5);ctx.lineTo(28,5);ctx.lineTo(42,18);ctx.stroke();
        ctx.globalAlpha=1;
      }

      const footKick=rising?-6:falling?4:Math.sin(t*.2)*3;
      ctx.strokeStyle="#186004";ctx.lineWidth=1.5;ctx.fillStyle="#50cc20";
      ctx.beginPath();ctx.ellipse(-10,18+footKick,9,5,-.15,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.beginPath();ctx.ellipse(10,18+footKick,9,5,.15,0,Math.PI*2);ctx.fill();ctx.stroke();
      const bodyG=ctx.createRadialGradient(-5,-6,3,0,0,22);
      bodyG.addColorStop(0,"#88f044");bodyG.addColorStop(.5,"#4acc18");bodyG.addColorStop(.85,"#2e9a08");bodyG.addColorStop(1,"#1a6004");
      ctx.fillStyle=bodyG;ctx.strokeStyle="#186004";ctx.lineWidth=2.5;
      ctx.beginPath();ctx.ellipse(0,2,21,20,0,0,Math.PI*2);ctx.fill();ctx.stroke();
      ctx.fillStyle="rgba(200,255,140,0.22)";ctx.beginPath();ctx.ellipse(-5,-7,9,6,-.4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="rgba(200,255,160,0.45)";ctx.beginPath();ctx.ellipse(1,7,11,9,0,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#1a5800";ctx.beginPath();ctx.ellipse(-4,-4,2,1.5,-.2,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(4,-4,2,1.5,.2,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle="#0a4000";ctx.lineWidth=2.5;ctx.lineCap="round";
      ctx.beginPath();ctx.moveTo(-12,5);ctx.quadraticCurveTo(0,15,12,5);ctx.stroke();
      ctx.fillStyle="#bb1a3a";ctx.beginPath();ctx.moveTo(-9,6);ctx.quadraticCurveTo(0,14,9,6);ctx.quadraticCurveTo(0,10,-9,6);ctx.fill();
      const wag=Math.sin(t*.22)*2.5;
      ctx.fillStyle="#ff3d88";ctx.strokeStyle="#cc1060";ctx.lineWidth=1.5;
      ctx.beginPath();ctx.moveTo(-3,11);ctx.quadraticCurveTo(wag*.4,14,1,20+wag);ctx.quadraticCurveTo(4+wag,24+wag,0,24+wag);ctx.quadraticCurveTo(-4+wag,24+wag,-1,20+wag);ctx.quadraticCurveTo(wag*.3,14,3,11);ctx.fill();ctx.stroke();
      ctx.strokeStyle="#ff70bb";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(0,21+wag);ctx.lineTo(0,24+wag);ctx.stroke();
      [[-9,"#88f044"],[9,"#88f044"]].forEach(([ex,c])=>{
        const eGrad=ctx.createRadialGradient(ex as number,-19,1,ex as number,-19,11);
        eGrad.addColorStop(0,c as string);eGrad.addColorStop(.7,"#4acc18");eGrad.addColorStop(1,"#2a8808");
        ctx.fillStyle=eGrad;ctx.strokeStyle="#186004";ctx.lineWidth=2;ctx.beginPath();ctx.arc(ex as number,-19,10,0,Math.PI*2);ctx.fill();ctx.stroke();
      });
      ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-9,-19,8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(9,-19,8,0,Math.PI*2);ctx.fill();
      const pDx=Math.max(-3,Math.min(3,gs.pvx*.2)),pDy=rising?-1.5:falling?1.5:0;
      ctx.fillStyle="#111";ctx.beginPath();ctx.arc(-9+pDx,-19+pDy,4,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(9+pDx*.5,-19+pDy,4,0,Math.PI*2);ctx.fill();
      ctx.fillStyle="#fff";ctx.beginPath();ctx.arc(-9+pDx+1.5,-19+pDy-1.5,1.8,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(9+pDx*.5+1.5,-19+pDy-1.5,1.8,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=.4;ctx.fillStyle="#ff7799";ctx.beginPath();ctx.ellipse(-16,1,5,3.5,0,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.ellipse(16,1,5,3.5,0,0,Math.PI*2);ctx.fill();ctx.globalAlpha=1;
      if(gs.hat>0){
        const spin=t*.22;ctx.fillStyle="#2222cc";ctx.strokeStyle="#111188";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.ellipse(0,-31,12,4,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle="#3333ee";ctx.beginPath();ctx.roundRect(-8,-46,16,15,4);ctx.fill();ctx.stroke();ctx.fillStyle="#6677ff";ctx.fillRect(-8,-44,16,4);
        ctx.save();ctx.translate(0,-48);ctx.rotate(spin);
        ["#ff4040","#44cc44","#4444ff","#ff44cc"].forEach((c,i)=>{ctx.fillStyle=c;ctx.save();ctx.rotate((i*Math.PI)/2);ctx.beginPath();ctx.ellipse(9,0,9,3.5,0,0,Math.PI*2);ctx.fill();ctx.restore();});
        ctx.fillStyle="#ccc";ctx.strokeStyle="#888";ctx.lineWidth=1;ctx.beginPath();ctx.arc(0,0,3,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.restore();
      }
      ctx.restore();
    }

    // ── MONSTER ──────────────────────────────────────────────────
    function drawMonster(m:Monster){
      const sy=toScreen(m.y);if(sy>H+40||sy<-50)return;
      ctx.save();ctx.translate(m.x+m.w/2,sy+m.h/2);
      if(m.type==="worm"){
        ctx.scale(m.vx>0?1:-1,1);
        const g=ctx.createRadialGradient(-5,-5,2,0,0,22);g.addColorStop(0,"#ff8888");g.addColorStop(.5,"#dd2020");g.addColorStop(1,"#880808");
        ctx.fillStyle=g;ctx.strokeStyle="#660000";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,22,14,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(12,-5,5,5,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#111";ctx.beginPath();ctx.ellipse(13,-5,3,3,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#fff";ctx.beginPath();ctx.ellipse(14,-6,1,1,0,0,Math.PI*2);ctx.fill();ctx.fillStyle="#cc0000";
        for(let i=-2;i<=2;i++){ctx.beginPath();ctx.moveTo(i*7,-14);ctx.lineTo(i*7-3,-22);ctx.lineTo(i*7+3,-22);ctx.closePath();ctx.fill();}
      } else if(m.type==="ufo"){
        const bob=Math.sin(m.frame*.04)*4;ctx.save();ctx.translate(0,bob);
        const g2=ctx.createLinearGradient(0,-15,0,15);g2.addColorStop(0,"#aaddff");g2.addColorStop(.5,"#4499ee");g2.addColorStop(1,"#1155aa");
        ctx.fillStyle=g2;ctx.strokeStyle="#0033aa";ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,0,26,12,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        const dg=ctx.createRadialGradient(0,-6,1,0,-6,14);dg.addColorStop(0,"#ddeeff");dg.addColorStop(1,"#7799cc");
        ctx.fillStyle=dg;ctx.strokeStyle="#4477bb";ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(0,-8,14,10,0,0,Math.PI*2);ctx.fill();ctx.stroke();
        for(let i=-2;i<=2;i++){ctx.fillStyle=i%2===0?"#ffff00":"#ff8800";ctx.beginPath();ctx.arc(i*9,8+Math.sin(m.frame*.1+i)*2,3,0,Math.PI*2);ctx.fill();}
        ctx.restore();
      } else {
        const flap=Math.sin(m.frame*.2)*.4;ctx.scale(m.vx>0?1:-1,1);
        ctx.fillStyle="#442266";ctx.strokeStyle="#221133";ctx.lineWidth=1.5;
        ctx.save();ctx.rotate(-flap);
        ctx.beginPath();ctx.moveTo(-22,0);ctx.quadraticCurveTo(-15,-12,0,-4);ctx.quadraticCurveTo(15,-12,22,0);ctx.quadraticCurveTo(12,10,0,6);ctx.quadraticCurveTo(-12,10,-22,0);ctx.fill();ctx.stroke();ctx.restore();
        ctx.fillStyle="#883399";ctx.beginPath();ctx.ellipse(0,-2,10,8,0,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#ffdd00";ctx.beginPath();ctx.arc(-4,-4,3,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(4,-4,3,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#111";ctx.beginPath();ctx.arc(-4,-4,1.5,0,Math.PI*2);ctx.fill();ctx.beginPath();ctx.arc(4,-4,1.5,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }

    // ── HUD helpers ──────────────────────────────────────────────
    function pill(x:number,y:number,w:number,h:number,r:number,fill:string,stroke?:string){
      ctx.beginPath();ctx.roundRect(x,y,w,h,r);ctx.fillStyle=fill;ctx.fill();
      if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=1.5;ctx.stroke();}
    }
    function heartShape(cx:number,cy:number,size:number){
      ctx.beginPath();
      ctx.moveTo(cx,cy-size*.2);
      ctx.bezierCurveTo(cx,cy-size,cx+size,cy-size,cx+size,cy-size*.3);
      ctx.bezierCurveTo(cx+size,cy+size*.3,cx,cy+size*.9,cx,cy+size*.9);
      ctx.bezierCurveTo(cx,cy+size*.9,cx-size,cy+size*.3,cx-size,cy-size*.3);
      ctx.bezierCurveTo(cx-size,cy-size,cx,cy-size,cx,cy-size*.2);
      ctx.closePath();
    }

    // ── HUD ──────────────────────────────────────────────────────
    function drawHUD(gs:GS){
      ctx.save();

      // ── SCORE PILL (top-left) ──────────────
      const SP_W=118,SP_H=54,SP_X=10,SP_Y=10;
      // shadow
      ctx.shadowColor="rgba(0,0,0,0.22)";ctx.shadowBlur=8;ctx.shadowOffsetY=2;
      pill(SP_X,SP_Y,SP_W,SP_H,14,"#ffffff","rgba(60,180,60,0.5)");
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      // green top accent bar (top corners match pill radius, bottom flat)
      ctx.save();ctx.beginPath();ctx.roundRect(SP_X,SP_Y,SP_W,6,[14,14,0,0]);ctx.fillStyle="#3dc825";ctx.fill();ctx.restore();
      // "SCORE" label
      ctx.font="bold 9px Arial, sans-serif";ctx.fillStyle="#888";ctx.textAlign="left";ctx.letterSpacing="1px";
      ctx.fillText("SCORE",SP_X+10,SP_Y+20);ctx.letterSpacing="0px";
      // score number — big
      ctx.font="bold 26px Arial Black, Arial, sans-serif";ctx.fillStyle="#1a7010";
      ctx.fillText(String(gs.score),SP_X+10,SP_Y+46);
      // best — right-aligned inside pill, small amber
      ctx.font="bold 9px Arial, sans-serif";ctx.fillStyle="#b06010";ctx.textAlign="right";ctx.letterSpacing=".5px";
      ctx.fillText(`BEST  ${gs.hi}`,SP_X+SP_W-8,SP_Y+20);ctx.letterSpacing="0px";

      // ── LIVES PILL (top-right) ─────────────
      const LP_W=100,LP_H=54,LP_X=W-LP_W-10,LP_Y=10;
      ctx.shadowColor="rgba(0,0,0,0.22)";ctx.shadowBlur=8;ctx.shadowOffsetY=2;
      pill(LP_X,LP_Y,LP_W,LP_H,14,"#ffffff","rgba(220,50,70,0.35)");
      ctx.shadowBlur=0;ctx.shadowOffsetY=0;
      // red top accent bar
      ctx.save();ctx.beginPath();ctx.roundRect(LP_X,LP_Y,LP_W,6,[14,14,0,0]);ctx.fillStyle="#e83050";ctx.fill();ctx.restore();
      // "LIVES" label
      ctx.font="bold 9px Arial, sans-serif";ctx.fillStyle="#888";ctx.textAlign="right";ctx.letterSpacing="1px";
      ctx.fillText("LIVES",LP_X+LP_W-8,LP_Y+20);ctx.letterSpacing="0px";
      // hearts row — centered in pill
      const HS=13,HGap=28,HY=LP_Y+40,HStartX=LP_X+LP_W/2-(MAX_LIVES-1)*HGap/2;
      for(let i=0;i<MAX_LIVES;i++){
        const hcx=HStartX+i*HGap,pulsing=gs.lives===1&&i<gs.lives;
        const sc=pulsing?(.95+Math.sin(gs.frameN*.22)*.12):1;
        ctx.save();ctx.translate(hcx,HY);ctx.scale(sc,sc);ctx.translate(-hcx,-HY);
        if(i<gs.lives){
          const hg=ctx.createRadialGradient(hcx-2,HY-5,1,hcx-2,HY-5,HS*1.4);
          hg.addColorStop(0,"#ff8090");hg.addColorStop(1,"#d41535");
          ctx.fillStyle=hg;
          ctx.shadowColor=pulsing?"rgba(220,20,50,0.5)":"rgba(200,20,50,0.25)";ctx.shadowBlur=pulsing?8:4;
          heartShape(hcx,HY,HS);ctx.fill();ctx.shadowBlur=0;
          // shine
          ctx.fillStyle="rgba(255,255,255,0.38)";
          ctx.beginPath();ctx.ellipse(hcx-3,HY-HS*.5,HS*.35,HS*.22,-.3,0,Math.PI*2);ctx.fill();
        } else {
          heartShape(hcx,HY,HS);
          ctx.strokeStyle="#ddd";ctx.lineWidth=1.5;ctx.stroke();
          ctx.fillStyle="rgba(230,230,230,0.5)";ctx.fill();
        }
        ctx.restore();
      }

      // ── CHECKPOINT BADGE (below score pill) ──
      if(gs.checkpoint&&!gs.checkpointUsed){
        pill(SP_X,SP_Y+SP_H+5,SP_W,18,9,"rgba(34,160,60,0.92)");
        ctx.fillStyle="#fff";ctx.font="bold 10px Arial, sans-serif";ctx.textAlign="left";
        ctx.fillText(`✓ CP  ${gs.checkpoint.score} pts`,SP_X+8,SP_Y+SP_H+18);
      }

      // ── POWER-UP TIMERS (below lives pill, right) ──
      let tr=LP_Y+LP_H+6;
      const showTimer=(emoji:string,frames:number,accent:string)=>{
        const TW=LP_W,TH=22;
        ctx.shadowColor="rgba(0,0,0,0.15)";ctx.shadowBlur=4;
        pill(LP_X,tr,TW,TH,11,"rgba(30,30,30,0.82)");
        ctx.shadowBlur=0;
        // progress bar track
        ctx.fillStyle="rgba(255,255,255,0.12)";ctx.beginPath();ctx.roundRect(LP_X+6,tr+TH-6,TW-12,4,2);ctx.fill();
        // progress fill
        const maxF=pu_type_max(emoji);
        ctx.fillStyle=accent;ctx.beginPath();ctx.roundRect(LP_X+6,tr+TH-6,Math.max(4,(TW-12)*(frames/maxF)),4,2);ctx.fill();
        ctx.fillStyle="#fff";ctx.font="bold 11px Arial, sans-serif";ctx.textAlign="left";
        ctx.fillText(`${emoji}  ${Math.ceil(frames/60)}s`,LP_X+8,tr+14);
        tr+=TH+5;
      };
      function pu_type_max(e:string){return e==="🚀"?180:e==="🎩"?300:90;}
      if(gs.jetpack>0)showTimer("🚀",gs.jetpack,"#ff6030");
      if(gs.hat>0)showTimer("🎩",gs.hat,"#6060ee");
      if(gs.dash>0)showTimer("⚡",gs.dash,"#ffcc00");

      // ── COMBO (centered, below pills) ──
      if(gs.combo>=2){
        const pulse=1+Math.sin(gs.frameN*.28)*.09;
        const comboColors=["","","#ff9020","#ff5010","#dd2090","#aa00ff"];
        const col=comboColors[Math.min(gs.combo,comboColors.length-1)]||"#aa00ff";
        ctx.save();ctx.translate(W/2,SP_Y+SP_H+22);ctx.scale(pulse,pulse);
        ctx.shadowColor="rgba(0,0,0,0.35)";ctx.shadowBlur=6;
        ctx.fillStyle="rgba(0,0,0,0.55)";ctx.beginPath();ctx.roundRect(-58,-16,116,28,14);ctx.fill();
        ctx.shadowBlur=0;
        ctx.fillStyle=col;ctx.font="bold 16px 'Comic Sans MS', cursive";ctx.textAlign="center";
        ctx.fillText(`🔥 x${gs.combo} COMBO!`,0,5);ctx.restore();
      }

      ctx.restore();
    }

    // ── POWERUP DRAWING ──────────────────────────────────────────
    function drawPowerup(pu:PowerUp){
      if(pu.collected)return;
      const gs=gsRef.current,sy=toScreen(pu.y);
      if(sy>H+40||sy<-60)return;
      ctx.save();ctx.translate(pu.x+15,sy+15);ctx.rotate(Math.sin(gs.frameN*.05)*.2);
      if(pu.type==="jetpack"){
        ctx.fillStyle="#e04020";ctx.fillRect(-10,-15,20,30);ctx.fillStyle="#ff8040";ctx.fillRect(-6,-18,12,8);
        ctx.fillStyle="#ffcc00";const fh=8+Math.sin(gs.frameN*.3)*4;
        ctx.beginPath();ctx.moveTo(-8,15);ctx.lineTo(0,15+fh);ctx.lineTo(8,15);ctx.fill();
      } else if(pu.type==="hat"){
        ctx.fillStyle="#4040dd";ctx.beginPath();ctx.ellipse(0,5,15,4,0,0,Math.PI*2);ctx.fill();
        ctx.fillRect(-10,-10,20,15);ctx.fillStyle="#8888ff";ctx.fillRect(-10,-8,20,4);
      } else if(pu.type==="dash"){
        // Lightning bolt
        const glow=ctx.createRadialGradient(0,0,0,0,0,22);glow.addColorStop(0,"rgba(255,230,0,0.6)");glow.addColorStop(1,"transparent");
        ctx.fillStyle=glow;ctx.beginPath();ctx.arc(0,0,22,0,Math.PI*2);ctx.fill();
        ctx.fillStyle="#ffee00";ctx.strokeStyle="#cc8800";ctx.lineWidth=1.5;
        ctx.beginPath();ctx.moveTo(4,-18);ctx.lineTo(-6,0);ctx.lineTo(2,0);ctx.lineTo(-4,18);ctx.lineTo(8,-2);ctx.lineTo(0,-2);ctx.closePath();ctx.fill();ctx.stroke();
      } else {
        // Heart (extra life)
        const pulse=1+Math.sin(gs.frameN*.12)*.12;ctx.scale(pulse,pulse);
        const hg=ctx.createRadialGradient(0,-4,1,0,-4,18);hg.addColorStop(0,"#ff80a0");hg.addColorStop(1,"#cc1040");
        ctx.fillStyle=hg;ctx.beginPath();
        ctx.moveTo(0,-6);ctx.bezierCurveTo(0,-15,14,-15,14,-5);ctx.bezierCurveTo(14,4,0,14,0,14);
        ctx.bezierCurveTo(0,14,-14,4,-14,-5);ctx.bezierCurveTo(-14,-15,0,-15,0,-6);ctx.fill();
        ctx.fillStyle="rgba(255,255,255,0.4)";ctx.beginPath();ctx.ellipse(-4,-7,4,3,-.3,0,Math.PI*2);ctx.fill();
      }
      ctx.restore();
    }

    function drawMenu(gs:GS){
      ctx.save();
      ctx.fillStyle="rgba(255,252,240,0.88)";ctx.beginPath();ctx.roundRect(W/2-150,80,300,265,20);ctx.fill();
      ctx.strokeStyle="#38c020";ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(W/2-150,80,300,265,20);ctx.stroke();
      ctx.fillStyle="#2a7010";ctx.font="bold 36px 'Comic Sans MS', cursive";ctx.textAlign="center";ctx.fillText("Doodle Jump",W/2,135);
      ctx.fillStyle="#555";ctx.font="13px 'Comic Sans MS', cursive";
      ctx.fillText("Drag finger left/right to move",W/2,163);
      ctx.fillText("Stomp monsters for COMBO bonus!",W/2,183);
      ctx.fillText("❤️❤️❤️  3 lives — shields protect you",W/2,203);
      ctx.fillText("⚡ Dash   🚀 Jetpack   🎩 Hat",W/2,223);
      ctx.fillText("Checkpoint saves every 1000 pts!",W/2,243);
      const grad=ctx.createLinearGradient(W/2-85,0,W/2+85,0);grad.addColorStop(0,"#56d830");grad.addColorStop(1,"#28a010");
      ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(W/2-85,254,170,48,14);ctx.fill();
      ctx.fillStyle="#fff";ctx.font="bold 22px 'Comic Sans MS', cursive";ctx.fillText("▶  PLAY",W/2,286);
      if(gs.hi>0){ctx.fillStyle="#a05010";ctx.font="bold 14px 'Comic Sans MS', cursive";ctx.fillText(`Best: ${gs.hi}`,W/2,322);}
      ctx.restore();
    }

    function drawGameOver(gs:GS){
      ctx.save();
      ctx.fillStyle="rgba(255,245,230,0.93)";ctx.beginPath();ctx.roundRect(W/2-145,170,290,235,18);ctx.fill();
      ctx.strokeStyle="#e05020";ctx.lineWidth=3;ctx.beginPath();ctx.roundRect(W/2-145,170,290,235,18);ctx.stroke();
      ctx.fillStyle="#c03010";ctx.font="bold 34px 'Comic Sans MS', cursive";ctx.textAlign="center";ctx.fillText("Game Over!",W/2,218);
      ctx.fillStyle="#444";ctx.font="18px 'Comic Sans MS', cursive";ctx.fillText(`Score: ${gs.score}`,W/2,250);
      if(gs.score>=gs.hi&&gs.score>0){ctx.fillStyle="#d07000";ctx.font="bold 15px 'Comic Sans MS', cursive";ctx.fillText("🏆 New Best!",W/2,274);}
      else{ctx.fillStyle="#888";ctx.font="14px 'Comic Sans MS', cursive";ctx.fillText(`Best: ${gs.hi}`,W/2,274);}
      // Show hearts
      ctx.fillStyle="#555";ctx.font="13px 'Comic Sans MS', cursive";ctx.fillText("Lives used:",W/2,298);
      for(let i=0;i<MAX_LIVES;i++){
        ctx.save();ctx.translate(W/2-28+i*28,316);ctx.scale(.65,.65);
        ctx.fillStyle=i<MAX_LIVES-gs.lives?"#aaa":"#ee2040";ctx.beginPath();
        ctx.moveTo(0,-10);ctx.bezierCurveTo(0,-18,12,-18,12,-8);ctx.bezierCurveTo(12,0,0,10,0,10);
        ctx.bezierCurveTo(0,10,-12,0,-12,-8);ctx.bezierCurveTo(-12,-18,0,-18,0,-10);ctx.fill();ctx.restore();
      }
      const grad=ctx.createLinearGradient(W/2-80,0,W/2+80,0);grad.addColorStop(0,"#56d830");grad.addColorStop(1,"#28a010");
      ctx.fillStyle=grad;ctx.beginPath();ctx.roundRect(W/2-82,330,164,50,14);ctx.fill();
      ctx.fillStyle="#fff";ctx.font="bold 20px 'Comic Sans MS', cursive";ctx.fillText("▶  PLAY AGAIN",W/2,362);
      ctx.restore();
    }

    // ── RENDER ───────────────────────────────────────────────────
    function render(){
      const gs=gsRef.current;
      ctx.clearRect(0,0,W,H);drawBg();
      if(gs.phase==="menu"){gs.platforms.forEach(drawPlatform);drawDoodler(gs);drawMenu(gs);return;}
      gs.platforms.forEach(drawPlatform);
      gs.powerups.forEach(drawPowerup);
      // Trail particles (additive glow)
      ctx.save();ctx.globalCompositeOperation="lighter";
      gs.particles.forEach((p)=>{
        if(!p.trail)return;const sy=toScreen(p.y),radius=p.r*p.life;if(radius<.3)return;
        const grd=ctx.createRadialGradient(p.x,sy,0,p.x,sy,radius*2.2);grd.addColorStop(0,p.color);grd.addColorStop(.55,p.color);grd.addColorStop(1,"rgba(0,0,0,0)");
        ctx.globalAlpha=p.life*.85;ctx.fillStyle=grd;ctx.beginPath();ctx.arc(p.x,sy,radius*2.2,0,Math.PI*2);ctx.fill();
      });ctx.restore();
      gs.particles.forEach((p)=>{if(p.trail)return;const sy=toScreen(p.y);ctx.globalAlpha=p.life;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,sy,p.r*p.life,0,Math.PI*2);ctx.fill();});
      ctx.globalAlpha=1;
      gs.monsters.forEach(drawMonster);
      drawDoodler(gs);
      gs.floats.forEach((f)=>{
        const sy=toScreen(f.y);ctx.globalAlpha=f.life;ctx.fillStyle=f.color;
        if(f.big){ctx.save();const scale=1+(1-f.life)*.4;ctx.translate(f.x,sy);ctx.scale(scale,scale);ctx.font="bold 22px 'Comic Sans MS', cursive";ctx.textAlign="center";ctx.fillText(f.text,0,0);ctx.restore();}
        else{ctx.font="bold 16px 'Comic Sans MS', cursive";ctx.textAlign="center";ctx.fillText(f.text,f.x,sy);}
      });
      ctx.globalAlpha=1;
      drawHUD(gs);
      if(gs.phase==="dead")drawGameOver(gs);
    }

    // ── UPDATE ───────────────────────────────────────────────────
    function update(){
      const gs=gsRef.current;gs.frameN++;gs.animT++;
      if(gs.phase!=="playing")return;

      // Movement
      const keyLeft=gs.keys["ArrowLeft"]||gs.keys["KeyA"],keyRight=gs.keys["ArrowRight"]||gs.keys["KeyD"];
      if(keyLeft){gs.pvx=Math.max(gs.pvx-1.2,-MOVE_SPEED*1.5);gs.pface=-1;}
      else if(keyRight){gs.pvx=Math.min(gs.pvx+1.2,MOVE_SPEED*1.5);gs.pface=1;}
      else if(Math.abs(gs.tiltX)>.12){
        const tf=gs.tiltX*2.2;gs.pvx=Math.max(-MOVE_SPEED*1.5,Math.min(MOVE_SPEED*1.5,gs.pvx+tf));
        if(gs.tiltX<0)gs.pface=-1;if(gs.tiltX>0)gs.pface=1;
      } else if(gs.touchTargetX!==null){
        const frogCX=gs.px+PLAYER_W/2,delta=gs.touchTargetX-frogCX;
        const desired=Math.max(-MOVE_SPEED*1.5,Math.min(MOVE_SPEED*1.5,delta*.22));
        gs.pvx+=(desired-gs.pvx)*.28;
        if(delta<-2)gs.pface=-1;else if(delta>2)gs.pface=1;
      } else gs.pvx*=.82;
      gs.px+=gs.pvx;if(gs.px>W)gs.px=-PLAYER_W;if(gs.px+PLAYER_W<0)gs.px=W;

      // Physics
      if(gs.dash>0){
        gs.dash--;
        gs.pvy=Math.max(gs.pvy-1.1,-22); // Rocket upward
        // Lightning trail both sides
        addTrail(gs,gs.px+PLAYER_W*.3,gs.py+PLAYER_H*.6,Math.random()<.5?"#ffee20":"#ffffff",gs.pvx);
        addTrail(gs,gs.px+PLAYER_W*.7,gs.py+PLAYER_H*.6,Math.random()<.5?"#ffaa00":"#ffffaa",gs.pvx);
      } else if(gs.jetpack>0){
        gs.jetpack--;gs.pvy=Math.max(gs.pvy-.6,-11);addParticles(gs,gs.px+PLAYER_W/2,gs.py+PLAYER_H,"#ff8040",1);
      } else if(gs.hat>0){
        gs.hat--;gs.pvy=Math.max(gs.pvy-.3,-7);
      } else gs.pvy+=GRAVITY;
      gs.py+=gs.pvy;

      // Camera
      const screenPY=gs.py-gs.camY;
      if(screenPY<H/2.5){const d=H/2.5-screenPY;gs.camY-=d;gs.scrolled+=d;gs.score=Math.max(gs.score,Math.floor(gs.scrolled/4));}

      // Zone check
      const newZone=Math.min(getZone(gs.score),ZONES.length-1);if(newZone!==gs.zone)gs.zone=newZone;

      // Checkpoint auto-save every 1000 pts
      const cpMilestone=Math.floor(gs.score/1000)*1000;
      if(cpMilestone>0&&(!gs.checkpoint||gs.checkpoint.score<cpMilestone)&&!gs.checkpointUsed){
        gs.checkpoint={score:cpMilestone,camY:gs.camY};
        sfxCheckpoint();
        addFloat(gs,W/2,gs.py-30,"✓ Checkpoint!","#30aa50");
      }

      // Invincibility countdown
      if(gs.invincible>0)gs.invincible--;

      // Combo timer
      if(gs.comboTimer>0){gs.comboTimer--;if(gs.comboTimer===0)gs.combo=0;}

      // Speed trail
      const absVx=Math.abs(gs.pvx),absVy=Math.abs(gs.pvy);
      const fastEnough=absVx>2.8||(gs.jetpack>0&&absVy>3)||(gs.hat>0&&gs.pvy<-2);
      if(fastEnough&&gs.dash===0){
        const tx=gs.px+PLAYER_W/2+(gs.pvx>0?-10:10),ty=gs.py+PLAYER_H*.55;
        let col:string;
        if(gs.jetpack>0)col=Math.random()<.5?"#ff9030":"#ffee60";
        else if(gs.hat>0)col=Math.random()<.5?"#60ccff":"#ffffff";
        else if(absVx>5.5)col=Math.random()<.5?"#c0ff40":"#ffffff";
        else col=Math.random()<.5?"#80ee20":"#ccff88";
        addTrail(gs,tx,ty,col,gs.pvx);
      }

      // Platform collisions
      if(gs.pvy>0){
        for(const p of gs.platforms){
          const prevPy=gs.py-gs.pvy;
          const overlapsX=gs.px+8<p.x+p.w-8&&gs.px+PLAYER_W-8>p.x+8;
          const landedOn=prevPy+PLAYER_H<=p.y+4&&gs.py+PLAYER_H>=p.y&&gs.py+PLAYER_H<=p.y+p.h+12;
          if(overlapsX&&landedOn){
            if(p.type==="broken"){if(!p.cracked){p.cracked=true;p.crackedTimer=0;}else continue;}
            if(p.type==="disappear")p.used=true;
            if(gs.combo>0){gs.combo=0;gs.comboTimer=0;}
            if(p.type==="spring"){gs.pvy=SPRING_JUMP;p.bounceTimer=12;sfxSpring();addParticles(gs,p.x+p.w/2,p.y,"#ff6090",8);addFloat(gs,p.x+p.w/2,p.y-20,"BOING!","#e8305a");}
            else{gs.pvy=BASE_JUMP;p.bounceTimer=8;sfxJump();if(p.type!=="disappear")addParticles(gs,p.x+p.w/2,p.y,ZONE_PLAT_COLORS[gs.zone][1],4);}
            gs.py=p.y-PLAYER_H;break;
          }
        }
      }

      // Platform update
      gs.platforms.forEach((p)=>{if(p.bounceTimer>0)p.bounceTimer--;if(p.type==="moving"){p.x+=p.vx;if(p.x<=0||p.x+p.w>=W)p.vx*=-1;}if(p.cracked)p.crackedTimer++;});
      gs.platforms=gs.platforms.filter((p)=>{if(p.cracked&&p.crackedTimer>28)return false;if(p.used&&p.type==="disappear")return false;return toScreen(p.y)<H+30;});
      while(gs.platforms.length<22){const highest=gs.platforms.length?Math.min(...gs.platforms.map((p)=>p.y)):gs.camY;if(highest<gs.camY-80)break;gs.platforms.push(makePlat(gs.pid++,0,highest-platGap(gs.score),gs.score));}

      // Powerups
      gs.powerups.forEach((pu)=>{
        if(pu.collected)return;
        const dx=gs.px+PLAYER_W/2-(pu.x+15),dy=(gs.py+PLAYER_H/2)-(pu.y+15);
        if(Math.abs(dx)<28&&Math.abs(dy)<28){
          pu.collected=true;sfxPowerup();
          if(pu.type==="jetpack"){gs.jetpack=180;addFloat(gs,gs.px+PLAYER_W/2,gs.py,"🚀 JETPACK!","#e04020",true);}
          else if(pu.type==="hat"){gs.hat=300;addFloat(gs,gs.px+PLAYER_W/2,gs.py,"🎩 PROPELLER!","#4040dd",true);}
          else if(pu.type==="dash"){gs.dash=90;sfxDash();addFloat(gs,gs.px+PLAYER_W/2,gs.py,"⚡ DASH!","#ffcc00",true);}
          else if(pu.type==="heart"&&gs.lives<MAX_LIVES){gs.lives++;addFloat(gs,gs.px+PLAYER_W/2,gs.py,"❤️ +1 LIFE!","#ee2040",true);}
          addParticles(gs,pu.x+15,pu.y+15,pu.type==="dash"?"#ffee40":pu.type==="heart"?"#ff8080":"#ffcc00",12);
        }
      });
      gs.powerups=gs.powerups.filter((pu)=>!pu.collected&&toScreen(pu.y)<H+30);
      // Spawn powerups
      if(gs.score>200&&Math.random()<.0006) gs.powerups.push({id:gs.puid++,x:Math.random()*(W-40),y:gs.camY-100-Math.random()*150,type:Math.random()<.35?"jetpack":Math.random()<.5?"hat":"dash",collected:false});
      if(gs.score>500&&gs.lives<MAX_LIVES&&Math.random()<.0003) gs.powerups.push({id:gs.puid++,x:Math.random()*(W-40),y:gs.camY-120-Math.random()*100,type:"heart",collected:false});

      // Monsters
      if(gs.score>300&&gs.monsters.filter((m)=>m.alive).length<Math.min(Math.floor(gs.score/800)+1,4)&&Math.random()<.004)
        gs.monsters.push(makeMonster(gs.mid++,gs.camY,gs.score));
      gs.monsters.forEach((m)=>{
        if(!m.alive)return;
        m.x+=m.vx;m.frame++;if(m.x<=0||m.x+m.w>=W)m.vx*=-1;
        if(m.type==="ufo")m.y+=Math.sin(m.frame*.04)*.8;if(m.type==="bat")m.y+=Math.sin(m.frame*.06)*1.2-.1;
        const mR=m.x+m.w,mB=m.y+m.h,pR=gs.px+PLAYER_W,pB=gs.py+PLAYER_H;
        const overlap=gs.px+10<mR-10&&pR-10>m.x+10&&gs.py+8<mB-8&&pB-8>m.y+8;
        if(overlap){
          if(gs.pvy>0&&gs.py+PLAYER_H<m.y+m.h*.55){
            m.hp--;
            if(m.hp<=0){
              m.alive=false;gs.combo++;sfxStomp(gs.combo);gs.comboTimer=180;
              const base=m.type==="ufo"?200:m.type==="bat"?150:100,bonus=base*gs.combo;
              gs.score+=bonus;addParticles(gs,m.x+m.w/2,m.y+m.h/2,"#ff6030",16);
              if(gs.combo>=2)addFloat(gs,m.x+m.w/2,m.y-10,`x${gs.combo} COMBO!  +${bonus}`,gs.combo>=4?"#dd00ff":gs.combo>=3?"#ff4400":"#ff9000",true);
              else addFloat(gs,m.x+m.w/2,m.y-10,`+${bonus}`,"#ff4020");
              if(gs.combo>=3)addParticles(gs,m.x+m.w/2,m.y+m.h/2,gs.combo>=4?"#dd00ff":"#ff6000",12);
            }
            gs.pvy=BASE_JUMP;
          } else if(gs.invincible===0){
            // Take a hit
            gs.lives--;sfxHit();gs.invincible=INVINCIBLE_FRAMES;
            addParticles(gs,gs.px+PLAYER_W/2,gs.py+PLAYER_H/2,"#ff4040",12);
            if(gs.lives<=0)die(gs);
            else addFloat(gs,gs.px+PLAYER_W/2,gs.py-20,"OUCH!","#ff2020",true);
          }
        }
      });
      gs.monsters=gs.monsters.filter((m)=>m.alive&&toScreen(m.y)<H+80);

      // Particles & floats
      gs.particles.forEach((p)=>{p.x+=p.vx;p.y+=p.vy;p.vy+=p.trail?.04:.12;p.life-=p.trail?.07:.025;});
      gs.particles=gs.particles.filter((p)=>p.life>0);
      gs.floats.forEach((f)=>{f.y+=f.vy;f.life-=.018;});
      gs.floats=gs.floats.filter((f)=>f.life>0);

      // Fall off screen — spend a life first, checkpoint is the final safety net
      if(toScreen(gs.py)>H+60){
        if(gs.lives>1){
          gs.lives--;sfxHit();
          gs.invincible=INVINCIBLE_FRAMES*2;
          gs.py=gs.camY+H*.52-PLAYER_H;gs.px=W/2-PLAYER_W/2;gs.pvx=0;gs.pvy=BASE_JUMP;
          gs.platforms=freshPlatforms(gs.camY,gs.score);gs.monsters=[];gs.combo=0;gs.comboTimer=0;
          addFloat(gs,W/2,gs.py-30,`❤️ ${gs.lives} ${gs.lives===1?"life":"lives"} left!`,"#ee2040",true);
        } else if(gs.checkpoint&&!gs.checkpointUsed){
          respawn(gs);
        } else {
          die(gs);
        }
      }
    }

    function respawn(gs:GS){
      gs.checkpointUsed=true;sfxRespawn();
      gs.camY=gs.checkpoint!.camY;
      gs.scrolled=gs.checkpoint!.score*4;
      gs.score=gs.checkpoint!.score;
      gs.py=gs.camY+H*.58-PLAYER_H;gs.px=W/2-PLAYER_W/2;gs.pvx=0;gs.pvy=BASE_JUMP;
      gs.lives=1;gs.invincible=INVINCIBLE_FRAMES*2; // Extra protection on respawn
      gs.platforms=freshPlatforms(gs.camY,gs.score);gs.monsters=[];gs.combo=0;gs.comboTimer=0;
      addFloat(gs,W/2,gs.py-40,"CHECKPOINT RESPAWN!","#20aa50",true);
    }

    function die(gs:GS){
      if(gs.phase!=="playing")return;gs.phase="dead";sfxDie();
      if(gs.score>hiRef.current){hiRef.current=gs.score;gs.hi=gs.score;localStorage.setItem("djhi",String(gs.score));}
    }

    function loop(){update();render();rafRef.current=requestAnimationFrame(loop);}
    rafRef.current=requestAnimationFrame(loop);
    return()=>cancelAnimationFrame(rafRef.current);
  },[]);

  const handleTouchStart=useCallback((e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();const gs=gsRef.current,canvas=canvasRef.current!,rect=canvas.getBoundingClientRect();
    const t=e.touches[0],mx=(t.clientX-rect.left)*(W/rect.width),my=(t.clientY-rect.top)*(H/rect.height);
    if(gs.phase==="menu"){if(mx>W/2-85&&mx<W/2+85&&my>254&&my<302)startGame();return;}
    if(gs.phase==="dead"){if(mx>W/2-82&&mx<W/2+82&&my>330&&my<380)startGame();return;}
    gs.touchTargetX=mx;
  },[startGame]);

  const handleTouchMove=useCallback((e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();const gs=gsRef.current;if(gs.phase!=="playing")return;
    const canvas=canvasRef.current!,rect=canvas.getBoundingClientRect(),t=e.touches[0];
    gs.touchTargetX=(t.clientX-rect.left)*(W/rect.width);
  },[]);

  const handleTouchEnd=useCallback((e:React.TouchEvent<HTMLCanvasElement>)=>{
    e.preventDefault();gsRef.current.touchTargetX=null;gsRef.current.pvx*=.5;
  },[]);

  const handleClick=useCallback((e:React.MouseEvent<HTMLCanvasElement>)=>{
    const gs=gsRef.current,canvas=canvasRef.current!,rect=canvas.getBoundingClientRect();
    const mx=(e.clientX-rect.left)*(W/rect.width),my=(e.clientY-rect.top)*(H/rect.height);
    if(gs.phase==="menu"&&mx>W/2-85&&mx<W/2+85&&my>254&&my<302)startGame();
    if(gs.phase==="dead"&&mx>W/2-82&&mx<W/2+82&&my>330&&my<380)startGame();
  },[startGame]);

  return(
    <div style={{width:"100vw",height:"100dvh",display:"flex",alignItems:"center",justifyContent:"center",background:"#1a1a2e",overflow:"hidden"}}>
      <button onClick={toggleMute} title={muted?"Unmute":"Mute"}
        style={{position:"fixed",top:14,right:14,zIndex:100,width:40,height:40,borderRadius:"50%",border:"none",background:"rgba(255,255,255,0.12)",backdropFilter:"blur(6px)",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:20,lineHeight:"1",color:"#fff",boxShadow:"0 2px 8px rgba(0,0,0,0.4)",transition:"background 0.15s, transform 0.1s"}}
        onMouseEnter={e=>(e.currentTarget.style.background="rgba(255,255,255,0.22)")}
        onMouseLeave={e=>(e.currentTarget.style.background="rgba(255,255,255,0.12)")}
        onMouseDown={e=>(e.currentTarget.style.transform="scale(0.92)")}
        onMouseUp={e=>(e.currentTarget.style.transform="scale(1)")}
      >{muted?"🔇":"🔊"}</button>

      {/* Left ad — hidden on narrow screens via CSS */}
      <div className="side-ad">
        <div id="container-fa2c350cca8a171485363cea2b95dd75"></div>
      </div>

      <div style={{position:"relative",borderRadius:"12px",overflow:"hidden",boxShadow:"0 8px 40px rgba(0,0,0,0.7), 0 0 0 3px #2a9010",flexShrink:0}}>
        <canvas ref={canvasRef} width={W} height={H}
          style={{display:"block",maxHeight:"100dvh",maxWidth:"100vw",width:"auto",height:"auto",cursor:"default",touchAction:"none",userSelect:"none"}}
          onClick={handleClick} onTouchStart={handleTouchStart} onTouchMove={handleTouchMove} onTouchEnd={handleTouchEnd}/>
      </div>

      {/* Right ad in its own iframe so the ad script can target the same container ID */}
      <div className="side-ad">
        <iframe
          title="Advertisement"
          scrolling="no"
          style={{border:"none",width:160,height:600,display:"block"}}
          srcDoc={adSrc}
        />
      </div>
    </div>
  );
}
