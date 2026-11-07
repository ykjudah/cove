const {test}=require('node:test'),assert=require('node:assert/strict'),G=require('../src/mini-golf.cjs');
const copy=x=>JSON.parse(JSON.stringify(x));
test('golf courses vary in size and deterministic shots restore/replay without mutations',()=>{
 assert.equal(G.COURSES.length,29);assert.ok(new Set(G.COURSES.map(c=>c.h)).size>5);
 for(let h=0;h<G.COURSES.length;h++){const s=h===0?G.initial(['a','b'],12345):G.initial(['a','b'],12345,3,[h,...[1,2,3].filter(n=>n!==h).slice(0,2)]);s.balls=[-9,9].map(dx=>({x:G.COURSES[h].start[0]+dx,y:G.COURSES[h].start[1],sunk:false}));const before=copy(s);for(const power of [.08,.5,1]){const shot={angle:-Math.PI/2,power};const a=G.simulate(s,shot,'a'),b=G.simulate(copy(s),copy(shot),'a');assert.deepEqual(a,b);G.validate(a);assert.equal(a.scores[0][s.hole],1);assert.equal(a.shotNumber,1);assert.ok(a.obstacleTick>0&&a.obstacleTick<=1200);}assert.deepEqual(s,before);}
});
test('golf turn guards, no accidental taps, stroke cap, final tie and victory',()=>{
 const s=G.initial(['a','b']);assert.throws(()=>G.start(s,{angle:0,power:.5},'b'),/turn/);assert.throws(()=>G.start(s,{angle:0,power:0},'a'),/shot/);
 s.scores[0][0]=9;const capped=G.simulate(s,{angle:0,power:.08},'a');assert.equal(capped.balls[0].sunk,true);assert.equal(capped.turn,'b');
 for(const tie of [true,false]){const q=G.initial(['a','b']);q.hole=8;q.scores=[Array(9).fill(2),Array(9).fill(2)];q.scores[0][8]=9;q.scores[1][8]=tie?10:9;q.balls=[{x:85,y:760,sunk:false},{x:390,y:85,sunk:true}];const end=G.simulate(q,{angle:0,power:.08},'a');assert.equal(end.finished,true);assert.equal(end.winner,tie?null:'b');}
});
test('generous cup catches fast putts, scoring skips holed opponent and advances holes',()=>{
 const s=G.initial(['a','b']);s.balls[0]={x:150,y:120,sunk:false};let end=G.simulate(s,{angle:-Math.PI/2,power:1},'a');assert.equal(end.balls[0].sunk,true);assert.equal(end.turn,'b');assert.equal(end.scores[0][0],1);
 end.balls[1]={x:150,y:120,sunk:false};end=G.simulate(end,{angle:-Math.PI/2,power:1},'b');assert.equal(end.hole,1);assert.equal(end.lastHole,0);assert.equal(end.turn,'b');assert.deepEqual(end.balls[0],{x:86,y:500,sunk:false});
});
test('pads use saved PRNG, walls cannot tunnel, short power guide and moving blades use saved tick',()=>{
 const s=G.initial(['a','b'],123);s.hole=4;s.balls=[{x:285,y:435,sunk:false},{x:100,y:545,sunk:false}];const shot={angle:-Math.PI/2,power:.8},a=G.simulate(s,shot,'a');assert.notEqual(a.seed,s.seed);assert.deepEqual(a,G.simulate(copy(s),shot,'a'));
 const wall=G.initial(['a','b']);wall.balls[0]={x:250,y:300,sunk:false};const run=G.start(wall,{angle:0,power:1},'a');while(G.step(run)){assert.ok(run.state.balls[0].x<270&&run.state.balls[0].x>30);assert.ok(run.state.balls[0].y<445&&run.state.balls[0].y>25);}
 assert.equal(G.aimPath(wall,0).length,2);assert.ok(G.aimPath(wall,0)[1].x<270);const low=G.aimPath(G.initial(['a','b']),-Math.PI/2,.1),high=G.aimPath(G.initial(['a','b']),-Math.PI/2,1);assert.ok(low[0].y-low[1].y<high[0].y-high[1].y);assert.ok(high[0].y-high[1].y<=134);assert.notDeepEqual(G.segments(G.COURSES[3],0),G.segments(G.COURSES[3],60));
});

test('player keeps putting until holed or capped',()=>{const s=G.initial(['a','b']);const end=G.simulate(s,{angle:0,power:.08},'a');assert.equal(end.turn,'a');assert.equal(end.balls[0].sunk,false);assert.throws(()=>G.start(end,{angle:0,power:.2},'b'),/turn/);assert.equal(G.start(s,{angle:0,power:1},'a').vx,1300);});

test('3 and 5 hole matches save their selection and end at the selected hole',()=>{for(const count of [3,5]){const s=G.initial(['a','b'],123,count);assert.equal(s.holeCount,count);assert.ok(G.getCourse(s).h>=590);s.hole=count-1;s.scores[0][s.hole]=9;s.balls[1].sunk=true;const end=G.simulate(s,{angle:0,power:.08},'a');assert.equal(end.finished,true);assert.equal(end.hole,count-1);G.validate(end);}});

test('saved shuffled courses survive reload and cannot contain duplicates',()=>{const G=require('../src/mini-golf.cjs'),s=G.initial(['a','b'],123,3,[8,2,6]);assert.equal(G.getCourse(s),G.COURSES[8]);assert.deepEqual(G.getCourse(JSON.parse(JSON.stringify(s))),G.COURSES[8]);assert.throws(()=>G.validate({...s,courseOrder:[2,2,3]}),/course order/);});

test('randomizers remain solid at full power and emit outward',()=>{const s=G.initial(['a','b']);s.hole=4;s.balls[0]={x:285,y:470,sunk:false};const pad=G.COURSES[4].pads[0],run=G.start(s,{angle:-Math.PI/2,power:1},'a');let touched=false;while(G.step(run)){const b=run.state.balls[0];assert.ok(Math.hypot(b.x-pad.x,b.y-pad.y)>=pad.r+6-.001);if(run.state.seed!==s.seed)touched=true;}assert.ok(touched);});
test('hole-in-one filter uses a real pocket, not the stroke cap',()=>{const s=G.initial(['a','b']);s.balls[0]={x:150,y:120,sunk:false};assert.equal(G.shotPockets(s,{angle:-Math.PI/2,power:.5},'a'),true);s.balls[0]={x:100,y:390,sunk:false};s.scores[0][0]=9;assert.equal(G.shotPockets(s,{angle:0,power:.08},'a'),false);});
test('all slopes span complete straight passages, and tees/cups are inside courses',()=>{function inside(c,x,y){let v=false;for(let i=0,j=c.outline.length-1;i<c.outline.length;j=i++){const a=c.outline[i],b=c.outline[j];if((a[1]>y)!==(b[1]>y)&&x<(b[0]-a[0])*(y-a[1])/(b[1]-a[1])+a[0])v=!v;}return v;}for(const c of G.COURSES){assert.ok(inside(c,...c.start),c.name+' tee');assert.ok(inside(c,...c.cup),c.name+' cup');for(const s of c.slopes){assert.equal(s.dx,0,c.name);for(const f of [.05,.5,.95]){const y=s.y+s.h*f;assert.ok(inside(c,s.x+.1,y)&&inside(c,s.x+s.w-.1,y),c.name+' slope inside');assert.ok(!inside(c,s.x-.1,y)&&!inside(c,s.x+s.w+.1,y),c.name+' slope spans full width');}}}});
