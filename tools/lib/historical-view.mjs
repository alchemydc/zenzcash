// Historical hash reconstruction only. Never passed to a model (D-134).
import { postKey } from './jobs.mjs';

function postView(topicId, post, { focus, quoteLimit }) {
  const marker = focus !== null && focus.has(post.number) ? '▶ ' : '';
  const reply = post.reply_to === null ? '' : ` · replying to #${post.reply_to}`;
  const head = `## ${marker}${postKey(topicId, post.number)} · @${post.username} · ${post.created_at.slice(0, 16).replace('T', ' ')} UTC${reply}`;
  if (post.hidden) return `${head}\n[Hidden by the forum community. No text, and no entry needed.]`;
  const body = post.segments.map(segment => {
    if (segment.kind === 'text') return segment.text;
    const source = segment.source;
    const label = source === null ? 'quoting' : source.post === null ? `quoting @${source.username}` : `quoting @${source.username} t/${source.topic}#${source.post}`;
    const text = quoteLimit === null || segment.text.length <= quoteLimit ? segment.text : `${segment.text.slice(0, quoteLimit)} …[quote clipped]`;
    return `[${label}]\n${text.split('\n').map(line => `> ${line}`).join('\n')}\n[end quote]`;
  });
  return [head,...body].join('\n\n');
}
export function historicalThreadView(thread, options) {
  return [`# Thread t/${thread.id}: ${thread.title}`,...thread.posts.map(post=>postView(thread.id,post,options))].join('\n\n');
}
