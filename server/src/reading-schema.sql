BEGIN IMMEDIATE;
DELETE FROM reading WHERE bookmarked=0 AND read=0;
CREATE INDEX reading_bookmarks ON reading(account,bookmarked,post);
CREATE INDEX current_posts_topic_post ON current_posts(topic,post);
CREATE INDEX visits_account_active ON visits(account,active DESC,device);
DELETE FROM visits WHERE (account,device) IN (
  SELECT account,device FROM (
    SELECT account,device,row_number() OVER (PARTITION BY account ORDER BY active DESC,device) AS rank FROM visits
  ) WHERE rank>64
);
PRAGMA user_version=9;
COMMIT;
