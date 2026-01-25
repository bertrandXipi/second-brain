ok implémente alors , ovici de la doc Héberger des serveurs MCP sur Cloud Run

Ce guide explique comment héberger un serveur Model Context Protocol (MCP) avec un transport HTTP diffusable sur Cloud Run. Il fournit également des conseils pour authentifier les clients MCP. Si vous débutez avec MCP, consultez les ressources suivantes :

Qu'est-ce que le protocole MCP (Model Context Protocol) ?



Qu'est-ce que le protocole MCP et comment fonctionne-t-il ?

MCP est un protocole ouvert qui standardise la façon dont les agents d'IA interagissent avec leur environnement. L'agent d'IA héberge un client MCP, et les outils et ressources avec lesquels il interagit sont des serveurs MCP. Le client MCP peut communiquer avec le serveur MCP via deux types de transport distincts :

Événements envoyés par le serveur (SSE) ou HTTP différé

Entrée/sortie standard (stdio)

Vous pouvez héberger des clients et des serveurs MCP sur la même machine locale, héberger un client MCP localement et le faire communiquer avec des serveurs MCP distants hébergés sur une plate-forme cloud comme Cloud Run, ou héberger à la fois le client et le serveur MCP sur une plate-forme cloud.

Cloud Run permet d'héberger des serveurs MCP avec un transport HTTP en flux continu, mais pas des serveurs MCP avec un transport stdio.

Le diagramme suivant montre comment le client MCP prend l'intention de l'agent d'IA et envoie une requête standardisée aux serveurs MCP, en spécifiant l'outil à exécuter. Une fois que le serveur MCP a exécuté l'action et récupéré les résultats, il les renvoie au client MCP dans un format cohérent.


Figure 1 : Le serveur MCP hébergé sur Cloud Run interagit avec le client MCP, qui interagit avec l'agent d'IA.

Les conseils de cette page s'appliquent si vous développez votre propre serveur MCP ou si vous utilisez un serveur MCP existant.

Si vous développez votre propre serveur MCP, nous vous recommandons d'utiliser un SDK de serveur MCP, tel que les SDK de langage officiels (TypeScript, Python, Go, Kotlin, Java, C#, Ruby ou Rust) ou FastMCP.

Si vous utilisez un serveur MCP existant, vous trouverez une liste des serveurs MCP officiels et de la communauté sur le dépôt GitHub des serveurs MCP. Docker Hub fournit également une liste organisée de serveurs MCP.

Avant de commencer

In the Google Cloud console, on the project selector page, select or create a Google Cloud project.

Roles required to select or create a project

Note: If you don't plan to keep the resources that you create in this procedure, create a project instead of selecting an existing project. After you finish these steps, you can delete the project, removing all resources associated with the project.

Go to project selector

Verify that billing is enabled for your Google Cloud project.

Configurez votre environnement de développement Cloud Run dans votre projet Google Cloud .

Assurez-vous de disposer des autorisations appropriées pour déployer des services et que les rôles Administrateur Cloud Run (roles/run.admin) et Utilisateur du compte de service (roles/iam.serviceAccountUser) vous ont été attribués.

Découvrez comment attribuer les rôles.

Héberger des serveurs MCP SSE ou HTTP streamables à distance

Les serveurs MCP qui utilisent le transport HTTP par flux ou les événements envoyés par le serveur (SSE) peuvent être hébergés à distance de leurs clients MCP.

Pour déployer ce type de serveur MCP sur Cloud Run, vous pouvez déployer le serveur MCP en tant qu'image de conteneur ou en tant que code source (généralement Node.js ou Python), selon la façon dont le serveur MCP est empaqueté.

Images de conteneursSources

Les serveurs MCP à distance distribués sous forme d'images de conteneur sont des serveurs Web qui écoutent les requêtes HTTP sur un port spécifique. Cela signifie qu'ils respectent le contrat d'exécution de conteneur de Cloud Run et peuvent être déployés sur un service Cloud Run.

Pour déployer un serveur MCP empaqueté sous forme d'image de conteneur, vous devez disposer de l'URL de l'image de conteneur et du port sur lequel il s'attend à recevoir des requêtes. Vous pouvez déployer ces fichiers à l'aide de la commande gcloud CLI suivante :

gcloud run deploy --image IMAGE_URL --port PORT

Remplacez :

IMAGE_URL par l'URL de l'image de conteneur, par exemple us-docker.pkg.dev/cloudrun/container/mcp.

PORT par le port sur lequel il écoute, par exemple 3000.



Une fois votre serveur MCP HTTP déployé sur Cloud Run, il obtient une URL HTTPS. La communication peut alors utiliser la compatibilité intégrée de Cloud Run avec le streaming de réponses HTTP.

Authentifier les clients MCP pour les agents d'IA

Selon l'endroit où vous avez hébergé le client MCP, consultez la section qui vous concerne :

Authentifier les clients MCP locaux

Authentifier les clients MCP exécutés sur Cloud Run

Authentifier les clients MCP locaux

Si l'agent d'IA hébergeant le client MCP s'exécute sur une machine locale, utilisez l'une des méthodes suivantes pour authentifier le client MCP :

Autorisation IAM "Demandeur"

Jeton d'ID OIDC

Pour en savoir plus, consultez la spécification MCP sur l'authentification.

Autorisation IAM "Demandeur"

Par défaut, l'URL des services Cloud Run exige que toutes les requêtes soient autorisées avec le rôle IAM Demandeur Cloud Run (roles/run.invoker). Cette liaison de stratégie IAM garantit qu'un mécanisme de sécurité robuste est utilisé pour authentifier votre client MCP local.

Après avoir déployé votre serveur MCP sur un service Cloud Run dans une région, exécutez le proxy Cloud Run sur votre machine locale pour exposer de manière sécurisée le serveur MCP distant à votre client à l'aide de vos propres identifiants :

gcloud run services proxy MCP_SERVER_NAME --region REGION --port=3000 

Remplacez :

MCP_SERVER_NAME par le nom de votre service Cloud Run.

REGION par la région dans laquelle vous avez déployé votre service. Google CloudPar exemple, europe-west1.

La commande de proxy Cloud Run crée un proxy local sur le port 3000 qui transfère les requêtes au serveur MCP distant et injecte votre identité.

Mettez à jour le fichier de configuration MCP de votre client MCP avec les éléments suivants :

{   "mcpServers": {     "cloud-run": {       "url": "http://localhost:3000/sse"     }   } } 

Si votre client MCP n'est pas compatible avec l'attribut url, utilisez le package npm mcp-remote :

{   "mcpServers": {     "cloud-run": {       "command": "npx",       "args": [         "-y",         "mcp-remote",         "http://localhost:3000/sse"       ]     }   } } 

Jeton d'ID OIDC

Selon que le client MCP expose des en-têtes ou utilise un moyen de fournir un transport authentifié personnalisé, vous pouvez envisager d'authentifier le client MCP avec un jeton d'identité OIDC.

Vous pouvez utiliser différentes bibliothèques d'authentification Google pour obtenir un jeton d'identification à partir de l'environnement d'exécution, par exemple la bibliothèque Google Auth pour Python. Ce jeton doit comporter la revendication d'audience correcte correspondant à l'URL *.run.app du service destinataire, sauf si vous utilisez des audiences personnalisées. Vous devez également inclure le jeton d'identité dans les requêtes client, telles que Authorization: Bearer <token value>.

Si le client MCP n'expose ni les en-têtes ni le transport, utilisez une autre méthode d'authentification.

Authentifier les clients MCP exécutés sur Cloud Run

Si l'agent d'IA hébergeant le client MCP s'exécute sur Cloud Run, utilisez l'une des méthodes suivantes pour authentifier le client MCP :

Déployer en tant que side-car

Authentifier un service à un autre

Utiliser Cloud Service Mesh

Déployer le serveur MCP en tant que side-car

Le serveur MCP peut être déployé en tant que side-car où s'exécute le client MCP.

Aucune authentification spécifique n'est requise pour ce cas d'utilisation, car le client et le serveur MCP se trouvent sur la même instance. Le client peut se connecter au serveur MCP à l'aide d'un port sur http://localhost:PORT. Remplacez PORT par un port différent de celui utilisé pour envoyer des requêtes au service Cloud Run.

Authentifier de service à service

Si le serveur et le client MCP s'exécutent en tant que services Cloud Run distincts, consultez Authentification de service à service.

Utiliser Cloud Service Mesh

Un agent hébergeant un client MCP peut se connecter à un serveur MCP distant à l'aide de Cloud Service Mesh. L'utilisation d'un maillage de services simplifie l'orchestration des microservices en gérant automatiquement l'authentification et la gestion du trafic.

Vous pouvez configurer le service de serveur MCP pour qu'il ait un nom court sur le maillage. Le client MCP peut communiquer avec le serveur MCP à l'aide du nom court http://mcp-server. L'authentification est gérée par le réseau maillé. et Créer et déployer un serveur MCP distant sur Cloud Run

Ce tutoriel vous explique comment créer et déployer un serveur Model Context Protocol (MCP) distant sur Cloud Run à l'aide du transport HTTP flux. Avec le transport HTTP transmissible, le serveur MCP fonctionne comme un processus indépendant capable de gérer plusieurs connexions client.

Objectifs

Au cours de ce tutoriel, vous allez :

Préparez votre projet Python avec le gestionnaire de packages uv.

Créez un serveur MCP pour les opérations mathématiques.

Déployer sur Cloud Run

Authentifiez le client MCP.

Testez le serveur MCP distant.

Coûts

Dans ce document, vous utilisez les composants facturables de Google Cloudsuivants :

Artifact Registry

Cloud Build

Cloud Run



Vous pouvez obtenir une estimation des coûts en fonction de votre utilisation prévue à l'aide du simulateur de coût.

 Les nouveaux utilisateurs de Google Cloud peuvent bénéficier d'un essai sans frais.



Avant de commencer

In the Google Cloud console, on the project selector page, select or create a Google Cloud project.

Roles required to select or create a project

Note: If you don't plan to keep the resources that you create in this procedure, create a project instead of selecting an existing project. After you finish these steps, you can delete the project, removing all resources associated with the project.

Go to project selector

Verify that billing is enabled for your Google Cloud project.

Enable the Artifact Registry, Cloud Run Admin API, and Cloud Build APIs.

Roles required to enable APIs

Enable the APIs

Configurez votre environnement de développement Cloud Run dans votre projet Google Cloud .

Assurez-vous de disposer des autorisations appropriées pour déployer des services et que les rôles Administrateur Cloud Run (roles/run.admin) et Utilisateur du compte de service (roles/iam.serviceAccountUser) vous ont été attribués.

Attribuez le rôle Demandeur Cloud Run (roles/run.invoker) à votre compte. Ce rôle permet au serveur MCP distant d'accéder au service Cloud Run.

Découvrez comment attribuer les rôles.

Si vous êtes soumis à une règle d'administration de restriction de domaine limitant les appels non authentifiés pour votre projet, vous devez accéder au service déployé comme décrit dans la section Tester les services privés.

Installez Uv, un gestionnaire de paquets et de projets Python.

Préparer votre projet Python

Les étapes suivantes décrivent comment configurer votre projet Python avec le gestionnaire de packages uv.

Créez un dossier nommé mcp-on-cloudrun pour stocker le code source à déployer :

  mkdir mcp-on-cloudrun   cd mcp-on-cloudrun 

Créez un projet Python avec l'outil uv pour générer un fichier pyproject.toml :

  uv init --name "mcp-on-cloudrun" --description "Example of deploying an MCP server on Cloud Run" --bare --python 3.10 

La commande uv init crée le fichier pyproject.toml suivant :

[project] name = "mcp-server" version = "0.1.0" description = "Example of deploying an MCP server on Cloud Run" readme = "README.md" requires-python = ">=3.10" dependencies = [] 

Créez les fichiers supplémentaires suivants :

server.py pour le code source du serveur MCP

test_server.py pour tester le serveur distant

Un fichier Dockerfile pour le déploiement sur Cloud Run

touch server.py test_server.py Dockerfile 

Le répertoire de votre projet doit contenir la structure suivante :

├── mcp-on-cloudrun │   ├── pyproject.toml │   ├── server.py │   ├── test_server.py │   └── Dockerfile 

Créer un serveur MCP pour les opérations mathématiques

Pour fournir un contexte utile afin d'améliorer l'utilisation des LLM avec MCP, configurez un serveur MCP mathématique avec FastMCP. FastMCP permet de créer rapidement des serveurs et des clients MCP avec Python.

Suivez ces étapes pour créer un serveur MCP pour les opérations mathématiques telles que l'addition et la soustraction.

Exécutez la commande suivante pour ajouter FastMCP en tant que dépendance dans le fichier pyproject.toml :

uv add fastmcp==2.13.1 --no-sync 

Ajoutez le code source du serveur MCP mathématique suivant dans le fichier server.py :

import asyncio import logging import os  from fastmcp import FastMCP   logger = logging.getLogger(__name__) logging.basicConfig(format="[%(levelname)s]: %(message)s", level=logging.INFO)  mcp = FastMCP("MCP Server on Cloud Run")  @mcp.tool() def add(a: int, b: int) -> int:     """Use this to add two numbers together.      Args:         a: The first number.         b: The second number.      Returns:         The sum of the two numbers.     """     logger.info(f">>> 🛠️ Tool: 'add' called with numbers '{a}' and '{b}'")     return a + b  @mcp.tool() def subtract(a: int, b: int) -> int:     """Use this to subtract two numbers.      Args:         a: The first number.         b: The second number.      Returns:         The difference of the two numbers.     """     logger.info(f">>> 🛠️ Tool: 'subtract' called with numbers '{a}' and '{b}'")     return a - b  if __name__ == "__main__":     logger.info(f"🚀 MCP server started on port {os.getenv('PORT', 8080)}")     # Could also use 'sse' transport, host="0.0.0.0" required for Cloud Run.     asyncio.run(         mcp.run_async(             transport="streamable-http",             host="0.0.0.0",             port=os.getenv("PORT", 8080),         )     ) 

Incluez le code suivant dans le fichier Dockerfile pour utiliser l'outil uv afin d'exécuter le fichier server.py :

# Use the official Python image FROM python:3.13-slim  # Install uv COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/  # Install the project into /app COPY . /app WORKDIR /app  # Allow statements and log messages to immediately appear in the logs ENV PYTHONUNBUFFERED=1  # Install dependencies RUN uv sync  EXPOSE $PORT  # Run the FastMCP server CMD ["uv", "run", "server.py"] 

Déployer dans Cloud Run

Vous pouvez déployer le serveur MCP en tant qu'image de conteneur ou en tant que code source :

 Image du conteneur Source

Pour déployer un serveur MCP empaqueté en tant qu'image de conteneur, suivez ces instructions.

Créez un dépôt Artifact Registry pour stocker l'image de conteneur :

gcloud artifacts repositories create remote-mcp-servers \ --repository-format=docker \ --location=us-central1 \ --description="Repository for remote MCP servers" \ --project=PROJECT_ID 

Créez l'image de conteneur et transférez-la vers Artifact Registry avec Cloud Build :

gcloud builds submit --region=us-central1 --tag us-central1-docker.pkg.dev/PROJECT_ID/remote-mcp-servers/mcp-server:latest 

Déployez l'image de conteneur du serveur MCP sur Cloud Run :

gcloud run deploy mcp-server \ --image us-central1-docker.pkg.dev/PROJECT_ID/remote-mcp-servers/mcp-server:latest \ --region=us-central1 \ --no-allow-unauthenticated 



Authentifier le client MCP

Si vous avez déployé votre service avec l'indicateur --no-allow-unauthenticated, tout client MCP qui se connecte à votre serveur MCP distant doit s'authentifier.

Attribuez le rôle Demandeur Cloud Run (roles/run.invoker) au compte de service. Cette association de stratégie Identity and Access Management garantit qu'un mécanisme de sécurité renforcé est utilisé pour authentifier votre client MCP local.

Exécutez le proxy Cloud Run pour créer un tunnel authentifié vers le serveur MCP distant sur votre machine locale :

gcloud run services proxy mcp-server --region=us-central1 

Si le proxy Cloud Run n'est pas encore installé, cette commande vous invite à le télécharger. Suivez les instructions pour télécharger et installer le proxy.

Cloud Run authentifie tout le trafic vers http://127.0.0.1:8080 et transfère les requêtes au serveur MCP distant.

Tester le serveur MCP distant

Vous allez tester et vous connecter au serveur MCP distant à l'aide du client FastMCP et en accédant à l'URL http://127.0.0.1:8080/mcp.

Pour tester et appeler le mécanisme d'ajout et de soustraction, procédez comme suit :

Avant d'exécuter le serveur de test, exécutez le proxy Cloud Run.

Créez un fichier de test nommé test_server.py et ajoutez le code suivant :

import asyncio  from fastmcp import Client  async def test_server():     # Test the MCP server using streamable-http transport.     # Use "/sse" endpoint if using sse transport.     async with Client("http://localhost:8080/mcp") as client:         # List available tools         tools = await client.list_tools()         for tool in tools:             print(f">>> 🛠️  Tool found: {tool.name}")         # Call add tool         print(">>> 🪛  Calling add tool for 1 + 2")         result = await client.call_tool("add", {"a": 1, "b": 2})         print(f"<<< ✅ Result: {result[0].text}")         # Call subtract tool         print(">>> 🪛  Calling subtract tool for 10 - 3")         result = await client.call_tool("subtract", {"a": 10, "b": 3})         print(f"<<< ✅ Result: {result[0].text}")  if __name__ == "__main__":     asyncio.run(test_server())

Dans un nouveau terminal, exécutez le serveur de test :

uv run test_server.py 

Vous devriez obtenir le résultat suivant :

 🛠️ Tool found: add  🛠️ Tool found: subtract  🪛 Calling add tool for 1 + 2  ✅ Result: 3  🪛 Calling subtract tool for 10 - 3  ✅ Result: 7 

Opération réussie : vous avez déployé un serveur MCP distant sur Cloud Run et l'avez testé à l'aide du client FastMCP.

Effectuer un nettoyage

Pour éviter des frais supplémentaires sur votre compte Google Cloud , supprimez toutes les ressources que vous avez déployées avec ce tutoriel.

Supprimer le projet

Si vous avez créé un projet pour ce tutoriel, supprimez-le. Si vous avez utilisé un projet existant et que vous devez le conserver sans les modifications que vous avez apportées dans ce tutoriel, supprimez les ressources que vous avez créées pour ce tutoriel.



Le moyen le plus simple d'empêcher la facturation est de supprimer le projet que vous avez créé pour ce tutoriel.

Pour supprimer le projet :

Attention : La suppression d'un projet entraîne les effets décrits ci-dessous :

Tout le contenu du projet est supprimé. Si vous avez utilisé un projet existant pour les tâches décrites dans ce document et que vous le supprimez, vous supprimerez également tout autre travail effectué dans le projet.

Les ID de projets personnalisés sont perdus. Lorsque vous avez créé ce projet, vous avez peut-être créé un ID de projet personnalisé que vous souhaitez utiliser à l'avenir. Pour conserver les URL qui utilisent l'ID de projet, telle qu'une URL appspot.com, supprimez les ressources sélectionnées dans le projet au lieu de supprimer l'ensemble du projet.

Si vous envisagez d'explorer plusieurs architectures, tutoriels et guides de démarrage rapide, réutiliser des projets peut vous aider à ne pas dépasser les limites de quotas des projets.

 In the Google Cloud console, go to the Manage resources page.

Go to Manage resources

 In the project list, select the project that you want to delete, and then click Delete.

 In the dialog, type the project ID, and then click Shut down to delete the project.





Supprimer les ressources du tutoriel

Supprimez le service Cloud Run que vous avez déployé dans ce tutoriel. Les services Cloud Run n'entraînent pas de coûts tant qu'ils ne reçoivent pas de requêtes.

Pour supprimer votre service Cloud Run, exécutez la commande suivante :

gcloud run services delete SERVICE-NAME

Remplacez SERVICE-NAME par le nom du service.

Vous pouvez également supprimer des services Cloud Run à partir de la consoleGoogle Cloud .

Supprimez la configuration régionale par défaut gcloud que vous avez ajoutée lors de la configuration du tutoriel :

gcloud config unset run/region 

Supprimez la configuration du projet :

 gcloud config unset project z