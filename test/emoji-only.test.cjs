const {test}=require('node:test'),assert=require('node:assert/strict'),emojiOnly=require('../src/emoji-only.cjs');
test('emoji-only messages include combined emoji but exclude plain text and bare digits',()=>{
 for(const s of ['[[emoji:11111111-1111-4111-8111-111111111111]]','😀 [[emoji:11111111-1111-4111-8111-111111111111]]','😀','😀 ❤️','👨‍👩‍👧‍👦','👍🏽','🇺🇸','1️⃣','🏴\u{E0067}\u{E0062}\u{E007F}'])assert.equal(emojiOnly(s),true,s);
 for(const s of ['',' ','123','#','*','hi [[emoji:11111111-1111-4111-8111-111111111111]]','hi 😀',':smile:','🇺','\u200d'])assert.equal(emojiOnly(s),false,s);
});
