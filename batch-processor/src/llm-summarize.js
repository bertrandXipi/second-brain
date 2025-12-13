import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const PROMPT_TEMPLATE = `Tu es un assistant qui crée des fiches de veille technologique.

Analyse le contenu suivant et génère une réponse JSON avec cette structure exacte:
{
  "title": "Titre concis et descriptif",
  "summary": "Résumé en 2-3 paragraphes",
  "key_points": ["Point clé 1", "Point clé 2", "Point clé 3"],
  "tags": ["tag1", "tag2", "tag3"],
  "category": "IA" | "Dev" | "Biz" | "Design" | "Tech",
  "concepts": ["Concept1", "Concept2"]
}

Réponds UNIQUEMENT avec le JSON, sans markdown ni explication.

CONTENU:
`;

export async function summarizeWithGemini(content, existingTags = []) {
  console.log('[llm] calling gemini...');

  // Truncate content if too long
  const truncated = content.slice(0, 15000);
  const prompt = PROMPT_TEMPLATE + truncated;

  // Write prompt to temp file
  const tempFile = path.join(tmpdir(), `gemini-prompt-${Date.now()}.txt`);
  writeFileSync(tempFile, prompt);

  try {
    const result = execSync(`gemini < "${tempFile}"`, {
      encoding: 'utf-8',
      timeout: 120000,
      maxBuffer: 10 * 1024 * 1024,
    });

    // Parse JSON from response
    const jsonMatch = result.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in response');
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // Merge existing tags
    if (existingTags.length > 0) {
      parsed.tags = [...new Set([...existingTags, ...(parsed.tags || [])])];
    }

    console.log('[llm] success');
    return parsed;

  } catch (err) {
    console.error('[llm] error:', err.message);
    throw err;
  } finally {
    try { unlinkSync(tempFile); } catch {}
  }
}
