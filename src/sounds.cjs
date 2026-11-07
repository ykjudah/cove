// Original synthesized cues. Audio never leaves this device.
const notes = {
  message: [880, 1174], sent: [660], join: [440, 660, 880],
  leave: [660, 440], mute: [330], unmute: [660, 880],
  camera: [520, 780], share: [660, 990], ring: [660, 880, 660, 880],
};
let context, lastMessage = 0;
function play(name) {
  if (localStorage.getItem('sahur-sounds') === 'off') return;
  if (name === 'message' && Date.now() - lastMessage < 700) return;
  if (name === 'message') lastMessage = Date.now();
  try {
    context ||= new AudioContext();
    context.resume().catch(() => {});
    const stored = Number(localStorage.getItem('sahur-sound-volume') ?? .35);
    const volume = Number.isFinite(stored) ? Math.max(0, Math.min(1, stored)) : .35;
    for (const [i, frequency] of (notes[name] || notes.message).entries()) {
      const oscillator = context.createOscillator(), gain = context.createGain();
      const time = context.currentTime + i * .11;
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(frequency, time);
      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(volume * .18, time + .012);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .19);
      oscillator.connect(gain); gain.connect(context.destination);
      oscillator.start(time); oscillator.stop(time + .2);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  } catch {}
}
module.exports = { play };
