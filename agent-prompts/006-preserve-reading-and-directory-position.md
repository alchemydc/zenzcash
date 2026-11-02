# Batch 006 — Preserve reading and Topics-list position

User request: choosing a Highlights and author identities option must not move the
reader out of that section. Returning from a topic to All topics must restore the
position of the topic card they left.

Fix scroll preservation at the shared rendering boundary: preserve the reading
panel's internal scroll as well as the document scroll and focused control during
same-page redraws. Preserve existing disclosure states.

Remember the Topics directory position within the current tab's app session.
Restore it through All topics, header Topics and browser Back. Keep existing
search, interests and sort state. First visits start at the top; topic and post
deep links retain their current navigation behavior. No database/schema changes.

Verify real Chrome scrolling, repeated checked/unchecked filter changes, desktop
and mobile, directory return links and browser history. Use a long fixture list so
the test can detect a reset to the top. Inspect screenshots and run repository checks.

The follow-up question about mind-change ratings is informational: explain the
existing toggle and signed-in requirement. No ratings redesign is included here.
