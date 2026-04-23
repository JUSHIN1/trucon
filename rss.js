// rss.js - RSS Feed Generator
const fs = require("fs");
const path = require("path");

function generateRSSFeed(posts, options = {}) {
  const {
    title = "Trucon - Truth from All Angles",
    description = "Bringing you truth from all angles and edges of Earth",
    link = "https://trucon.com",
    category = null,
    author = null,
  } = options;

  const filteredPosts = posts.filter((post) => {
    if (category && post.category !== category) return false;
    if (author && post.author !== author) return false;
    return true;
  });

  const rssItems = filteredPosts
    .map(
      (post) => `
    <item>
      <title><![CDATA[${post.title || "Untitled"}]]></title>
      <description><![CDATA[${post.content.substring(
        0,
        200
      )}...]]></description>
      <link>${link}/post/${post.id}</link>
      <guid isPermaLink="true">${link}/post/${post.id}</guid>
      <pubDate>${new Date(post.date).toUTCString()}</pubDate>
      <author>${post.author}</author>
      ${post.category ? `<category>${post.category}</category>` : ""}
      ${post.image ? `<enclosure url="${post.image}" type="image/jpeg"/>` : ""}
    </item>
  `
    )
    .join("");

  const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${title}</title>
    <description>${description}</description>
    <link>${link}</link>
    <atom:link href="${link}/rss.xml" rel="self" type="application/rss+xml"/>
    <language>en-us</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${rssItems}
  </channel>
</rss>`;

  return rss;
}

module.exports = { generateRSSFeed };
