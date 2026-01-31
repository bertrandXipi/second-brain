#!/usr/bin/env node

/**
 * Script de test pour vérifier l'accès aux contenus Twitter
 */

import { fetchAndExtract } from '../batch-processor/src/fetch-content.js';

const testUrls = [
  'https://x.com/m1lk_s1tu4t10n5/status/2016111279329452379?s=12', // Nouveau lien de test
  'https://x.com/wesroth/status/2013693268190437410?s=12',
  'https://x.com/aiedge_/status/2013641070815650252?s=12'
];

async function testTwitterFetch() {
  console.log('🧪 Test d\'accès aux contenus Twitter...\n');

  for (const url of testUrls) {
    console.log(`\n📍 Test: ${url}`);
    console.log('─'.repeat(80));

    try {
      const result = await fetchAndExtract(url);
      
      console.log(`✅ Succès!`);
      console.log(`   Titre: ${result.title}`);
      console.log(`   Contenu (${result.content.length} chars): ${result.content.slice(0, 200)}...`);
      console.log(`   Est Twitter: ${result.isTwitter || false}`);
      
      // Vérifier si on a récupéré le message d'erreur
      if (result.content.includes('privacy related extensions')) {
        console.log(`❌ PROBLÈME: Contenu récupéré est le message d'erreur Twitter`);
      } else {
        console.log(`✅ Contenu semble valide (pas de message d'erreur détecté)`);
      }
      
    } catch (err) {
      console.log(`❌ Échec: ${err.message}`);
    }
  }

  console.log('\n📊 Test terminé');
}

testTwitterFetch().catch(console.error);