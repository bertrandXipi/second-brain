import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import path from 'path';

const YOUTUBE_REGEX = /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;

export function isYouTubeUrl(url) {
  return YOUTUBE_REGEX.test(url);
}

export function extractVideoId(url) {
  const match = url.match(YOUTUBE_REGEX);
  return match ? match[1] : null;
}

export async function getYouTubeContent(url) {
  const videoId = extractVideoId(url);
  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  console.log(`[youtube] fetching video: ${videoId}`);

  // Get video metadata
  const metadata = await getVideoMetadata(videoId);
  
  // Try to get transcript
  const transcript = await getTranscript(videoId);

  return {
    title: metadata.title,
    content: transcript.text,
    hasTranscript: transcript.available,
    metadata: {
      channel: metadata.channel,
      duration: metadata.duration,
      publishedAt: metadata.publishedAt,
      description: metadata.description,
    }
  };
}

async function getVideoMetadata(videoId) {
  try {
    const result = execSync(
      `yt-dlp --dump-json --no-download "https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: 'utf-8', timeout: 30000, maxBuffer: 10 * 1024 * 1024 }
    );
    
    const data = JSON.parse(result);
    return {
      title: data.title || 'Sans titre',
      channel: data.channel || data.uploader || 'Inconnu',
      duration: data.duration ? formatDuration(data.duration) : null,
      publishedAt: data.upload_date ? formatDate(data.upload_date) : null,
      description: data.description?.slice(0, 1000) || '',
    };
  } catch (err) {
    console.error('[youtube] metadata error:', err.message);
    return {
      title: 'Vidéo YouTube',
      channel: 'Inconnu',
      duration: null,
      publishedAt: null,
      description: '',
    };
  }
}

async function getTranscript(videoId) {
  const tempFile = path.join(tmpdir(), `yt-transcript-${videoId}`);
  
  try {
    // Try to get French transcript first (including fr-orig), then English
    execSync(
      `yt-dlp --write-auto-sub --sub-lang "fr.*,en.*,fr,en" --sub-format "vtt" --skip-download -o "${tempFile}" "https://www.youtube.com/watch?v=${videoId}"`,
      { encoding: 'utf-8', timeout: 60000, stdio: 'pipe' }
    );

    // Find the subtitle file - check multiple possible names
    const { readdirSync } = await import('fs');
    const dir = tmpdir();
    const files = readdirSync(dir).filter(f => f.startsWith(`yt-transcript-${videoId}`) && f.endsWith('.vtt'));
    
    // Prefer French, then English
    const frFile = files.find(f => f.includes('.fr'));
    const enFile = files.find(f => f.includes('.en'));
    const subtitleFile = frFile || enFile || files[0];

    if (!subtitleFile) {
      return { available: false, text: '' };
    }

    const possibleFiles = [path.join(dir, subtitleFile)];

    let subtitleContent = null;
    for (const file of possibleFiles) {
      try {
        subtitleContent = readFileSync(file, 'utf-8');
        unlinkSync(file);
        break;
      } catch (e) {
        console.log('[youtube] could not read:', file, e.message);
      }
    }

    if (!subtitleContent) {
      return { available: false, text: '' };
    }

    // Parse VTT to plain text
    const text = parseVTT(subtitleContent);
    return { available: true, text };

  } catch (err) {
    console.log('[youtube] no transcript available');
    return { available: false, text: '' };
  }
}

function parseVTT(vttContent) {
  // Remove VTT header and timestamps, keep only text
  const lines = vttContent.split('\n');
  const textLines = [];
  
  for (const line of lines) {
    // Skip headers, timestamps, and empty lines
    if (line.startsWith('WEBVTT') || 
        line.startsWith('Kind:') || 
        line.startsWith('Language:') ||
        line.includes('-->') ||
        line.match(/^\d+$/) ||
        line.trim() === '') {
      continue;
    }
    
    // Remove HTML tags and timing tags
    const cleanLine = line
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    
    if (cleanLine && !textLines.includes(cleanLine)) {
      textLines.push(cleanLine);
    }
  }

  return textLines.join(' ');
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}h${m.toString().padStart(2, '0')}m`;
  }
  return `${m}m${s.toString().padStart(2, '0')}s`;
}

function formatDate(yyyymmdd) {
  if (!yyyymmdd || yyyymmdd.length !== 8) return null;
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}`;
}
