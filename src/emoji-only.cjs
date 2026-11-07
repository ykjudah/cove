'use strict';
// Unicode emoji sequences, including ZWJ families, flags, keycaps and skin tones.
const emoji=/(?:[0-9#*]\uFE0F?\u20E3|\p{Regional_Indicator}{2}|\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*(?:[\u{E0020}-\u{E007E}]+\u{E007F})?(?:\u200D\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})*)*)/gu;
module.exports=text=>typeof text==='string'&&text.trim().length>0&&text.replace(/\[\[emoji:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\]\]/gi,'').replace(emoji,'').trim()==='';
