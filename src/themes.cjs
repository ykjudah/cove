const defaults = { mode: 'dark', colors: ['#20b8c9'], intensity: 0 };
function normalize(value) {
  return {
    mode: value?.mode === 'light' ? 'light' : 'dark',
    colors: Array.isArray(value?.colors) && value.colors.some(c => /^#[0-9a-f]{6}$/i.test(c))
      ? value.colors.filter(c => /^#[0-9a-f]{6}$/i.test(c)).slice(0, 3) : [...defaults.colors],
    intensity: Number.isFinite(value?.intensity) ? Math.max(0, Math.min(100, value.intensity)) : 0,
  };
}
function rgb(hex) { return [1,3,5].map(i => parseInt(hex.slice(i,i+2),16)); }
function mix(a,b,t) { return '#'+rgb(a).map((v,i)=>Math.round(v*(1-t)+rgb(b)[i]*t).toString(16).padStart(2,'0')).join(''); }
function hsv(hex) {
  const [r,g,b]=rgb(hex).map(v=>v/255), max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if(d) h=(max===r?(g-b)/d+(g<b?6:0):max===g?(b-r)/d+2:(r-g)/d+4)*60;
  return [h,max?d/max:0,max];
}
function hex(h,s,v) {
  const c=v*s,x=c*(1-Math.abs(h/60%2-1)),m=v-c;
  const parts=h<60?[c,x,0]:h<120?[x,c,0]:h<180?[0,c,x]:h<240?[0,x,c]:h<300?[x,0,c]:[c,0,x];
  return '#'+parts.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
function mount(root, setAccent) {
  let saved;
  try { saved=normalize(JSON.parse(localStorage.getItem('sahur-theme'))); } catch { saved=normalize(null); }
  if(!localStorage.getItem('sahur-theme')) saved.colors=[localStorage.getItem('pocketchat-accent')||defaults.colors[0]];
  let draft=normalize(saved), selected=0, customOpen=false;
  const presets=[['Cove','#20b8b0','dark'],['Original','#b9ef87','dark'],['Midnight','#5865f2','dark'],['Rose','#ef7adb','dark'],['Ocean','#20b8c9','dark'],['Blush','#ef7adb','light'],['Daylight','#8bb9ed','light']];
  const presetName=theme=>presets.find(([name,color,mode])=>theme.mode===mode&&theme.colors.length===1&&theme.colors[0]===color&&theme.intensity===(['Original','Cove','Ocean'].includes(name)?0:55))?.[0]||'Custom';
  customOpen=presetName(saved)==='Custom';
  root.innerHTML=`<div class="theme-layout"><div><div class="theme-presets" aria-label="Themes"></div></div><div class="theme-editor"><div class="theme-modes"><button type="button" data-mode="dark">Dark</button><button type="button" data-mode="light">Light</button></div><label>Color<div class="theme-saturation" tabindex="0" role="slider" aria-label="Color saturation and brightness"><span></span></div></label><label>Hue<input class="theme-hue" type="range" min="0" max="359" aria-label="Hue"></label><div class="theme-colors"></div><label class="color-row">Hex color<input class="theme-hex" maxlength="7" aria-label="Hex color"></label><button type="button" class="theme-add">+ Add color</button><label>Color intensity <output class="theme-intensity-value"></output><input class="theme-intensity" type="range" min="0" max="100"></label></div><div class="theme-actions"><button type="button" class="theme-reset">Reset</button><button type="button" class="theme-apply primary">Apply</button></div><p class="hint theme-status" role="status">Saved on this computer.</p></div>`;
  const q=s=>root.querySelector(s);
  function apply(theme) {
    const light=theme.mode==='light', amount=theme.intensity/100, base=theme.colors[0];
    const vars={
      '--bg':mix(light?'#ffffff':'#171a22',base,amount*(light?.40:.28)),
      '--panel':mix(light?'#f3f4f6':'#222735',base,amount*(light?.50:.36)),
      '--border':mix(light?'#c8ccd3':'#343a46',base,amount*.45),
      '--text':light?'#171b22':'#eef1f6', '--muted':light?'#4d5563':'#b4becb',
      '--surface':mix(light?'#ffffff':'#242a34',base,amount*.28),
    };
    for(const [key,value] of Object.entries(vars)) document.documentElement.style.setProperty(key,value);
    document.documentElement.dataset.theme=theme.mode;
    document.documentElement.style.colorScheme=theme.mode;
    document.documentElement.style.setProperty('--theme-background',theme.colors.length>1
      ? 'linear-gradient(140deg,'+theme.colors.map(c=>mix(light?'#ffffff':'#171a22',c,amount*(light?.4:.28))).join(',')+')' : vars['--bg']);
    setAccent(base);
  }
  function render() {
    apply(draft);
    q('.theme-editor').hidden=!customOpen;
    root.querySelectorAll('.theme-presets button').forEach(b=>b.setAttribute('aria-pressed',String(b.textContent===(customOpen?'Custom':presetName(draft)))));
    const [h,s,v]=hsv(draft.colors[selected]);
    q('.theme-saturation').style.backgroundColor=hex(h,1,1);
    q('.theme-saturation span').style.left=s*100+'%';
    q('.theme-saturation span').style.top=(1-v)*100+'%';
    q('.theme-saturation').setAttribute('aria-valuetext',Math.round(s*100)+'% saturation, '+Math.round(v*100)+'% brightness');
    q('.theme-hue').value=h; q('.theme-hex').value=draft.colors[selected];
    q('.theme-intensity').value=draft.intensity; q('.theme-intensity-value').textContent=draft.intensity+'%';
    root.querySelectorAll('[data-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.mode===draft.mode)));
    q('.theme-colors').replaceChildren();
    draft.colors.forEach((color,i)=>{
      const button=document.createElement('button');button.type='button';button.style.background=color;
      button.setAttribute('aria-label','Edit color '+(i+1));button.setAttribute('aria-pressed',String(i===selected));
      button.onclick=()=>{selected=i;render();};q('.theme-colors').append(button);
      if(i>0){const remove=document.createElement('button');remove.type='button';remove.textContent='×';remove.setAttribute('aria-label','Remove color '+(i+1));remove.onclick=()=>{draft.colors.splice(i,1);selected=0;render();};q('.theme-colors').append(remove);}
    });
    q('.theme-add').disabled=draft.colors.length>=3;
  }
  for(const [name,color,mode] of presets){
    const b=document.createElement('button');b.type='button';b.textContent=name;b.style.setProperty('--preset-color',color);
    b.onclick=()=>{customOpen=false;draft={mode,colors:[color],intensity:['Original','Cove','Ocean'].includes(name)?0:55};selected=0;render();};q('.theme-presets').append(b);
  }
  const custom=document.createElement('button');custom.type='button';custom.textContent='Custom';custom.style.setProperty('--preset-color','#ffffff');custom.onclick=()=>{customOpen=true;render();};q('.theme-presets').append(custom);
  root.querySelectorAll('[data-mode]').forEach(b=>b.onclick=()=>{draft.mode=b.dataset.mode;render();});
  q('.theme-hex').onchange=e=>{if(/^#[0-9a-f]{6}$/i.test(e.target.value)){draft.colors[selected]=e.target.value;render();}else e.target.value=draft.colors[selected];};
  q('.theme-hue').oninput=e=>{const [,s,v]=hsv(draft.colors[selected]);draft.colors[selected]=hex(+e.target.value,s,v);render();};
  q('.theme-intensity').oninput=e=>{draft.intensity=+e.target.value;render();};
  const pad=q('.theme-saturation');
  function move(e){const rect=pad.getBoundingClientRect();const [h]=hsv(draft.colors[selected]);draft.colors[selected]=hex(h,Math.max(0,Math.min(1,(e.clientX-rect.left)/rect.width)),1-Math.max(0,Math.min(1,(e.clientY-rect.top)/rect.height)));render();}
  pad.onpointerdown=e=>{pad.setPointerCapture(e.pointerId);move(e);};
  pad.onpointermove=e=>{if(pad.hasPointerCapture(e.pointerId))move(e);};
  pad.onkeydown=e=>{if(!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key))return;e.preventDefault();let[h,s,v]=hsv(draft.colors[selected]);s+=e.key==='ArrowRight'?.02:e.key==='ArrowLeft'?-.02:0;v+=e.key==='ArrowUp'?.02:e.key==='ArrowDown'?-.02:0;draft.colors[selected]=hex(h,Math.max(0,Math.min(1,s)),Math.max(0,Math.min(1,v)));render();};
  q('.theme-add').onclick=()=>{if(draft.colors.length<3){draft.colors.push('#81b7ff');selected=draft.colors.length-1;render();}};
  q('.theme-reset').onclick=()=>{draft=normalize(defaults);selected=0;customOpen=false;render();};
  q('.theme-apply').onclick=()=>{saved=normalize(draft);localStorage.setItem('sahur-theme',JSON.stringify(saved));q('.theme-status').textContent='Theme saved.';};
  root.closest('dialog').addEventListener('close',()=>{draft=normalize(saved);selected=0;customOpen=presetName(saved)==='Custom';render();});
  render();
}
module.exports={mount,normalize,hsv,hex,mix};
