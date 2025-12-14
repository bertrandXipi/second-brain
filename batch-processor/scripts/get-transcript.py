#!/usr/bin/env python3
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi
from youtube_transcript_api._errors import TranscriptsDisabled, NoTranscriptFound

def get_transcript(video_id):
    try:
        # Try French first, then English, then any available
        transcript_list = YouTubeTranscriptApi.list_transcripts(video_id)
        
        transcript = None
        lang = None
        
        # Try to get French (manual or auto-generated)
        try:
            transcript = transcript_list.find_transcript(['fr'])
            lang = 'fr'
        except:
            pass
        
        # Try English if no French
        if not transcript:
            try:
                transcript = transcript_list.find_transcript(['en'])
                lang = 'en'
            except:
                pass
        
        # Try any auto-generated
        if not transcript:
            try:
                for t in transcript_list:
                    if t.is_generated:
                        transcript = t
                        lang = t.language_code
                        break
            except:
                pass
        
        # Try any available
        if not transcript:
            for t in transcript_list:
                transcript = t
                lang = t.language_code
                break
        
        if not transcript:
            return json.dumps({"available": False, "text": "", "language": None})
        
        # Fetch the transcript
        data = transcript.fetch()
        text = ' '.join([entry['text'] for entry in data])
        
        return json.dumps({
            "available": True,
            "text": text,
            "language": lang,
            "is_generated": transcript.is_generated
        })
        
    except TranscriptsDisabled:
        return json.dumps({"available": False, "text": "", "error": "transcripts_disabled"})
    except NoTranscriptFound:
        return json.dumps({"available": False, "text": "", "error": "no_transcript"})
    except Exception as e:
        return json.dumps({"available": False, "text": "", "error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"available": False, "error": "no_video_id"}))
        sys.exit(1)
    
    video_id = sys.argv[1]
    print(get_transcript(video_id))
