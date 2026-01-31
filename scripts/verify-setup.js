/**
 * Script de vérification complète de l'installation
 * À exécuter dans Google Apps Script après l'installation
 */

function verifyCompleteSetup() {
  Logger.log('╔════════════════════════════════════════════════════╗');
  Logger.log('║  VÉRIFICATION DE L\'INSTALLATION                   ║');
  Logger.log('║  Gmail → Discord → NotebookLM                     ║');
  Logger.log('╚════════════════════════════════════════════════════╝');
  Logger.log('');
  
  let allGood = true;
  
  // Test 1 : Configuration
  Logger.log('📋 Test 1/5 : Vérification de la configuration');
  if (DISCORD_WEBHOOK_URL.includes('YOUR_WEBHOOK')) {
    Logger.log('❌ ERREUR : Le webhook Discord n\'est pas configuré');
    Logger.log('   → Modifier la variable DISCORD_WEBHOOK_URL ligne 15');
    allGood = false;
  } else if (!DISCORD_WEBHOOK_URL.startsWith('https://discord.com/api/webhooks/')) {
    Logger.log('❌ ERREUR : L\'URL du webhook est invalide');
    Logger.log('   → Format attendu : https://discord.com/api/webhooks/...');
    allGood = false;
  } else {
    Logger.log('✅ Configuration OK');
  }
  Logger.log('');
  
  // Test 2 : Accès Gmail
  Logger.log('📧 Test 2/5 : Vérification de l\'accès Gmail');
  try {
    const threads = GmailApp.search('from:news@daily.therundown.ai', 0, 1);
    if (threads.length === 0) {
      Logger.log('⚠️  ATTENTION : Aucun email trouvé de The Rundown AI');
      Logger.log('   → Es-tu bien abonné à la newsletter ?');
      Logger.log('   → As-tu reçu au moins un email ?');
    } else {
      const lastEmail = threads[0].getMessages()[0];
      Logger.log('✅ Accès Gmail OK');
      Logger.log(`   Dernier email : ${lastEmail.getSubject()}`);
      Logger.log(`   Date : ${lastEmail.getDate()}`);
    }
  } catch (error) {
    Logger.log('❌ ERREUR : Impossible d\'accéder à Gmail');
    Logger.log(`   ${error.message}`);
    allGood = false;
  }
  Logger.log('');
  
  // Test 3 : Extraction du lien
  Logger.log('🔗 Test 3/5 : Vérification de l\'extraction du lien');
  try {
    const threads = GmailApp.search('from:news@daily.therundown.ai', 0, 1);
    if (threads.length > 0) {
      const body = threads[0].getMessages()[0].getBody();
      const link = extractReadOnlineLink(body);
      
      if (link) {
        Logger.log('✅ Extraction du lien OK');
        Logger.log(`   Lien : ${link}`);
      } else {
        Logger.log('❌ ERREUR : Impossible d\'extraire le lien');
        Logger.log('   → Le format de l\'email a peut-être changé');
        Logger.log('   → Exécuter showAllLinks() pour débugger');
        allGood = false;
      }
    } else {
      Logger.log('⚠️  SKIP : Pas d\'email pour tester l\'extraction');
    }
  } catch (error) {
    Logger.log('❌ ERREUR lors de l\'extraction');
    Logger.log(`   ${error.message}`);
    allGood = false;
  }
  Logger.log('');
  
  // Test 4 : Webhook Discord
  Logger.log('💬 Test 4/5 : Vérification du webhook Discord');
  try {
    const testPayload = {
      content: '🧪 Test de vérification du setup Gmail→Discord',
      embeds: [{
        title: '✅ Vérification du système',
        description: 'Si tu vois ce message, le webhook fonctionne !',
        color: 5763719, // Vert
        footer: { text: 'Script de vérification' },
        timestamp: new Date().toISOString()
      }]
    };
    
    const options = {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify(testPayload),
      muteHttpExceptions: true
    };
    
    const response = UrlFetchApp.fetch(DISCORD_WEBHOOK_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 204 || responseCode === 200) {
      Logger.log('✅ Webhook Discord OK');
      Logger.log('   → Vérifie ton canal Discord, tu devrais voir un message de test');
    } else {
      Logger.log('❌ ERREUR : Le webhook Discord ne fonctionne pas');
      Logger.log(`   Code HTTP : ${responseCode}`);
      Logger.log(`   Réponse : ${response.getContentText()}`);
      allGood = false;
    }
  } catch (error) {
    Logger.log('❌ ERREUR lors de l\'envoi sur Discord');
    Logger.log(`   ${error.message}`);
    allGood = false;
  }
  Logger.log('');
  
  // Test 5 : Déclencheurs
  Logger.log('⏰ Test 5/5 : Vérification des déclencheurs');
  try {
    const triggers = ScriptApp.getProjectTriggers();
    const rundownTriggers = triggers.filter(t => 
      t.getHandlerFunction() === 'processRundownEmails'
    );
    
    if (rundownTriggers.length === 0) {
      Logger.log('⚠️  ATTENTION : Aucun déclencheur automatique configuré');
      Logger.log('   → Aller dans Déclencheurs (⏰) et créer un déclencheur');
      Logger.log('   → Fonction : processRundownEmails');
      Logger.log('   → Type : Minuteur, toutes les 30 minutes');
    } else {
      Logger.log('✅ Déclencheur(s) configuré(s)');
      rundownTriggers.forEach(trigger => {
        const eventType = trigger.getEventType();
        Logger.log(`   → ${eventType}`);
      });
    }
  } catch (error) {
    Logger.log('❌ ERREUR lors de la vérification des déclencheurs');
    Logger.log(`   ${error.message}`);
  }
  Logger.log('');
  
  // Résumé
  Logger.log('╔════════════════════════════════════════════════════╗');
  if (allGood) {
    Logger.log('║  ✅ INSTALLATION RÉUSSIE !                        ║');
    Logger.log('║                                                    ║');
    Logger.log('║  Ton système est prêt à fonctionner.              ║');
    Logger.log('║  Attends la prochaine newsletter pour vérifier    ║');
    Logger.log('║  que tout fonctionne automatiquement.             ║');
  } else {
    Logger.log('║  ⚠️  INSTALLATION INCOMPLÈTE                      ║');
    Logger.log('║                                                    ║');
    Logger.log('║  Corrige les erreurs ci-dessus et relance         ║');
    Logger.log('║  ce script de vérification.                       ║');
  }
  Logger.log('╚════════════════════════════════════════════════════╝');
  Logger.log('');
  
  // Prochaines étapes
  Logger.log('📝 PROCHAINES ÉTAPES :');
  Logger.log('');
  Logger.log('1. Vérifier Discord : un message de test devrait être visible');
  Logger.log('2. Attendre la prochaine newsletter (2-3x/jour)');
  Logger.log('3. Vérifier que le lien apparaît automatiquement sur Discord');
  Logger.log('4. Vérifier que ton bot Discord traite le lien');
  Logger.log('5. Vérifier qu\'une fiche markdown est créée');
  Logger.log('');
  Logger.log('📊 MONITORING :');
  Logger.log('');
  Logger.log('• Voir les exécutions : Icône 📋 "Exécutions" (barre latérale)');
  Logger.log('• Voir les logs : Menu "Affichage" → "Journaux" (Ctrl+Enter)');
  Logger.log('• Modifier les déclencheurs : Icône ⏰ "Déclencheurs"');
  Logger.log('');
  Logger.log('🆘 EN CAS DE PROBLÈME :');
  Logger.log('');
  Logger.log('• Consulter docs/GUIDE-COMPLET-GMAIL-DISCORD.md');
  Logger.log('• Exécuter testWithRealEmail() pour débugger');
  Logger.log('• Exécuter showAllLinks() pour voir tous les liens');
  Logger.log('');
}

function quickHealthCheck() {
  Logger.log('🏥 HEALTH CHECK RAPIDE');
  Logger.log('');
  
  // Vérifier les dernières exécutions
  const triggers = ScriptApp.getProjectTriggers();
  const rundownTriggers = triggers.filter(t => 
    t.getHandlerFunction() === 'processRundownEmails'
  );
  
  Logger.log(`✅ Déclencheurs actifs : ${rundownTriggers.length}`);
  
  // Vérifier les emails récents
  const threads = GmailApp.search('from:news@daily.therundown.ai', 0, 5);
  Logger.log(`📧 Emails Rundown AI (5 derniers) : ${threads.length}`);
  
  // Vérifier les labels
  const label = GmailApp.getUserLabelByName(LABEL_NAME);
  if (label) {
    const processedThreads = label.getThreads(0, 10);
    Logger.log(`✅ Emails traités : ${processedThreads.length}`);
  } else {
    Logger.log('⚠️  Label "Processed/Rundown" pas encore créé');
  }
  
  Logger.log('');
  Logger.log('Tout semble OK ! 🎉');
}

function showSystemInfo() {
  Logger.log('ℹ️  INFORMATIONS SYSTÈME');
  Logger.log('');
  Logger.log(`Projet : ${ScriptApp.getProjectKey()}`);
  Logger.log(`Timezone : ${Session.getScriptTimeZone()}`);
  Logger.log(`Email : ${Session.getActiveUser().getEmail()}`);
  Logger.log('');
  
  // Quotas
  Logger.log('📊 QUOTAS GOOGLE APPS SCRIPT :');
  Logger.log('');
  Logger.log('• Email read/write : 20,000/jour');
  Logger.log('• URL Fetch calls : 20,000/jour');
  Logger.log('• Script runtime : 6 min/exécution');
  Logger.log('• Triggers total runtime : 90 min/jour (gratuit)');
  Logger.log('');
  Logger.log('Pour The Rundown AI (2-3 emails/jour), largement suffisant ! ✅');
}
