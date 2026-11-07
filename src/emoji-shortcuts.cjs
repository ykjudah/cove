'use strict';
const categories = require('./emoji.cjs');
const aliases = Object.create(null);
for (const [emoji, keywords] of Object.values(categories).flat()) {
  const words = keywords.split(' ');
  for (const name of [words.join('_'), ...words]) if (!aliases[name]) aliases[name] = emoji;
}
Object.assign(aliases, {
  smile:'😃', smiling_face:'😊', slightly_smiling_face:'🙂', grinning:'😀', grin:'😁', laughing:'😆',
  joy:'😂', rofl:'🤣', blush:'😊', upside_down:'🙃', upside_down_face:'🙃', wink:'😉',
  heart_eyes:'😍', smiling_face_with_hearts:'🥰', kissing_heart:'😘', sunglasses:'😎',
  nerd_face:'🤓', partying_face:'🥳', star_struck:'🤩', thinking_face:'🤔', saluting_face:'🫡',
  raised_eyebrow:'🤨', neutral_face:'😐', rolling_eyes:'🙄', open_mouth:'😮',
  pleading_face:'🥺', holding_back_tears:'🥹', sob:'😭', rage:'😡', exploding_head:'🤯',
  sleeping:'😴', drooling_face:'🤤', nauseated_face:'🤢', vomiting_face:'🤮', clown_face:'🤡',
  skull:'💀', skull_and_crossbones:'☠️', robot_face:'🤖', poop:'💩',
  thumbsup:'👍', thumbs_up:'👍', '+1':'👍', thumbsdown:'👎', thumbs_down:'👎', '-1':'👎',
  raised_hands:'🙌', open_hands:'👐', muscle:'💪', punch:'👊', fist_bump:'👊', v:'✌️',
  crossed_fingers:'🤞', love_you:'🤟', metal:'🤘', ok_hand:'👌', pinched_fingers:'🤌',
  heart_hands:'🫶', heart:'❤️', red_heart:'❤️', orange_heart:'🧡', yellow_heart:'💛',
  green_heart:'💚', blue_heart:'💙', purple_heart:'💜', black_heart:'🖤', white_heart:'🤍',
  brown_heart:'🤎', broken_heart:'💔', two_hearts:'💕', sparkling_heart:'💖',
  '100':'💯', white_check_mark:'✅', x:'❌', tada:'🎉', confetti_ball:'🎊', birthday:'🎂',
  first_place_medal:'🥇', zap:'⚡', sunny:'☀️', crescent_moon:'🌙', four_leaf_clover:'🍀',
  hamburger:'🍔', video_game:'🎮', musical_note:'🎵', camera_flash:'📸', moyai:'🗿'
});

function expandDraft(value, start = value.length, end = start) {
  const edits = [];
  const result = value.replace(/:([a-z0-9_+\-]+):/gi, (token, name, offset) => {
    const emoji = aliases[name.toLowerCase()];
    if (!emoji) return token;
    edits.push({ offset, length:token.length, replacementLength:emoji.length });
    return emoji;
  });
  const move = position => {
    let shift = 0;
    for (const edit of edits) {
      if (position <= edit.offset) break;
      if (position < edit.offset + edit.length) return edit.offset + shift + edit.replacementLength;
      shift += edit.replacementLength - edit.length;
    }
    return position + shift;
  };
  return { value:result, start:move(start), end:move(end) };
}
function expandShortcodes(value) { return expandDraft(value).value; }
function matchShortcodes(prefix){const seen=new Set();return Object.entries(aliases).filter(([name,emoji])=>name.startsWith(prefix.toLowerCase())&&!seen.has(emoji)&&seen.add(emoji)).map(([name,emoji])=>({name,emoji}));}
module.exports = { expandShortcodes, expandDraft, matchShortcodes };
