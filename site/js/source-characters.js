// One character policy for review scans, AI requests and manual AI exports.
export const misleadingCharacter=/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f\u00ad\u034f\u061c\u115f\u1160\u17b4\u17b5\u180b-\u180f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff\u{e0000}-\u{e007f}]/u;
const flaggedCharacters=new RegExp(misleadingCharacter.source,'gu');

export function visibleText(text) {
  return text.replace(flaggedCharacters,character=>character.split('').map(unit=>`\\u${unit.charCodeAt(0).toString(16).padStart(4,'0')}`).join(''));
}

export function assertAiText(text) {
  const match=misleadingCharacter.exec(text);
  if(match)throw Object.assign(new Error(`AI request contains raw flagged character U+${match[0].codePointAt(0).toString(16).toUpperCase().padStart(4,'0')} at UTF-16 offset ${match.index}; encode it before model invocation`),{notInvoked:true});
}
