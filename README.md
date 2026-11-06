# ZForum

ZForum is the backend for [ZenZcash.com](https://zenzcash.com), a calmer way to
read the Zcash community forum.

Long threads can be hard to catch up on, especially when the same arguments keep
coming around and the conversation gets heated. ZenZcash helps you understand
what people disagree about, consider different perspectives, and decide where
you stand.

## What you can do

- **Catch up:** AI summaries cover the main questions, arguments and disagreements;
  “What's new” helps you find recent contributions.
- **Turn down the heat:** optional rewrites aim to soften inflammatory language
  while preserving the author's meaning. Check the original and see what changed.
- **Listen:** hear summaries or selected posts, with adjustable playback speed
  and your browser's available voices.
- **Choose your view:** filter by tone, argument support or account age, and hide
  author names to give the ideas a fresh look.
- **Pick up later:** bookmark posts, mark them read or unread, and save reading
  preferences across devices with passkey login. No password or email required.
- **Explore with your own AI:** copy or export selected posts with source links
  and a ready-made prompt for your preferred AI or NotebookLM.
- **Keep a Zamagotchi:** choose a little companion that responds to your mood
  reactions and feedback on rewrites. It won't sulk because you took a week off.
- **Get comfortable:** switch between light and dark mode.

ZenZcash is a read-only view of the forum. Original posts and links back to the
conversation stay available; participation happens on the forum itself.

## How it's built

A Rust server and SQLite database serve the site, with plain JavaScript in the
browser. Node.js tools fetch forum posts and prepare AI summaries, rewrites and
assessments before publication. See the short [architecture guide](ARCHITECTURE.md).

## AI disclosure

AI tools were used to assist in the development of ZForum.

The site's summaries, rewrites and assessments are also AI-generated. They can
miss context or misinterpret a post.

The idea grew out of Zcon workshops in Cancún—see the
[forum introduction](https://forum.zcashcommunity.com/t/introducing-zenzcash-the-forum-minus-the-emotional-whirlwind/58836).
