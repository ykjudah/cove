const {test}=require('node:test'),assert=require('node:assert/strict'),C=require('../src/chess-game.cjs');
const players={w:'a',b:'b'},start=fen=>C.initial(players,0,0,fen);
function play(s,m){return C.applyMove(s,m,s.players[s.turn]);}
test('chess rejects castling through check, pinned en passant, and moves leaving king in check',()=>{
 let g=new C.Chess('4k3/8/8/8/8/5r2/8/4K2R w K - 0 1');assert.ok(!g.moves().includes('O-O'));
 g=new C.Chess('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1');assert.ok(g.moves().includes('O-O'));assert.ok(g.moves().includes('O-O-O'));
 g=new C.Chess('k3r3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');assert.throws(()=>g.move({from:'e5',to:'d6'}));
 assert.throws(()=>C.applyMove(start(),{from:'e2',to:'e4'},'b'),/turn/);
});
test('en passant expires after one turn, all four promotions are legal, and save/load is exact',()=>{
 let s=start();for(const m of ['e4','a6','e5','d5'])s=play(s,m);
 assert.ok(C.engine(s).moves().includes('exd6'));const captured=play(s,{from:'e5',to:'d6'});assert.equal(captured.position.d5,undefined);assert.equal(captured.position.d6.type,'p');
 s=play(s,'Nf3');s=play(s,'h6');assert.ok(!C.engine(s).moves().includes('exd6'));
 for(const promotion of ['q','r','b','n']){const p=play(start('7k/P7/8/8/8/8/8/7K w - - 0 1'),{from:'a7',to:'a8',promotion});assert.equal(p.position.a8.type,promotion);assert.equal(C.engine(JSON.parse(JSON.stringify(p))).fen(),p.fen);}
});
test('chess results: mate, stalemate, repetition, fifty moves and insufficient material',()=>{
 let s=start();for(const m of ['f3','e5','g4','Qh4#'])s=play(s,m);assert.deepEqual(s.result,{winner:'b',reason:'checkmate'});assert.throws(()=>play(s,'a3'));
 assert.equal(C.boardResult(new C.Chess('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1')).reason,'stalemate');
 s=start();for(const m of ['Nf3','Nf6','Ng1','Ng8','Nf3','Nf6','Ng1','Ng8'])s=play(s,m);assert.equal(s.result.reason,'threefold repetition');assert.equal(C.engine(s).isThreefoldRepetition(),true);
 s=play(start('k7/8/8/8/8/8/8/K6R w - - 99 1'),{from:'h1',to:'h2'});assert.equal(s.result.reason,'fifty-move rule');
 for(const fen of ['7k/8/8/8/8/8/8/K7 w - - 0 1','7k/8/8/8/8/8/8/KB6 w - - 0 1','7k/8/8/8/8/8/8/KN6 w - - 0 1','5b1k/8/8/8/8/8/8/K1B5 w - - 0 1'])assert.equal(C.boardResult(new C.Chess(fen)).reason,'insufficient material');
});
test('timeout uses remaining mating material, and clocks continue offline without trusting device date',()=>{
 const s=C.initial(players,60,1000);assert.equal(C.clockLeft(s,'w',2000),59000);assert.equal(C.clockLeft(s,'b',2000),60000);assert.equal(C.clockLeft(s,'w',90000),0);assert.equal(C.clockLeft(start(),'w',90000),null);
 for(const fen of ['7k/8/8/8/8/8/8/KQ6 w - - 0 1','6nk/8/8/8/8/8/8/KQ6 w - - 0 1','5b1k/8/8/8/8/8/8/KQ6 w - - 0 1'])assert.equal(C.timeoutResult(start(fen),'w').winner,null);
 assert.equal(C.timeoutResult(start('5nnk/8/8/8/8/8/8/KQ6 w - - 0 1'),'w').winner,'b');
 assert.equal(C.timeoutResult(s,'w').winner,'b');
});
test('saved move tampering is rejected and opponent replay agrees',()=>{
 const s=start(),m={from:'e2',to:'e4'},next=play(s,m);assert.deepEqual(play(JSON.parse(JSON.stringify(s)),m),next);
 const bad=JSON.parse(JSON.stringify(next));bad.fen=s.fen;assert.throws(()=>C.engine(bad));bad.fen=next.fen;bad.moves[0].san='a4';assert.throws(()=>C.engine(bad));
 for(const kind of ['p','n','b','r','q','k'])for(const color of ['w','b']){const svg=C.pieceSVG(kind,color);assert.ok(svg.includes('<path'));assert.ok(!svg.includes('http://www.chess.com'));}
});
