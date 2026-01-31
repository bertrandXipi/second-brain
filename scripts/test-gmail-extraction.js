/**
 * Script de test pour vérifier l'extraction du lien "Read Online"
 * À exécuter dans Google Apps Script pour débugger
 */

function testWithSampleHTML() {
  // Exemple de HTML typique d'une newsletter The Rundown AI
  const sampleHTML = `
    <html>
      <body>
        <div>
          <p>Welcome to The Rundown AI</p>
          <a href="https://therundown.ai/p/viral-ai-agent-molts-past-trademark?utm_source=email">Read Online</a>
          <p>Today's content...</p>
        </div>
      </body>
    </html>
  `;
  
  Logger.log('=== TEST D\'EXTRACTION ===');
  const link = extractReadOnlineLink(sampleHTML);
  
  if (link) {
    Logger.log('✅ Lien extrait avec succès:');
    Logger.log(link);
  } else {
    Logger.log('❌ Échec de l\'extraction');
  }
}

function testWithRealEmail() {
  Logger.log('=== TEST AVEC EMAIL RÉEL ===');
  
  // Chercher le dernier email de The Rundown
  const threads = GmailApp.search('from:news@daily.therundown.ai', 0, 1);
  
  if (threads.length === 0) {
    Logger.log('❌ Aucun email trouvé de news@daily.therundown.ai');
    return;
  }
  
  const message = threads[0].getMessages()[0];
  const subject = message.getSubject();
  const body = message.getBody();
  
  Logger.log(`📧 Email trouvé: ${subject}`);
  Logger.log(`📅 Date: ${message.getDate()}`);
  Logger.log('');
  
  // Afficher un extrait du HTML
  Logger.log('--- Extrait du HTML (500 premiers caractères) ---');
  Logger.log(body.substring(0, 500));
  Logger.log('');
  
  // Tester l'extraction
  const link = extractReadOnlineLink(body);
  
  if (link) {
    Logger.log('✅ Lien extrait:');
    Logger.log(link);
    Logger.log('');
    
    // Tester l'envoi sur Discord (commenté par défaut)
    // const success = sendToDiscord(link, subject);
    // Logger.log(success ? '✅ Envoyé sur Discord' : '❌ Échec envoi Discord');
  } else {
    Logger.log('❌ Aucun lien trouvé');
    Logger.log('');
    Logger.log('💡 Suggestions:');
    Logger.log('1. Vérifier que l\'email contient bien un lien "Read Online"');
    Logger.log('2. Chercher manuellement "therundown.ai" dans le HTML ci-dessus');
    Logger.log('3. Adapter la regex dans extractReadOnlineLink()');
  }
}

function showAllLinks() {
  Logger.log('=== TOUS LES LIENS DANS L\'EMAIL ===');
  
  const threads = GmailApp.search('from:news@daily.therundown.ai', 0, 1);
  
  if (threads.length === 0) {
    Logger.log('❌ Aucun email trouvé');
    return;
  }
  
  const body = threads[0].getMessages()[0].getBody();
  
  // Extraire tous les liens
  const linkRegex = /href=["']([^"']+)["']/gi;
  let match;
  let count = 0;
  
  while ((match = linkRegex.exec(body)) !== null) {
    count++;
    Logger.log(`${count}. ${match[1]}`);
  }
  
  Logger.log('');
  Logger.log(`Total: ${count} liens trouvés`);
}

function testDiscordWebhook() {
  Logger.log('=== TEST WEBHOOK DISCORD ===');
  
  const testUrl = 'https://therundown.ai/test';
  const testSubject = 'Test depuis Google Apps Script';
  
  const success = sendToDiscord(testUrl, testSubject);
  
  if (success) {
    Logger.log('✅ Webhook Discord fonctionne !');
    Logger.log('Vérifie ton canal Discord');
  } else {
    Logger.log('❌ Échec du webhook Discord');
    Logger.log('Vérifie l\'URL du webhook dans la configuration');
  }
}

// Menu personnalisé pour faciliter les tests
function onOpen() {
  const ui = SpreadsheetApp.getUi();
  // Ou DocumentApp.getUi() ou SlidesApp.getUi() ou FormApp.getUi()
  ui.createMenu('🧪 Tests Rundown AI')
      .addItem('Test avec HTML exemple', 'testWithSampleHTML')
      .addItem('Test avec email réel', 'testWithRealEmail')
      .addItem('Afficher tous les liens', 'showAllLinks')
      .addItem('Test webhook Discord', 'testDiscordWebhook')
      .addSeparator()
      .addItem('Exécuter le script complet', 'processRundownEmails')
      .addToUi();
}
