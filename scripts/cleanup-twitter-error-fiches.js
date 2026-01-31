#!/usr/bin/env node

/**
 * Script pour nettoyer les fiches Twitter qui ne contiennent que des messages d'erreur
 * Ces fiches analysent le message "Some privacy related extensions may cause issues on x.com"
 * au lieu du contenu réel du tweet.
 */

import { readdir, readFile, unlink, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';

const FICHES_DIR = '../batch-processor/workdir/repo/fiches';
const FAILED_DIR = '../batch-processor/workdir/repo/mobile-share/failed';

async function main() {
  console.log('🧹 Nettoyage des fiches Twitter avec messages d\'erreur...');

  let totalChecked = 0;
  let twitterErrorFiches = 0;
  let moved = 0;

  // Parcourir tous les dossiers de fiches
  const years = await readdir(FICHES_DIR);
  
  for (const year of years) {
    const yearPath = path.join(FICHES_DIR, year);
    if (!existsSync(yearPath)) continue;

    const files = await readdir(yearPath);
    
    for (const file of files) {
      if (!file.endsWith('.md')) continue;
      
      const filePath = path.join(yearPath, file);
      totalChecked++;

      try {
        const content = await readFile(filePath, 'utf-8');
        
        // Vérifier si c'est une fiche Twitter avec message d'erreur
        const isTwitterLink = content.includes('source_url: "https://x.com/') || 
                             content.includes('source_url: "https://twitter.com/');
        
        const hasErrorMessage = content.includes('Some privacy related extensions may cause issues on x.com') ||
                               content.includes('Privacy related extensions') ||
                               content.includes('Please disable them and try again');

        if (isTwitterLink && hasErrorMessage) {
          console.log(`❌ Fiche Twitter avec erreur détectée: ${file}`);
          twitterErrorFiches++;

          // Extraire l'URL source du frontmatter
          const sourceUrlMatch = content.match(/source_url: "([^"]+)"/);
          const sourceUrl = sourceUrlMatch ? sourceUrlMatch[1] : 'URL inconnue';

          // Créer un fichier d'erreur dans le dossier failed
          const errorId = file.replace('.md', '');
          const errorFile = path.join(FAILED_DIR, `${errorId}.json`);
          const errorTextFile = path.join(FAILED_DIR, `${errorId}-error.txt`);

          // Créer l'objet d'erreur
          const errorItem = {
            id: errorId,
            url: sourceUrl,
            title: sourceUrl,
            source: 'twitter-cleanup',
            tags: [],
            created_at: new Date().toISOString(),
            error: 'Twitter access blocked - content scraping returns error message instead of tweet content'
          };

          await writeFile(errorFile, JSON.stringify(errorItem, null, 2));
          await writeFile(errorTextFile, 
            'Twitter/X.com links are blocked due to access restrictions.\n' +
            'Twitter returns "Some privacy related extensions may cause issues on x.com" error message\n' +
            'instead of actual tweet content when scraped.\n\n' +
            `Original URL: ${sourceUrl}\n` +
            `Cleaned up: ${new Date().toISOString()}`
          );

          // Supprimer la fiche erronée
          await unlink(filePath);
          moved++;
          
          console.log(`  ✅ Déplacée vers failed: ${errorId}`);
        }
      } catch (err) {
        console.error(`❌ Erreur lors du traitement de ${file}:`, err.message);
      }
    }
  }

  console.log('\n📊 Résumé du nettoyage:');
  console.log(`   Fiches vérifiées: ${totalChecked}`);
  console.log(`   Fiches Twitter avec erreur: ${twitterErrorFiches}`);
  console.log(`   Fiches déplacées vers failed: ${moved}`);
  
  if (moved > 0) {
    console.log('\n✅ Nettoyage terminé. Les fiches erronées ont été déplacées vers mobile-share/failed/');
    console.log('   Vous pouvez maintenant commiter ces changements.');
  } else {
    console.log('\n✅ Aucune fiche erronée trouvée.');
  }
}

main().catch(console.error);