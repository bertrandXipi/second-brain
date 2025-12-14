import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROMPT_PATH = process.env.PROMPT_PATH || path.join(__dirname, '../prompts/v1.txt');
const PROMPT_YOUTUBE_PATH = process.env.PROMPT_YOUTUBE_PATH || path.join(__dirname, '../prompts/v1-youtube.txt');

export async function summarizeWithGemini(content, existingTags = [], options = {}) {
  console.log('[llm] calling gemini...');

  // Load prompt from file - use YouTube prompt if specified
  const promptPath = options.isYouTube ? PROMPT_YOUTUBE_PATH : PROMPT_PATH;
  const promptTemplate = readFileSync(promptPath, 'utf-8');
  console.log(`[llm] using prompt: ${options.isYouTube ? 'youtube' : 'default'}`);

  // Truncate content if too long
  const truncated = content.slice(0, 15000);
  const prompt = promptTemplate + truncated;

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
