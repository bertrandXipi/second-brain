import { writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const links = `https://www.reddit.com/r/kiroIDE/s/zI40hIoBao https://youtube.com/watch?v=PaUW8SNCwvM&si=t_ozM7koZ2z1-d5e https://youtube.com/watch?v=4uZ4dpwbGcY&si=ymko8TTTyhXiRu_u https://youtube.com/watch?v=JBr3cQph5hU&si=C9-psuGPphWq81Gc https://youtube.com/watch?v=TJkxAJS34CQ&si=32bp11HNe_F9Yziq https://youtube.com/watch?v=S-P9FZkrzQ4&si=kw1Swlvn2XBOQb6Q https://youtube.com/watch?v=mH20cakqp5E&si=InYTSXkh7L6vksz8 https://www.linkedin.com/posts/jacob-klug-37b254156_this-6m-per-month-software-was-rebuilt-in-activity-7417562474192736256-jHVa?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.linkedin.com/posts/valentindecker_sauver-un-business-qui-coule-ugcPost-7386027336191856640-zcPE?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.linkedin.com/posts/krea-ai_introducing-trainers-for-qwen-2512-and-z-image-ugcPost-7414938291315286016-IF8c?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.linkedin.com/posts/flavienchervet_google-ucp-ia-activity-7416418215238623232-TMoS?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.linkedin.com/posts/paulineebel_google-frappe-fort-un-hub-ia-gratuit-vient-activity-7417226507586035712-R6Tb?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://youtube.com/watch?v=Kdql4I-NJ0M&si=QYMcmVTkMsCs3n6d https://www.reddit.com/r/notebooklm/s/ooqgdfqJet https://www.youtube.com/watch?v=dEDtEmvwqyE&t=119s https://www.linkedin.com/posts/remirostan_13-jan-2026-ugcPost-7416726618871652352-nKVE?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.linkedin.com/posts/mcrucq_ahrefs-geo-activity-7416380958817513473-bBKT?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIAhttps://www.reddit.com/r/buildinpublic/s/t0Q3ZmwNlz https://www.reddit.com/r/lovable/s/99sv1I4ZI3 https://www.reddit.com/r/GoogleAntigravityIDE/s/07jlmMzwTL https://www.reddit.com/r/google_antigravity/s/wsHYO2oBXI https://www.reddit.com/r/google_antigravity/s/ZdvPBTbKtx https://youtube.com/watch?v=fAxyQFt7O5o&si=O-7ZnVk32pdH6uPu https://youtube.com/watch?v=pUCWwGR5WmQ&si=ZmqZt-rHW0w6lbn6 https://youtube.com/watch?v=I_w81rptxkc&si=T8cCEXOhIplKF5qF https://youtube.com/watch?v=UR09nuSxGio&si=AN_JpLCUQMSCPUev https://youtube.com/watch?v=MpLBkjWK72Q&si=atpxRKKpdZDgL_Ps https://www.reddit.com/r/notebooklm/s/y2ua4T9Z7U https://www.reddit.com/r/google_antigravity/s/pxopHuVHrR https://www.reddit.com/r/Pinterestmarketing/s/246JJFMcu0 https://iagenerative.substack.com/p/zen-like-buddha?utm_source=substack&utm_medium=email#media-4a94a63f-dfb7-4ee0-a14d-e8efbe642d4a https://www.linkedin.com/posts/remirostan_24-jan-2026-ugcPost-7420711875803308032-lMpy?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.reddit.com/r/passive_income/s/D9opERvLYP https://www.reddit.com/r/passive_income/s/265sHF5phd https://www.reddit.com/r/notebooklm/s/aJOcjGJE7C https://www.therundown.ai/p/ai-takes-center-stage-at-davos?_bhlid=4eaa234680798ad3bdb45514b5705f029891f88c https://x.com/techhalla/status/2013689003615076407?s=12 https://x.com/wesroth/status/2013693268190437410?s=12 https://x.com/davidondrej1/status/2012990589403312589?s=12 https://x.com/aiedge_/status/2013641070815650252?s=12 https://www.reddit.com/r/notebooklm/s/iP2i9eRYsX https://www.reddit.com/r/kiroIDE/s/C6ZAASh9Mm https://www.reddit.com/r/vibecoding/s/kU5G3tLAjM https://www.linkedin.com/posts/ronnieparsons_everyones-vibe-coding-apps-right-now-but-activity-7418156076199460865-WuMS?utm_source=share&utm_medium=member_ios&rcm=ACoAABVFmSQB_1DLOTmJwsRT2PNC0hrNEP6ztIA https://www.youtube.com/shorts/fFj2stnvH38 https://www.reddit.com/r/scaleinpublic/s/I6TchotSZy https://www.reddit.com/r/GoogleAntigravityIDE/s/qWWUzYsNE0`;

// Extract unique URLs
const urlRegex = /https?:\/\/[^\s]+/g;
const allUrls = links.match(urlRegex) || [];
const uniqueUrls = [...new Set(allUrls)];

console.log(`Found ${uniqueUrls.length} unique URLs`);

const batchId = randomUUID();
const pendingDir = './workdir/repo/mobile-share/pending';

if (!existsSync(pendingDir)) {
  await mkdir(pendingDir, { recursive: true });
}

for (const url of uniqueUrls) {
  const id = randomUUID();
  const item = {
    id,
    batch_id: batchId,
    url,
    title: null,
    note: null,
    tags: [],
    category: null,
    source: "manual",
    created_at: new Date().toISOString(),
    manual: {
      batch_name: "manual-batch-2026-01-25"
    }
  };

  const filename = `${id}.json`;
  const filepath = path.join(pendingDir, filename);
  await writeFile(filepath, JSON.stringify(item, null, 2));
  console.log(`Created: ${filename} -> ${url}`);
}

console.log(`\nBatch created with ${uniqueUrls.length} items`);
console.log(`Batch ID: ${batchId}`);
