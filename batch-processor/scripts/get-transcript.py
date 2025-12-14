#!/usr/bin/env python3
import sys
import json
from youtube_transcript_api import YouTubeTranscriptApi

def get_transcript(video_id):
    try:
        api = YouTubeTranscriptApi()
        
        # Try French first, then English
        try:
            transcript = api.fetch(video_id, languages=['fr', 'en'])
            text = ' '.join([entry.text for entry in transcript])
            return json.dumps({
                "available": True,
                "text": text,
                "language": "fr/en"
            })
        except:
            pass
        
        # Try to list available transcripts and get any
        try:
            transcript_list = api.list(video_id)
            for t in transcript_list:
                transcript = t.fetch()
                text = ' '.join([entry.text for entry in transcript])
                return json.dumps({
                    "available": True,
                    "text": text,
                    "language": t.language_code
                })
        except:
            pass
        
        return json.dumps({"available": False, "text": "", "error": "no_transcript"})
        
    except Exception as e:
        return json.dumps({"available": False, "text": "", "error": str(e)})

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"available": False, "error": "no_video_id"}))
        sys.exit(1)
    
    video_id = sys.argv[1]
    print(get_transcript(video_id))
