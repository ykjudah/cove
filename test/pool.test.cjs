const {test}=require('node:test'),assert=require('node:assert/strict'),P=require('../src/eight-ball.cjs');
const clone=x=>JSON.parse(JSON.stringify(x));
test('pool deterministic replay, save/load, turn lock and valid rack',()=>{
 const s=P.initial(['alice','bob'],1);assert.equal(s.balls.length,16);assert.equal(s.balls.find(b=>b.n===8).x,85);
 for(const angle of [0,.13,-.6,1.1,2.4]){const shot={angle,power:.9},a=P.simulate(s,shot,'alice'),b=P.simulate(clone(s),clone(shot),'alice');assert.deepEqual(a,b);P.validate(a);assert.ok(a.balls.every(b=>!b.vx&&!b.vy));assert.equal(a.shotNumber,1);}
 assert.throws(()=>P.start(s,{angle:0,power:1},'bob'),/turn/);assert.throws(()=>P.start(s,{angle:NaN,power:1},'alice'));assert.throws(()=>P.start(s,{angle:0,power:1,cue:{x:0,y:0}},'alice'));
});
function result({own=null,pots=[],first=1,br=false,clear=false}={}){const s=P.initial(['a','b'],1);s.break=br;if(own)s.groups=[own,own==='solids'?'stripes':'solids'];if(clear)for(const b of s.balls)if(P.group(b.n)===own)b.pocketed=true;const r={before:clone(s),state:clone(s),first,pots};for(const n of pots)r.state.balls.find(b=>b.n===n).pocketed=true;return P.resolve(r);}
test('pool rules: break, groups, own pots, misses and fouls',()=>{
 assert.deepEqual(result({pots:[1],br:true}).groups,[null,null]);
 const a=result({pots:[9],first:9});assert.deepEqual(a.groups,['stripes','solids']);assert.equal(a.turn,'a');
 assert.equal(result({own:'solids',pots:[1,9]}).turn,'a');assert.equal(result({own:'solids',pots:[]}).turn,'b');
 for(const input of [{own:'solids',first:9,pots:[1]},{first:null},{pots:[0,1]}]){const s=result(input);assert.equal(s.turn,'b');assert.equal(s.ballInHand,true);assert.deepEqual(s.groups,input.own?['solids','stripes']:[null,null]);}
});
test('pool wins and losses, ball-in-hand rejects overlaps and pockets',()=>{
 assert.equal(result({own:'solids',clear:true,pots:[8],first:8}).winner,'a');
 assert.equal(result({own:'solids',clear:true,pots:[8,0],first:8}).winner,'b');
 assert.equal(result({own:'solids',pots:[8],first:8}).winner,'b');
 assert.equal(result({own:'solids',clear:true,pots:[0],first:8}).winner,'b');
 const s=P.initial(['a','b'],1);assert.equal(P.canPlace(s,59.4,0),false);assert.equal(P.canPlace(s,168,98),false);assert.equal(P.canPlace(s,-100,0),true);
 s.ballInHand=true;assert.throws(()=>P.start(s,{angle:0,power:1},'a'));assert.doesNotThrow(()=>P.start(s,{angle:0,power:1,cue:{x:-100,y:0}},'a'));
});
test('source physics: friction, rail reflection, pocket threshold and equal-mass transfer',()=>{
 function run(x,y,vx,vy){const s=P.initial(['a','b'],1);s.balls.forEach(b=>{b.pocketed=b.n!==0;});Object.assign(s.balls[0],{x,y,vx,vy});return {state:s,before:clone(s),pots:[],first:null,frames:0};}
 let r=run(0,0,10,0);P.step(r);assert.equal(r.state.balls[0].vx,9.8);assert.equal(r.state.balls[0].x,9.8);
 r=run(162,0,5,0);P.step(r);assert.ok(r.state.balls[0].vx<0);
 r=run(0,89,0,5);P.step(r);assert.ok(r.pots.includes(0));
 r=run(0,0,5,0);Object.assign(r.state.balls[1],{x:17,y:0,pocketed:false});P.step(r);assert.equal(r.first,1);assert.ok(r.state.balls[1].vx>0);
});
test('visual rolling preserves orthonormal axes and cue deflection follows collision tangent',()=>{
 const identity=[1,0,0,0,1,0,0,0,1];assert.deepEqual(P.rollFrame(identity,0,0),identity);
 let m=identity;for(let i=0;i<100;i++)m=P.rollFrame(m,1,.7);
 for(let i=0;i<3;i++)assert.ok(Math.abs(Math.hypot(m[i],m[i+3],m[i+6])-1)<1e-10);
 const d=P.cueDeflection(0,{x:0,y:0,target:{x:14/Math.sqrt(2),y:14/Math.sqrt(2)}});assert.ok(Math.abs(d.x-.5)<1e-10);assert.ok(Math.abs(d.y+.5)<1e-10);
 assert.deepEqual(P.cueDeflection(0,{x:0,y:0,target:{x:14,y:0}}),{x:0,y:0});
});

test('new geometry is 2:1 with proportional balls, deterministic replay and smooth wraparound aiming',()=>{
 const s=P.initial(['a','b'],2),g=P.geometry(s);assert.equal(s.version,2);assert.equal(g.length/200,2);assert.equal(g.diameter,10.5);
 for(const a of s.balls)for(const b of s.balls)if(a.n!==b.n)assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=g.diameter);
 assert.equal(P.canPlace(s,190,0),true);assert.equal(P.canPlace(s,196,0),false);
 for(const angle of [0,.15,-.3,1.2]){const shot={angle,power:1};assert.deepEqual(P.simulate(s,shot,'a'),P.simulate(clone(s),shot,'a'));}
 const v=P.smoothAngle(Math.PI-.05,-Math.PI+.05,16);assert.ok(v>Math.PI-.05&&v<Math.PI+.05);
 const a=P.smoothAngle(0,1,16);assert.ok(a>0&&a<1);assert.ok(Math.abs(P.smoothAngle(a,1,16)-P.smoothAngle(0,1,32))<1e-12);
});

test('called eight-ball pockets reset per shot and wrong pocket loses',()=>{
 const s=P.initial(['a','b']);s.break=false;s.groups=['solids','stripes'];for(const b of s.balls)if(P.group(b.n)==='solids')b.pocketed=true;
 assert.equal(P.onEight(s),true);assert.throws(()=>P.start(s,{angle:0,power:.4},'a'),/Choose/);
 for(const pocket of [0,5]){const run=P.start(s,{angle:0,power:.4,calledPocket:pocket},'a');run.first=8;run.pots=[8];run.pockets={8:0};assert.equal(P.resolve(run).winner,pocket===0?'a':'b');}
 const run=P.start(s,{angle:0,power:.4,calledPocket:0},'a');run.first=8;assert.equal(P.resolve(run).turn,'b');assert.equal(run.state.calledPocket,undefined);
 run.state.turn='a';run.state.balls.forEach(b=>{b.vx=b.vy=0;});assert.doesNotThrow(()=>P.start(run.state,{angle:0,power:.4,calledPocket:5},'a'));
});
test('smaller pocket capture and deterministic owner magnet shot data',()=>{
 function make(version,magnets){const s=P.initial(['a','b'],version);s.balls.forEach(b=>b.pocketed=b.n!==0);Object.assign(s.balls[0],{x:0,y:89,vx:0,vy:.2});return {state:s,before:clone(s),first:null,pots:[],pockets:{},shot:{magnets},frames:0};}
 const old=make(2,false),small=make(3,false);P.step(old);P.step(small);assert.ok(old.pots.includes(0));assert.ok(!small.pots.includes(0));
 const on=make(3,true),off=make(3,false);on.state.balls[0].y=off.state.balls[0].y=70;P.step(on);P.step(off);assert.ok(on.state.balls[0].vy>off.state.balls[0].vy);
 const s=P.initial(['a','b']),shot={angle:.1,power:1,magnets:true};assert.deepEqual(P.simulate(s,shot,'a'),P.simulate(clone(s),shot,'a'));
 assert.throws(()=>P.start(P.initial(['a','b'],2),shot,'a'),/new game/);
});

test('adjustable magnets affect only assigned balls, never cue/opponent, and the eight only when eligible',()=>{
 function run(n,strength,own='solids',cleared=false){const s=P.initial(['a','b']);s.groups=own?[own,own==='solids'?'stripes':'solids']:[null,null];s.break=false;s.balls.forEach(b=>{b.pocketed=cleared||b.n!==n;});Object.assign(s.balls.find(b=>b.n===n),{x:0,y:70,vx:0,vy:.3,pocketed:false});if(!cleared&&n!==1)Object.assign(s.balls.find(b=>b.n===1),{x:20,y:0,pocketed:false});return {state:s,before:clone(s),first:null,pots:[],pockets:{},shot:{magnets:true,magnetStrength:strength},frames:0};}
 for(const n of [0,9,8]){const a=run(n,1),b=run(n,0);P.step(a);P.step(b);assert.deepEqual(a.state.balls,b.state.balls);}
 const weak=run(1,.25),strong=run(1,1);P.step(weak);P.step(strong);assert.ok(strong.state.balls[1].vy>weak.state.balls[1].vy);
 const open=run(1,1,null),off=run(1,0,null);P.step(open);P.step(off);assert.deepEqual(open.state.balls,off.state.balls);
 assert.equal(P.magnetApplies(run(8,1,'solids',true),{n:8}),true);
 assert.throws(()=>P.start(P.initial(['a','b']),{angle:0,power:1,magnets:true,magnetStrength:2},'a'),/strength/);
 const s=P.initial(['a','b']);s.groups=['solids','stripes'];const shot={angle:.1,power:1,magnets:true,magnetStrength:.75};assert.deepEqual(P.simulate(s,shot,'a'),P.simulate(clone(s),shot,'a'));
});

test('double-strength magnets preserve old replays and full trajectory predicts the same result',()=>{
 const state=P.initial(['a','b']);state.groups=['solids','stripes'];state.break=false;
 state.balls.forEach(b=>b.pocketed=b.n!==1);Object.assign(state.balls[1],{x:0,y:70,vx:0,vy:.3});
 const run=boost=>({state:clone(state),before:clone(state),first:null,pots:[],pockets:{},frames:0,shot:{magnets:true,magnetStrength:.6,...(boost?{magnetBoost:2}:{})}});
 const off=run(false),old=run(false),boosted=run(true);off.shot.magnetStrength=0;P.step(off);P.step(old);P.step(boosted);
 assert.ok(Math.abs((boosted.state.balls[1].vy-off.state.balls[1].vy)-2*(old.state.balls[1].vy-off.state.balls[1].vy))<2e-6);
 const s=P.initial(['a','b']),shot={angle:.08,power:.85,magnets:true,magnetStrength:.6,magnetBoost:2};const result=P.trajectory(s,shot,'a');
 assert.deepEqual(result.end,P.simulate(s,shot,'a'));assert.ok(result.paths[0].length>10);assert.deepEqual(s,P.initial(['a','b']));
});
