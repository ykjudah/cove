function accent(value) { return /^#[a-f0-9]{6}$/i.test(value || '') ? value.toLowerCase() : '#20b8c9'; }
function accentInk(value) {
  const hex = accent(value).slice(1);
  const rgb = [0, 2, 4].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
  return (luminance + 0.05) / 0.05 >= 1.05 / (luminance + 0.05) ? '#10140e' : '#ffffff';
}
function hideNames(mode, roomId, selectedId) { return mode === 'all' || mode === 'current'; }
module.exports = { accent, accentInk, hideNames };
