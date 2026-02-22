/**
 * Markdown Generator V2 - NotebookLM Integration
 * Generates markdown with AI-generated summary from NotebookLM
 */

export function generateMarkdownV2(item, notebookResult, sourceDescription, sourceUrl, fetchResult = {}, linkedInPost = null) {
  const now = new Date().toISOString();
  const datePrefix = now.slice(0, 10);
  const title = fetchResult.title || item.title || 'Sans titre';
  const slug = createSlug(title);

  const frontmatter = {
    title: title,
    source_url: sourceUrl,
    source_type: fetchResult.isYouTube ? 'youtube' : 'article',
    date_captured: item.created_at,
    date_processed: now,
    tags: item.tags || [],
    language: 'fr',
    ingest_source: item.source || 'discord',
    discord_message_url: item.discord?.message_url || null,
    status: 'published',
  };

  // Add NotebookLM metadata
  if (notebookResult) {
    frontmatter.notebooklm_notebook_id = notebookResult.notebook_id;
    frontmatter.notebooklm_source_id = notebookResult.source_id;
    frontmatter.notebooklm_url = notebookResult.notebook_url;
  }

  // Add keywords from NotebookLM
  if (sourceDescription?.keywords && sourceDescription.keywords.length > 0) {
    frontmatter.keywords = sourceDescription.keywords;
  }

  // Add YouTube-specific metadata
  if (fetchResult.isYouTube && fetchResult.youtubeMetadata) {
    frontmatter.youtube_channel = fetchResult.youtubeMetadata.channel;
    frontmatter.youtube_duration = fetchResult.youtubeMetadata.duration;
    frontmatter.has_transcript = fetchResult.hasTranscript;
  }

  let md = `---
${yamlStringify(frontmatter)}---

`;

  // AI-Generated Summary from NotebookLM
  if (sourceDescription?.summary) {
    md += `## Résumé (NotebookLM)

${sourceDescription.summary}

`;
  }

  // LinkedIn Post
  if (linkedInPost) {
    md += `## 💼 Post LinkedIn

${linkedInPost}

`;
  }

  // Keywords section
  if (sourceDescription?.keywords && sourceDescription.keywords.length > 0) {
    md += `## Mots-clés

${sourceDescription.keywords.map(k => `- **${k}**`).join('\n')}

`;
  }

  // NotebookLM section
  if (notebookResult) {
    md += `## 📚 NotebookLM

[Ouvrir dans NotebookLM](${notebookResult.notebook_url})

Utilisez NotebookLM pour:
- Poser des questions approfondies sur le contenu
- Générer des résumés personnalisés selon vos besoins
- Créer des podcasts audio pour écouter en déplacement
- Explorer les concepts et leurs interconnexions
- Comparer avec d'autres sources du notebook

`;
  }

  // Original note
  if (item.note) {
    md += `## Note personnelle

${item.note}

`;
  }

  // Source info
  md += `## Source

- [${fetchResult.isYouTube ? 'Vidéo YouTube' : 'Article original'}](${sourceUrl})`;

  if (fetchResult.isYouTube && fetchResult.youtubeMetadata) {
    md += `
- Chaîne: ${fetchResult.youtubeMetadata.channel}
- Durée: ${fetchResult.youtubeMetadata.duration || 'N/A'}`;
  }

  if (fetchResult.isYouTube && !fetchResult.hasTranscript) {
    md += `

> ⚠️ **Pas de transcription disponible** — Analyse basée sur la description de la vidéo.`;
  }

  md += '\n';

  return {
    filename: `${datePrefix}-${slug}.md`,
    content: md,
    folder: now.slice(0, 7), // YYYY-MM
  };
}

function createSlug(title) {
  return title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

function yamlStringify(obj) {
  let yaml = '';
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) {
      yaml += `${key}: null\n`;
    } else if (Array.isArray(value)) {
      if (value.length === 0) {
        yaml += `${key}: []\n`;
      } else {
        yaml += `${key}:\n`;
        for (const item of value) {
          yaml += `  - ${item}\n`;
        }
      }
    } else if (typeof value === 'string') {
      if (value.includes(':') || value.includes('"') || value.includes('\n')) {
        yaml += `${key}: "${value.replace(/"/g, '\\"')}"\n`;
      } else {
        yaml += `${key}: ${value}\n`;
      }
    } else {
      yaml += `${key}: ${value}\n`;
    }
  }
  return yaml;
}
