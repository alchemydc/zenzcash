# Zenzcash

This repository contains the backend for [Zenzcash.com](https://zenzcash.com), a calmer way to
read the Zcash community forum.

Long threads can be hard to catch up on, especially when the same arguments keep
coming around and the conversation gets heated. Zenzcash helps you understand
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
  author names to give the ideas an unbiased look.
- **Pick up later:** bookmark posts, mark them read or unread, and save reading
  preferences across devices with passkey login. No password or email required.
- **Explore with your own AI:** copy or export selected posts with source links
  and a ready-made prompt for your preferred AI.
- **Keep a Zamagotchi:** choose a little companion that responds to your mood
  reactions and feedback on rewrites.
- **Get comfortable:** switch between light and dark mode.

Zenzcash is a read-only view of the forum. Original posts and links back to the
conversation stay available; participation happens on the forum itself.

## How it's built

A Rust server and SQLite database serve the site, with plain JavaScript in the
browser. Node.js tools fetch forum posts and prepare AI summaries, rewrites and
assessments before publication. See the short [architecture guide](ARCHITECTURE.md).

The software is [MIT licensed](LICENSE). Forum content and third-party materials
retain their respective licenses.

__AI disclosure__: AI tools were used to assist in the development of Zenzcash. The site's summaries, rewrites and assessments are also AI-generated. They can miss context or misinterpret a post.

The idea for Zenzcash grew out of Zcon workshops in Cancún in October 2026 — see the
[forum introduction](https://forum.zcashcommunity.com/t/introducing-zenzcash-the-forum-minus-the-emotional-whirlwind/58836).
