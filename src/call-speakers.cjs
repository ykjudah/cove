// Meter the existing call tracks locally. The analyser has no output connection.
function speakerMeter() {
  let context;
  const inputs = new Map();
  function remove(id) {
    const input = inputs.get(id);
    if (input) { input.source.disconnect(); input.analyser.disconnect(); inputs.delete(id); }
  }
  function level(id, stream, enabled, now) {
    const track = stream?.getAudioTracks()[0];
    if (!track || track.readyState !== 'live' || !track.enabled || !enabled) { remove(id); return 0; }
    let input = inputs.get(id);
    if (input?.track !== track) {
      remove(id);
      context ||= new AudioContext();
      const source = context.createMediaStreamSource(new MediaStream([track]));
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      source.connect(analyser);
      input = { source, analyser, track, data: new Float32Array(1024), last: -Infinity, strength: 0 };
      inputs.set(id, input);
      if (context.state === 'suspended') context.resume().catch(() => {});
    }
    input.analyser.getFloatTimeDomainData(input.data);
    let sum = 0;
    for (const x of input.data) sum += x*x;
    const rms = Math.sqrt(sum / input.data.length);
    if (rms > 0.014) { input.last = now; input.strength = rms; }
    return now-input.last < 330 ? Math.max(rms, input.strength*0.4) : 0;
  }
  function close() { for (const id of inputs.keys()) remove(id); context?.close().catch(()=>{}); context = null; }
  return {level,remove,close};
}
module.exports = {speakerMeter};
