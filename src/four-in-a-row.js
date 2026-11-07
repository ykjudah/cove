const names = {pool:'8-ball pool', chess:'Chess', golf:'Mini golf', four:'Four in a Row'};
export {names as gameNames};

function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function action(label, invoke) {
  const button = element('button', label);
  button.type = 'button';
  button.onclick = async () => {
    button.disabled = true;
    try { await invoke(); } finally { button.disabled = false; }
  };
  return button;
}
export function fourThumbnail() {
  const picture = element('div', '', 'four-thumbnail');
  picture.setAttribute('aria-hidden','true');
  for (const color of '...R....YY..RY.YRRYRR') picture.append(element('i','',color));
  return picture;
}
export function fourBoard(message,user,invoke) {
  const state=message.system_event;
  const card=element('section','','four-card');
  const invited=state.players.length===1;
  const canMove=state.kind==='four' && (invited ? message.sender_id!==user : state.players[1-state.revision%2]===user);
  card.append(element('strong',names.four),element('span',state.kind==='four_draw'?'Draw':invited?(canMove?'Drop a disc to accept and play.':'Waiting for an opponent'):canMove?'Your turn':state.players.includes(user)?'Their turn':'Watching'));
  const board=element('div','','four-board');
  for(let column=0;column<7;column++) {
    const button=action('',()=>invoke('drop_four_disc',{item_id:message.id,col:column,expected_revision:state.revision}));
    button.disabled=!canMove || state.board[column]!=='.';
    button.setAttribute('aria-label','Drop in column '+(column+1));
    for(let row=0;row<6;row++)button.append(element('i','',state.board[row*7+column]));
    board.append(button);
  }
  card.append(board);
  return card;
}
