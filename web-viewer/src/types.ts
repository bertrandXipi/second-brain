export type SourceType = 'article' | 'youtube' | 'video' | 'tweet' | 'pdf' | 'other';
export type Status = 'published' | 'draft' | 'pending' | 'failed';

export interface Fiche {
  slug: string;
  month: string;
  title: string;
  source_url: string;
  source_type: SourceType;
  date_captured: string;
  date_processed?: string;
  status: Status;
  language?: string;
  tags: string[];
  keywords: string[];
  notebooklm_url?: string;
  notebooklm_notebook_id?: string;
  ingest_source?: string;
  discord_message_url?: string;
  body_markdown: string;
  body_excerpt: string;
  word_count: number;
}

export interface Digest {
  slug: string;
  year: number;
  week: number;
  fiches_count: number;
  generated_at: string;
  body_markdown: string;
  linked_fiche_slugs: string[];
}

export interface Insight {
  slug: string;
  year: number;
  week: number;
  generated_at: string;
  focus?: string;
  body_markdown: string;
}

export interface FacetCount {
  name: string;
  count: number;
}

export interface IndexFile {
  generated_at: string;
  vault_path: string;
  counts: { fiches: number; digests: number; insights: number };
  fiches: Fiche[];
  digests: Digest[];
  insights: Insight[];
  facets: {
    months: string[];
    source_types: string[];
    tags: FacetCount[];
    keywords: FacetCount[];
    statuses: string[];
  };
}
