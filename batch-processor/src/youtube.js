import { execSync } from 'child_process';
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
  try {
    const scriptPath = path.join(path.dirname(import.meta.url.replace('file://', '')), '../scripts/get-transcript.py');
    console.log('[youtube] fetching transcript via python...');
    
    const result = execSync(`python3 "${scriptPath}" "${videoId}"`, {
      encoding: 'utf-8',
      timeout: 30000,
    });
    
    const data = JSON.parse(result.trim());
    
    if (data.available) {
      console.log(`[youtube] transcript found (${data.language}, ${data.text.length} chars)`);
      return { available: true, text: data.text };
    } else {
      console.log('[youtube] no transcript:', data.error || 'unknown');
      return { available: false, text: '' };
    }
    
  } catch (err) {
    console.log('[youtube] transcript error:', err.message);
    return { available: false, text: '' };
  }
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
