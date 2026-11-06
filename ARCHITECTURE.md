# How ZForum works

ZForum has three parts: a Rust web server, a browser interface, and a separate
pipeline that prepares forum content for publication.

## Serving the site

The Rust server uses Axum and Tokio to serve the interface and APIs. SQLite stores
published forum content, accounts, bookmarks, reading preferences and feedback.
Passkey authentication uses WebAuthn. The browser interface is plain HTML, CSS and
JavaScript ES modules.

## Preparing the content

Node.js tools fetch public threads from the Zcash community forum and retain the
original posts. AI analysis runs separately from the web server:

1. **Summarize the discussion.** Models produce topic summaries with questions,
   competing views and citations. Long histories are summarized in sections,
   then combined into a topic summary.
2. **Analyze individual posts.** Models generate short summaries, optional calmer
   rewrites, and separate assessments such as tone and argument support. These
   use the original text and discussion context. Older posts can remain available
   without an individual assessment.
3. **Validate and publish.** The tools check output structure, source references
   and quoted evidence. Accepted results retain their model and prompt provenance
   and can be reused. Publication is a separate, explicit step.

Readers receive stored results; browsing, listening and saving posts do not
trigger model calls. Listening uses browser speech synthesis. AI exports package
selected originals for readers to take to a service of their choice.

Validation checks structure and source references, not whether an interpretation
is correct. Originals remain separate from generated text and available to readers.

Maintainer rules, including approval before new analysis spending, are in
[CLAUDE.md](CLAUDE.md).
