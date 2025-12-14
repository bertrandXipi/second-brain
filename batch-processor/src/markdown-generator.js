export function generateMarkdown(item, llmResult, sourceUrl, fetchResult = {}) {
  const now = new Date().toISOString();
  const datePrefix = now.slice(0, 10);
  const slug = createSlug(llmResult.title || 'untitled');

  const frontmatter = {
    title: llmResult.title || 'Sans titre',
    source_url: sourceUrl,
    source_type: fetchResult.isYouTube ? 'youtube' : 'article',
    date_captured: item.created_at,
    date_processed: now,
    category: llmResult.category || 'Tech',
    tags: llmResult.tags || [],
    reading_time_minutes: null,
    language: 'fr',
    llm_provider: 'gemini',
    llm_model: 'gemini-cli',
    llm_prompt_version: 'v1',
    ingest_source: item.source || 'discord',
    discord_message_url: item.discord?.message_url || null,
    status: 'published',
  };

  // Add YouTube-specific metadata
  if (fetchResult.isYouTube && fetchResult.youtubeMetadata) {
    frontmatter.youtube_channel = fetchResult.youtubeMetadata.channel;
    frontmatter.youtube_duration = fetchResult.youtubeMetadata.duration;
    frontmatter.has_transcript = fetchResult.hasTranscript;
  }

  const concepts = llmResult.concepts || [];
  const wikilinks = concepts.map(c => `[[${c}]]`).join(' | ');

  const md = `---
${yamlStringify(frontmatter)}---

## Résumé

${llmResult.summary || 'Pas de résumé disponible.'}

## Points clés

${(llmResult.key_points || []).map(p => `- ${p}`).join('\n')}

## Concepts liés

${wikilinks || 'Aucun concept identifié.'}

## Note originale

${item.note || 'Aucune note.'}

## Source

- [${fetchResult.isYouTube ? 'Vidéo YouTube' : 'Article original'}](${sourceUrl})${fetchResult.isYouTube && fetchResult.youtubeMetadata ? `
- Chaîne: ${fetchResult.youtubeMetadata.channel}
- Durée: ${fetchResult.youtubeMetadata.duration || 'N/A'}` : ''}${fetchResult.isYouTube && !fetchResult.hasTranscript ? `

> ⚠️ **Pas de transcription disponible** — Cette fiche est basée uniquement sur la description de la vidéo.` : ''}
`;

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
    .slice(0, 50);
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
