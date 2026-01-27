import { JSDOM } from 'jsdom';
import { Readability } from '@mozilla/readability';
import { config } from './config.js';
import { isYouTubeUrl, getYouTubeContent } from './youtube.js';

function isRedditUrl(url) {
  return url.includes('reddit.com/r/') || url.includes('redd.it/');
}

function isTwitterUrl(url) {
  return url.includes('twitter.com') || url.includes('x.com');
}

// Fetch Twitter replies using Syndication API
async function fetchTwitterReplies(tweetId, originalAuthor) {
  const replies = [];
  
  try {
    console.log(`[fetch] Fetching replies for tweet ${tweetId}...`);
    
    // Method 1: Try Twitter Syndication API (conversation endpoint)
    const syndicationUrl = `https://syndication.twitter.com/srv/timeline-profile/screen-name/${originalAuthor}?showReplies=true`;
    
    // Method 2: Try the tweet detail endpoint which sometimes includes replies
    const detailUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=0`;
    
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(detailUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Accept': 'application/json',
      },
    });
    
    clearTimeout(timeout);
    
    if (response.ok) {
      const data = await response.json();
      
      // Check if there's conversation data
      if (data.conversation_threads) {
        for (const thread of data.conversation_threads) {
          for (const entry of thread.entries || []) {
            if (entry.tweet && entry.tweet.user?.screen_name !== originalAuthor) {
              replies.push({
                author: entry.tweet.user?.screen_name || 'Unknown',
                text: entry.tweet.text || '',
                likes: entry.tweet.favorite_count || 0,
                isVerified: entry.tweet.user?.verified || entry.tweet.user?.is_blue_verified || false,
              });
            }
          }
        }
      }
      
      // Also check for parent/child structure
      if (data.parent && data.parent.user?.screen_name !== originalAuthor) {
        replies.unshift({
          author: data.parent.user?.screen_name || 'Unknown',
          text: data.parent.text || '',
          likes: data.parent.favorite_count || 0,
          isVerified: data.parent.user?.verified || false,
        });
      }
    }
    
    // Method 3: Try Nitter instances as fallback for replies
    if (replies.length === 0) {
      console.log(`[fetch] Trying Nitter for replies...`);
      const nitterInstances = [
        'nitter.privacydev.net',
        'nitter.poast.org',
      ];
      
      for (const instance of nitterInstances) {
        try {
          const nitterUrl = `https://${instance}/i/status/${tweetId}`;
          const nitterResp = await fetch(nitterUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)' },
          });
          
          if (nitterResp.ok) {
            const html = await nitterResp.text();
            
            // Parse replies from Nitter HTML
            const replyMatches = html.matchAll(/<div class="reply-thread"[^>]*>[\s\S]*?<a class="username"[^>]*>@([^<]+)<\/a>[\s\S]*?<div class="tweet-content[^"]*"[^>]*>([^<]+)/g);
            
            for (const match of replyMatches) {
              if (match[1] !== originalAuthor) {
                replies.push({
                  author: match[1],
                  text: match[2].trim(),
                  likes: 0,
                  isVerified: false,
                });
              }
            }
            
            if (replies.length > 0) {
              console.log(`[fetch] Got ${replies.length} replies from Nitter`);
              break;
            }
          }
        } catch (e) {
          // Continue to next instance
        }
      }
    }
    
    // Limit to top 15 replies
    return replies.slice(0, 15);
    
  } catch (err) {
    console.log(`[fetch] Could not fetch replies: ${err.message}`);
    return [];
  }
}

export async function fetchAndExtract(url) {
  console.log(`[fetch] ${url}`);

  // Handle YouTube URLs specially
  if (isYouTubeUrl(url)) {
    return await fetchYouTube(url);
  }

  // Handle Reddit URLs specially (use JSON API to bypass 403)
  if (isRedditUrl(url)) {
    return await fetchReddit(url);
  }

  // Handle Twitter/X URLs specially (use fxtwitter.com to bypass bot protection)
  if (isTwitterUrl(url)) {
    return await fetchTwitter(url);
  }

  const html = await fetchWithRetry(url);
  const { title, content, excerpt } = extractContent(html, url);

  return { title, content, excerpt, html, isYouTube: false, hasTranscript: true };
}

async function fetchReddit(url) {
  console.log(`[fetch] Reddit detected, using JSON API`);

  // Clean URL and add .json
  let jsonUrl = url.replace(/\?.*$/, ''); // Remove query params
  if (!jsonUrl.endsWith('/')) jsonUrl += '/';
  jsonUrl += '.json';

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

  const response = await fetch(jsonUrl, {
    signal: controller.signal,
    headers: {
      'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
    },
  });

  clearTimeout(timeout);

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const data = await response.json();

  // Extract post data
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post) {
    throw new Error('Could not parse Reddit response');
  }

  const title = post.title || 'Reddit Post';
  let content = post.selftext || '';

  // Add top comments for context
  const comments = data[1]?.data?.children || [];
  const topComments = comments
    .filter(c => c.kind === 't1' && c.data?.body)
    .slice(0, 10)
    .map(c => c.data.body)
    .join('\n\n---\n\n');

  if (topComments) {
    content += '\n\n## Top Comments:\n\n' + topComments;
  }

  // If no selftext, mention it's a link post
  if (!post.selftext && post.url) {
    content = `Link post: ${post.url}\n\n${content}`;
  }

  const excerpt = content.slice(0, 500);

  return { title, content, excerpt, isReddit: true, hasTranscript: true };
}

async function fetchTwitter(url) {
  console.log(`[fetch] Twitter detected, trying multiple methods...`);

  // Clean URL (remove tracking params)
  const cleanUrl = url.replace(/\?.*$/, '');
  
  // Extract tweet ID from URL
  const tweetIdMatch = cleanUrl.match(/status\/(\d+)/);
  const tweetId = tweetIdMatch ? tweetIdMatch[1] : null;

  // Method 1: Try fxtwitter.com API first (best for articles and structured content)
  try {
    console.log(`[fetch] Trying fxtwitter.com API...`);
    
    const apiUrl = cleanUrl.replace(/(x|twitter)\.com/, 'api.fxtwitter.com');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      
      if (data.tweet) {
        const tweet = data.tweet;
        const author = tweet.author?.name || tweet.author?.screen_name || 'Unknown';
        const handle = tweet.author?.screen_name || '';
        const createdAt = tweet.created_at || '';
        
        let content = '';
        let title = '';
        
        // Check if this is a Twitter Article (long-form content)
        if (tweet.article && tweet.article.content && tweet.article.content.blocks) {
          console.log(`[fetch] Twitter Article detected, extracting full content...`);
          
          title = tweet.article.title || `Article de @${handle}`;
          content = `# ${title}\n\n`;
          content += `**Auteur:** @${handle} (${author})\n`;
          content += `**Date:** ${createdAt}\n\n`;
          content += `---\n\n`;
          
          // Extract text from article blocks
          const blocks = tweet.article.content.blocks;
          for (const block of blocks) {
            if (block.text && block.text.trim()) {
              switch (block.type) {
                case 'header-one':
                  content += `# ${block.text}\n\n`;
                  break;
                case 'header-two':
                  content += `## ${block.text}\n\n`;
                  break;
                case 'header-three':
                  content += `### ${block.text}\n\n`;
                  break;
                case 'ordered-list-item':
                  content += `1. ${block.text}\n`;
                  break;
                case 'unordered-list-item':
                  content += `- ${block.text}\n`;
                  break;
                case 'blockquote':
                  content += `> ${block.text}\n\n`;
                  break;
                case 'atomic':
                  // Skip media placeholders
                  break;
                default:
                  content += `${block.text}\n\n`;
              }
            }
          }
          
          // Add engagement stats
          content += `\n---\n\n## Engagement:\n`;
          content += `- ❤️ Likes: ${tweet.likes || 0}\n`;
          content += `- 🔁 Retweets: ${tweet.retweets || 0}\n`;
          content += `- 💬 Replies: ${tweet.replies || 0}\n`;
          content += `- 👁️ Views: ${tweet.views || 'N/A'}\n\n`;
          
          content += `---\nSource: ${url}`;
          
          console.log(`[fetch] ✅ fxtwitter Article extracted (${content.length} chars)`);
          return {
            title,
            content,
            excerpt: content.slice(0, 500),
            isTwitter: true,
            isArticle: true,
            hasTranscript: true
          };
        }
        
        // Regular tweet - try to get full thread and replies
        console.log(`[fetch] Regular tweet detected, fetching thread and replies...`);
        
        // Collect thread tweets (same author replying to themselves)
        const threadTweets = [];
        threadTweets.push(tweet);
        
        // Follow the reply chain backwards to get earlier tweets in thread
        let currentTweet = tweet;
        let parentCount = 0;
        while (currentTweet.replying_to_status && parentCount < 20) {
          try {
            const parentUrl = `https://api.fxtwitter.com/i/status/${currentTweet.replying_to_status}`;
            const parentResp = await fetch(parentUrl, {
              headers: { 'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)', 'Accept': 'application/json' },
            });
            if (parentResp.ok) {
              const parentData = await parentResp.json();
              if (parentData.tweet && parentData.tweet.author?.screen_name === handle) {
                threadTweets.unshift(parentData.tweet); // Add to beginning
                currentTweet = parentData.tweet;
                parentCount++;
              } else {
                break; // Different author, stop
              }
            } else break;
          } catch (e) {
            console.log(`[fetch] Could not fetch parent tweet: ${e.message}`);
            break;
          }
        }
        
        // Try to get replies using Twitter Syndication API
        let replies = [];
        if (tweetId) {
          replies = await fetchTwitterReplies(tweetId, handle);
        }
        
        // Build content
        const isThread = threadTweets.length > 1;
        title = isThread 
          ? `Thread de @${handle} (${threadTweets.length} tweets)`
          : `Tweet de @${handle}: ${tweet.text?.slice(0, 60)}${tweet.text?.length > 60 ? '...' : ''}`;
        
        content = `# ${isThread ? 'Thread' : 'Tweet'} de @${handle} (${author})\n\n`;
        content += `**Date:** ${createdAt}\n`;
        if (isThread) {
          content += `**Nombre de tweets dans le thread:** ${threadTweets.length}\n`;
        }
        content += `\n---\n\n`;
        
        // Add all thread tweets
        if (isThread) {
          content += `## Thread complet:\n\n`;
          threadTweets.forEach((t, i) => {
            content += `### Tweet ${i + 1}/${threadTweets.length}\n\n`;
            content += `${t.text || ''}\n\n`;
            if (t.media?.photos?.length > 0) {
              content += `*[${t.media.photos.length} image(s)]*\n\n`;
            }
            if (t.media?.videos?.length > 0) {
              content += `*[${t.media.videos.length} vidéo(s)]*\n\n`;
            }
          });
        } else {
          content += `## Contenu du tweet:\n\n${tweet.text || ''}\n\n`;
          if (tweet.media?.photos?.length > 0) {
            content += `**Images:** ${tweet.media.photos.length} image(s) attachée(s)\n\n`;
          }
          if (tweet.media?.videos?.length > 0) {
            content += `**Vidéos:** ${tweet.media.videos.length} vidéo(s) attachée(s)\n\n`;
          }
        }
        
        // Add quote tweet if present
        if (tweet.quote) {
          content += `## Tweet cité:\n`;
          content += `**@${tweet.quote.author?.screen_name}:** ${tweet.quote.text}\n\n`;
        }
        
        // Add engagement stats
        content += `## Engagement:\n`;
        content += `- ❤️ Likes: ${tweet.likes || 0}\n`;
        content += `- 🔁 Retweets: ${tweet.retweets || 0}\n`;
        content += `- 💬 Replies: ${tweet.replies || 0}\n`;
        content += `- 👁️ Views: ${tweet.views || 'N/A'}\n\n`;
        
        // Add replies/comments if we got any
        if (replies.length > 0) {
          content += `## Réponses et commentaires (${replies.length}):\n\n`;
          replies.forEach((reply, i) => {
            content += `### @${reply.author} ${reply.isVerified ? '✓' : ''}\n`;
            content += `${reply.text}\n`;
            if (reply.likes > 0) content += `*❤️ ${reply.likes}*\n`;
            content += `\n`;
          });
        }
        
        content += `---\nSource: ${url}`;
        
        console.log(`[fetch] ✅ fxtwitter: ${threadTweets.length} thread tweets, ${replies.length} replies (${content.length} chars)`);
        return {
          title,
          content,
          excerpt: content.slice(0, 500),
          isTwitter: true,
          isThread,
          hasTranscript: true
        };
      }
    }
  } catch (err) {
    console.log(`[fetch] fxtwitter API failed: ${err.message}`);
  }

  // Method 2: Try Jina.ai Reader (fallback for threads and complex pages)
  try {
    console.log(`[fetch] Trying Jina.ai Reader...`);
    const jinaUrl = `https://r.jina.ai/${cleanUrl}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const response = await fetch(jinaUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
      },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const text = await response.text();
      
      // Check if we got meaningful content (not just error/login page)
      if (text && text.length > 500 && !text.includes('privacy related extensions') && !text.includes("Don't miss what's happening")) {
        // Extract title from Jina response
        const titleMatch = text.match(/^Title:\s*(.+?)$/m);
        const title = titleMatch ? titleMatch[1].replace(/ \/ X$/, '').trim() : 'Twitter Post';
        
        // Extract markdown content (skip the header lines)
        const contentMatch = text.match(/Markdown Content:\s*([\s\S]+)/);
        const content = contentMatch ? contentMatch[1].trim() : text;
        
        if (content.length > 200) {
          console.log(`[fetch] ✅ Jina.ai worked (${content.length} chars)`);
          return {
            title,
            content: `# ${title}\n\n${content}\n\n---\nSource: ${url}`,
            excerpt: content.slice(0, 500),
            isTwitter: true,
            hasTranscript: true
          };
        }
      }
    }
  } catch (err) {
    console.log(`[fetch] Jina.ai failed: ${err.message}`);
  }

  // Method 3: Try vxtwitter.com API
  try {
    console.log(`[fetch] Trying vxtwitter.com API...`);
    const apiUrl = cleanUrl.replace(/(x|twitter)\.com/, 'api.vxtwitter.com');

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

    const response = await fetch(apiUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; VeilleBot/1.0)',
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);

    if (response.ok) {
      const data = await response.json();
      
      if (data.text && data.text.length > 10) {
        const author = data.user_name || 'Unknown';
        const handle = data.user_screen_name || '';
        const tweetText = data.text || '';
        const createdAt = data.date || '';
        
        let content = `# Tweet de @${handle} (${author})\n\n`;
        content += `**Date:** ${createdAt}\n\n`;
        content += `## Contenu du tweet:\n\n${tweetText}\n\n`;
        
        content += `## Engagement:\n`;
        content += `- ❤️ Likes: ${data.likes || 0}\n`;
        content += `- 🔁 Retweets: ${data.retweets || 0}\n`;
        content += `- 💬 Replies: ${data.replies || 0}\n\n`;
        
        content += `---\nSource: ${url}`;
        
        const title = `Tweet de @${handle}: ${tweetText.slice(0, 80)}${tweetText.length > 80 ? '...' : ''}`;
        
        console.log(`[fetch] ✅ vxtwitter API worked (${content.length} chars)`);
        return {
          title,
          content,
          excerpt: tweetText.slice(0, 500),
          isTwitter: true,
          hasTranscript: true
        };
      }
    }
  } catch (err) {
    console.log(`[fetch] vxtwitter API failed: ${err.message}`);
  }

  // All methods failed
  throw new Error('All Twitter access methods failed - Twitter is blocking content access');
}

async function fetchYouTube(url) {
  const ytContent = await getYouTubeContent(url);

  let content = '';
  if (ytContent.hasTranscript) {
    content = ytContent.content;
  } else {
    // Fallback to description if no transcript
    content = ytContent.metadata.description || 'Pas de transcription disponible.';
  }

  return {
    title: ytContent.title,
    content,
    excerpt: content.slice(0, 500),
    isYouTube: true,
    hasTranscript: ytContent.hasTranscript,
    youtubeMetadata: ytContent.metadata,
  };
}

async function fetchWithRetry(url) {
  let lastError;

  for (let i = 0; i < config.fetch.maxRetries; i++) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.fetch.timeout);

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      return await response.text();
    } catch (err) {
      lastError = err;
      console.log(`[fetch] retry ${i + 1}/${config.fetch.maxRetries}: ${err.message}`);
      await sleep(1000 * (i + 1));
    }
  }

  throw lastError;
}

function extractContent(html, url) {
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    // Fallback: just get text content
    const text = dom.window.document.body?.textContent || '';
    return {
      title: dom.window.document.title || null,
      content: text.slice(0, 10000),
      excerpt: text.slice(0, 500),
    };
  }

  return {
    title: article.title,
    content: article.textContent,
    excerpt: article.excerpt || article.textContent.slice(0, 500),
  };
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
