class PlayableGame {
    constructor(game, characterState, assets, emojis) {
        this.game = game;
        this.characterState = characterState;
        this.assets = assets;
        this.emojis = emojis;

        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');

        // Set Character Name in HUD
        const nameEl = document.getElementById('stat-char-name');
        if (nameEl && this.characterState.name) {
            nameEl.innerText = this.characterState.name;
        }

        // Character Entity State
        this.player = {
            x: this.canvas.width / 2,
            y: this.canvas.height / 2,
            speed: 3,
            direction: 0, // 0: Down, 1: Up, 2: Right, 3: Left (Matches spritesheet rows)
            isMoving: false,
            frame: 0,
            animTimer: 0,
            face: { pendingType: null, isAnimating: false, currentFrame: 0, type: 'static' },
            attributes: this.characterState.attributes || { beauty: 0, intelligence: 0, charisma: 0, fitness: 0 },
            interests: this.characterState.interests || [],
            messages: [
                { id: 1, sender: 'Mãe 👩‍👦', text: 'Oi filho! Não se esqueça de comer alguma coisa e se preparar para o primeiro dia de aula amanhã. Te amo! ❤️\n\n[Missão: Sobreviver ao primeiro dia]', date: '08:00', read: false }
            ]
        };

        this.phoneState = {
            isOpen: false,
            view: 'home', // 'home', 'contacts', 'messages', 'active_chat'
            selectedIndex: 0,
            activeNpcId: null // Id of the NPC we are currently chatting with
        };

        this.keys = {
            w: false, a: false, s: false, d: false,
            ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false,
            o: false, Enter: false, p: false, t: false // Added p for Profile, t for Smartphone
        };

        this.isMenuOpen = false;
        this.faceOptions = [];
        this.selectedFaceIndex = 0;
        this.faceButtons = [];
        this.nearDoor = null;
        this.currentRoom = 'street'; // Rooms: bedroom, livingroom, bathroom, kitchen, street
        this.npcs = []; // Array to hold NPC data

        // Life Sim Stats
        this.stats = { time: 8 * 60, hunger: 100, hygiene: 100, health: 100, money: 500, bladder: 100 };
        this.statsTimer = 0;

        // Missions (Story Mode)
        this.currentMissionId = null;
        this.taskProgress = {}; // e.g. { "t1": true, "t2": false }
        this.completedMissions = [];
        this.questsData = null;

        // Camera System
        this.camera = { x: 0, y: 0 };
        this.mapBounds = { width: 800, height: 600 }; // Default bounds, update per room

        // Inventory System (Indices of owned items)
        this.inventory = {
            body: [0, 1, 2, 3, 4, 5], // Can always change skin
            hair: [this.characterState.hair.index],
            torso: [this.characterState.torso.index],
            legs: [this.characterState.legs.index],
            feet: [this.characterState.feet.index]
        };

        this.currentDialoguingNpcId = null;

        this.initInput();
        this.initFaceMenu();
        this.initModals();

        // Door interaction button event listener
        const btnDoorGo = document.getElementById('btn-door-go');
        if (btnDoorGo) {
            btnDoorGo.addEventListener('click', () => this.interactWithDoor());
        }

        // Handle Window Resizing
        window.addEventListener('resize', () => this.resizeCanvas());
        this.resizeCanvas(); // Initial sizing
    }

    async loadNpcData() {
        try {
            const [males, females, convos, flirts, storyNpcs] = await Promise.all([
                fetch('data/names_male.json').then(res => res.json()),
                fetch('data/names_female.json').then(res => res.json()),
                fetch('data/conversations.json').then(res => res.json()),
                fetch('data/flirts.json').then(res => res.json()),
                fetch('data/story_npcs.json').then(res => res.json()).catch(() => ({ story_npcs: [] }))
            ]);
            this.npcData = {
                names_male: males,
                names_female: females,
                conversations: convos,
                flirts: flirts,
                story_npcs: storyNpcs.story_npcs
            };
        } catch (err) {
            console.warn("Falha no fetch() devido ao CORS em file:// - Usando Fallback local de conversas e nomes.");
            this.npcData = {
                names_male: [
                    "Lucas", "Mateus", "Pedro", "Arthur", "Enzo", "Gabriel", "Miguel", "Davi",
                    "Heitor", "Bernardo", "Guilherme", "Rafael", "Nicolas", "Samuel", "Theo",
                    "João", "Thiago", "Felipe", "Diego", "Bruno", "Rodrigo", "Fernando",
                    "Ricardo", "Marcelo", "Leonardo", "Vinícius", "Eduardo", "André"
                ],
                names_female: [
                    "Sofia", "Julia", "Beatriz", "Alice", "Laura", "Manuela", "Valentina",
                    "Isabella", "Helena", "Luiza", "Lívia", "Giovanna", "Maria", "Clara",
                    "Mariana", "Ana", "Camila", "Letícia", "Amanda", "Bruna", "Carolina",
                    "Fernanda", "Patrícia", "Aline", "Juliana", "Vanessa", "Larissa", "Natália"
                ],
                flirts: {
                    "compliment": { "desc": "Dar elogio", "reqFriendship": 50, "highChance": 0.9, "lowChance": 0.4, "gain": 10, "penalty": -5, "player": ["Você tá super bem hoje! 🔥"], "positive": ["Nossa, obrigado(a) hihi (+10 Amizade) 🌸"], "negative": ["Que vergonha... (-5 Amizade) 💧"], "successFace": "smile", "failFace": "boring" },
                    "hug": { "desc": "Dar abraço", "reqFriendship": 60, "highChance": 0.8, "lowChance": 0.2, "gain": 15, "penalty": -10, "player": ["Me dá um abraço? 🤗"], "positive": ["Que abraço gostoso! (+15 Amizade) 🤗"], "negative": ["Que isso, encostando assim? (-10 Amizade) 🚫"], "successFace": "smile", "failFace": "angry" },
                    "kiss": { "desc": "Tentar beijar", "reqFriendship": 80, "highChance": 0.9, "lowChance": 0.05, "gain": 30, "penalty": -20, "player": ["Sabe o que eu queria agora? Um beijo seu... 😘"], "positive": ["O PRIMEIRO BEIJO! Foi mágico!! (+30 Amizade) 💋"], "negative": ["Sai pra lá apressadão! (-20 Amizade) 💀"], "successFace": "kissing", "failFace": "angry", "isKiss": true },
                    "elogio": { "desc": "🥰 Elogio sincero", "reqFriendship": 50, "highChance": 0.9, "lowChance": 0.4, "gain": 10, "penalty": -5, "player": ["Seu olhar é maravilhoso, sabia? 😊", "Sua vibe é simplesmente a melhor de todas! ✨", "Adorei sua roupa hoje, super estilosa! 👕"], "positive": ["Você acha mesmo? Muito obrigada! (+10 Amizade) 🌸", "Que gentil... fico até sem graça! (+10 Amizade) 🌸", "Valeu! Montei o visual com carinho hoje! (+10 Amizade) 🌸"], "negative": ["Acho que você tá exagerando... (-5 Amizade) 💧", "Hum, tá bom, obrigado(a). (-5 Amizade) 💧", "Não achei nada demais, mas ok. (-5 Amizade) 💧"], "successFace": "smile", "failFace": "boring" },
                    "brincadeira": { "desc": "😜 Brincadeira leve", "reqFriendship": 55, "highChance": 0.85, "lowChance": 0.3, "gain": 12, "penalty": -8, "player": ["Sabia que você fica bem fofo(a) quando tá com essa cara de sério(a)? 😂", "Mandei uma foto sua pro meu cachorro e ele abanou o rabo, acho que ele te aprovou! 🐶"], "positive": ["Hahaha, que bobo(a)! Mas valeu pelo elogio torto. (+12 Amizade) 😆", "Kkkk pelo menos o seu cachorro tem bom gosto! (+12 Amizade) 😆"], "negative": ["Sério? Não vi graça nesse comentário. (-8 Amizade) 🚫", "Sério que você usou um cachorro pra dar em cima de mim? (-8 Amizade) 🚫"], "successFace": "smile", "failFace": "angry" },
                    "romantico": { "desc": "🌹 Fala romântica", "reqFriendship": 70, "highChance": 0.85, "lowChance": 0.15, "gain": 20, "penalty": -15, "player": ["Não consigo parar de pensar em você... ❤️", "Sempre que meu celular toca, fico torcendo pra ser mensagem sua. 🥰"], "positive": ["Aww... eu também penso bastante em você. (+20 Amizade) 🥰", "Sério? Eu também adoro receber suas mensagens. (+20 Amizade) 🥰"], "negative": ["Acho melhor a gente não confundir as coisas agora... (-15 Amizade) 😬", "Ah, desculpa, mas eu não sinto bem o mesmo pra isso... (-15 Amizade) 😬"], "successFace": "kissing", "failFace": "sad" },
                    "ousado": { "desc": "🔥 Cantada ousada", "reqFriendship": 80, "highChance": 0.9, "lowChance": 0.05, "gain": 30, "penalty": -25, "player": ["Eu devia cobrar aluguel, porque você não sai da minha cabeça o dia todo. 🔥", "Tá afim de deixar as conversas de lado e ver no que dá a gente? 😉"], "positive": ["Essa foi direto ao ponto haha! Gostei. (+30 Amizade) 🔥", "Talvez eu esteja querendo a mesma coisa faz tempo... (+30 Amizade) 💋"], "negative": ["Nossa, que desespero é esse? Melhor esfriar a cabeça. (-25 Amizade) 💀", "Uou, muito rápido! Desse jeito não vai rolar. (-25 Amizade) 💀"], "successFace": "kissing", "failFace": "angry", "isKiss": true }
                },
                conversations: {
                    "pets": {
                        "player": [
                            "Eu vi um cachorrinho na rua hoje, tão fofo!",
                            "Você tem algum animal de estimação em casa?",
                            "Gatos são tão independentes, adoro eles.",
                            "Queria ter um aquário no meu quarto.",
                            "Acho que vou adotar um gatinho de um abrigo.",
                            "Você gosta de pássaros cantando de manhã?",
                            "Qual o seu animal favorito de todos?",
                            "Meu sonho de infância sempre foi ter um cavalo.",
                            "Você acha que os animais entendem o que a gente sente?",
                            "Tartarugas vivem muito, seria legal ter uma.",
                            "Já teve algum pet incomum, tipo um lagarto?",
                            "Queria ser voluntário em uma ONG de resgate animal.",
                            "Coelhos parecem ser tão macios, queria um.",
                            "Você costuma comemorar o aniversário dos seus pets?",
                            "Acho incrível o trabalho que os cães-guia fazem."
                        ],
                        "positive": [
                            "Ah, eu amo animais! Queria ter um zoológico.",
                            "Cachorros são os melhores amigos que alguém pode ter!",
                            "Sério? Eu passo horas vendo vídeos de gatinhos.",
                            "Sim! Meus pets são a melhor parte do meu dia.",
                            "Adotar é um ato de amor enorme, apoio totalmente!",
                            "Sim, a energia deles muda o ambiente pra melhor.",
                            "Eu amo cavalos, acho majestosos e muito inteligentes.",
                            "Deve ser uma experiência maravilhosa de conexão.",
                            "Com certeza! Acredito que eles sentem até nossa tristeza.",
                            "São ótimas companhias para a vida toda.",
                            "Nunca tive, mas acho fascinante quem cuida de répteis!",
                            "Isso é uma das atitudes mais nobres que existem.",
                            "Nossa, são fofos demais, parecem pelúcias vivas!",
                            "Sempre! Compro até bolo especial e roupinha pra eles.",
                            "Eles são verdadeiros anjos na terra, ajudam demais."
                        ],
                        "negative": [
                            "Ah... eu na verdade tenho alergia a pelos.",
                            "Sinceramente, acho que dão muito trabalho.",
                            "Prefiro plantas, não fazem bagunça.",
                            "Não sou muito fã de animais, pra ser sincero.",
                            "Eu não faria isso, o custo com veterinário é muito alto hoje em dia.",
                            "Pássaros presos em gaiolas me dão é muita agonia.",
                            "Sinceramente, não gosto de nenhum, mantenho distância.",
                            "Cavalos me dão um pouco de medo, são muito grandes.",
                            "Não viaja, eles agem apenas por instinto e fome.",
                            "Acho um animal muito monótono, não interage nada.",
                            "Morro de aflição de qualquer bicho que tenha escamas.",
                            "Não tenho paciência nem tempo pra lidar com isso.",
                            "Dizem que o cheiro deles é bem forte, não arriscaria.",
                            "Acho um exagero absurdo tratar bicho como ser humano.",
                            "É útil, mas ainda prefiro não conviver com cachorros."
                        ]
                    },
                    "cars": {
                        "player": [
                            "Viu aquele carro esportivo que passou agorinha?",
                            "Estou doido pra tirar minha carteira logo.",
                            "Prefere carros clássicos ou os mais modernos?",
                            "Estava jogando um simulador de corrida muito realista.",
                            "Você prefere carro manual ou automático?",
                            "Acho que os carros elétricos são mesmo o futuro.",
                            "Sabe trocar um pneu se precisar?",
                            "Adoro aquele cheiro característico de carro novo.",
                            "Fazer uma viagem longa dirigindo é super relaxante.",
                            "Eu queria aprender o básico de mecânica de automóveis.",
                            "O design quadrado dos carros dos anos 80 é insuperável.",
                            "Você costuma lavar e cuidar do seu próprio carro?",
                            "Carros conversíveis parecem tão divertidos no verão.",
                            "Eu gosto mais do estilo de picapes grandes.",
                            "Assistiu àquela corrida de Fórmula 1 no domingo passado?"
                        ],
                        "positive": [
                            "Nossa, sim! O ronco do motor era incrível.",
                            "Eu adoro velocidade e carros turbinados!",
                            "Clássicos sempre! Têm muito mais estilo.",
                            "Sempre leio revistas de carros nas horas vagas.",
                            "Automático é a melhor invenção para quem pega trânsito!",
                            "Com certeza, a tecnologia deles é silenciosa e fascinante.",
                            "Sei trocar sim, é uma habilidade essencial pra vida!",
                            "Cheiro de carro zero é simplesmente maravilhoso.",
                            "Pegar a estrada com música boa e janela aberta é terapia pura.",
                            "Entender de motor salva a gente de muita enrascada.",
                            "A estética retrô nos automóveis me ganha muito fácil.",
                            "Lavar o carro no fim de semana de manhã é um clássico pra mim.",
                            "Andar sentindo o vento no rosto deve ser o máximo de liberdade.",
                            "Picapes são imponentes, espaçosas e muito úteis na estrada.",
                            "Sou apaixonado por automobilismo, não perco uma corrida!"
                        ],
                        "negative": [
                            "Ah, pra mim carro é só um meio de transporte.",
                            "Sinceramente, prefiro andar de bicicleta.",
                            "Odeio trânsito, nem gosto de pensar em carros.",
                            "Não entendo nada de motor.",
                            "Tanto faz, no fim dirigir só me dá dor de cabeça.",
                            "Ainda são muito caros e difíceis de achar onde carregar.",
                            "Se furar um pneu eu sento e chamo o seguro na mesma hora.",
                            "Sinceramente, acho o cheiro de plástico de carro novo enjoativo.",
                            "Dirigir por muitas horas me dá sono e muita dor nas costas.",
                            "Mexer com graxa e óleo não é comigo, passo longe.",
                            "Carro velho só serve pra te deixar na mão no meio do caminho.",
                            "Dá uma preguiça enorme, sempre levo no lava-rápido.",
                            "Conversível na cidade é só pedir pra engolir fumaça e poeira.",
                            "Acho carro muito grande um pesadelo na hora de estacionar.",
                            "Ver um monte de carro correndo em círculos é um tédio pra mim."
                        ]
                    },
                    "humor": {
                        "player": [
                            "Sabe por que a plantinha não foi ao médico? Porque ela já estava no soro!",
                            "Vi um meme hilário hoje mais cedo.",
                            "Qual o contrário de volátil? Vemcátil!",
                            "Preciso te contar uma piada que ouvi ontem...",
                            "Você costuma assistir shows de stand-up comedy?",
                            "Eu tenho crise de riso com as coisas mais bobas às vezes.",
                            "Vídeos de pessoas tropeçando e caindo são o auge da comédia.",
                            "Você consegue entender e gostar do humor sarcástico?",
                            "Eu sofro muito para segurar o riso em horas sérias.",
                            "Para mim, trocadilhos ruins são a melhor forma de humor.",
                            "Você segue alguma página focada só em memes de animais?",
                            "Gosta de assistir aqueles programas antigos de pegadinhas?",
                            "Acho que o senso de humor é o que nos salva nos dias ruins.",
                            "Sabe fazer alguma imitação engraçada de alguém famoso?",
                            "Adoro conviver com pessoas que sabem rir de si mesmas."
                        ],
                        "positive": [
                            "Hahaha! Essa foi muito boa!",
                            "Manda o meme! Eu adoro rir na internet.",
                            "Kkkkk! Você sempre tem as melhores piadas.",
                            "Adoro seu senso de humor, alegrou meu dia!",
                            "Stand-up é bom demais, estou sempre procurando novos shows.",
                            "Eu também choro de rir com as piores bobeiras possíveis.",
                            "Cassetadas e vídeos de quedas são meu ponto fraco absoluto.",
                            "O sarcasmo refinado é genial, me faz rir muito.",
                            "Também sofro disso, a vontade de rir dobra no silêncio.",
                            "Quanto pior o trocadilho, melhor e mais engraçado ele é.",
                            "Páginas de memes são minha principal fonte de entretenimento.",
                            "Aquelas pegadinhas clássicas da TV são patrimônio do humor!",
                            "Com toda certeza do mundo, rir é o melhor remédio que existe.",
                            "Eu dou muita gargalhada quando tento imitar sotaques diferentes.",
                            "Rir dos próprios micos é sinal de muita inteligência e leveza."
                        ],
                        "negative": [
                            "Eh... não achei tanta graça assim.",
                            "Piadas não são muito o meu forte.",
                            "Nossa, que humor peculiar o seu...",
                            "Prefiro conversas mais sérias, pra ser honesto.",
                            "Acho a maioria dos stand-ups de hoje forçados e sem graça.",
                            "Por favor, me poupe dessas piadinhas de pavê.",
                            "Acho uma baita falta de empatia ficar rindo da desgraça alheia.",
                            "Odeio sarcasmo, normalmente soa apenas arrogante.",
                            "Rir em momentos de tensão me deixa muito desconfortável.",
                            "Trocadilho é, de longe, o nível mais preguiçoso de comédia.",
                            "Acho que a cultura dos memes está destruindo as conversas reais.",
                            "Pegadinhas de TV eram na maioria armadas e de péssimo gosto.",
                            "Tem muita gente brincando com coisas que deveriam ser sérias.",
                            "Eu sou uma pessoa mais contida mesmo, raramente faço graça.",
                            "Geralmente não vejo sentido na maioria dessas bobeiras."
                        ]
                    },
                    "movies": {
                        "player": [
                            "Assistiu aquele lançamento no cinema semana passada?",
                            "Qual é o seu gênero de filme favorito?",
                            "Quero muito fazer uma maratona de filmes no fim de semana.",
                            "O roteiro daquele filme indie me deixou pensando...",
                            "Gosta de filmes de terror daqueles que dão muito susto?",
                            "Na hora de assistir, você prefere áudio dublado ou legendado?",
                            "Chorei rios assistindo a um drama pesadíssimo ontem à noite.",
                            "As animações não são só para crianças, você concorda?",
                            "Qual é o seu lanche obrigatório quando vai ao cinema?",
                            "Filmes baseados em fatos e histórias reais me prendem muito.",
                            "Uma boa trilha sonora consegue salvar até um roteiro mediano.",
                            "Você tem paciência para as franquias infinitas de super-heróis?",
                            "De vez em quando gosto de colocar um filme clássico antigo.",
                            "Fico chocado em como os efeitos especiais estão realistas.",
                            "Você costuma ler críticas de cinema antes de ver algo?"
                        ],
                        "positive": [
                            "Sim! A cinematografia estava espetacular!",
                            "Eu amo cinema! Assisto quase de tudo.",
                            "Maratona? Pode me chamar que eu levo a pipoca!",
                            "Adoro discutir teorias sobre filmes de suspense.",
                            "Amo a tensão e a adrenalina de um bom filme de terror!",
                            "Legendado, sempre! A atuação original passa mais emoção.",
                            "Chorar em filme faz parte, é a magia da sétima arte.",
                            "Concordo totalmente, trazem mensagens bem adultas e profundas.",
                            "Pipoca com manteiga e um refrigerante é o combo da felicidade.",
                            "Saber que aquilo aconteceu de verdade deixa tudo fascinante.",
                            "Música boa eleva as cenas para um patamar inesquecível.",
                            "Sou fã de carteirinha, vou no primeiro dia de estreia!",
                            "Acho que clássicos carregam um charme e uma elegância únicos.",
                            "As equipes de efeitos visuais hoje em dia fazem milagres.",
                            "Sempre leio opiniões diversas, adoro analisar outras perspectivas."
                        ],
                        "negative": [
                            "Eu quase nunca assisto filmes, durmo na metade.",
                            "Acho muito tempo parado na frente da tela.",
                            "Prefiro ler um livro, sabe?",
                            "Não acompanho os lançamentos do cinema.",
                            "Detesto terror, me dá ansiedade e fico sem dormir direito.",
                            "Prefiro mil vezes dublado, tenho preguiça de ficar lendo.",
                            "Evito drama, a vida real já é deprimente o suficiente.",
                            "Não consigo levar desenho a sério, acho uma coisa meio boba.",
                            "Ir ao cinema se tornou um luxo, os preços estão absurdos.",
                            "Filme biográfico costuma ser super monótono e arrastado.",
                            "Sendo sincero, eu nem reparo na música que toca de fundo.",
                            "Já saturei totalmente, é sempre a mesma historinha de herói.",
                            "Qualquer coisa antiga e com ritmo lento me dá um sono profundo.",
                            "Excesso de efeito de computador me tira a imersão, fica falso.",
                            "Críticos de cinema em geral são elitistas e gostam de filme chato."
                        ]
                    },
                    "sports": {
                        "player": [
                            "Acompanhou o jogo ontem à noite?",
                            "Estou pensando em começar a correr no parque.",
                            "Qual esporte você acha mais difícil de praticar?",
                            "Bora jogar uma partida de futebol qualquer dia?",
                            "Você gosta de acompanhar esportes radicais e skate?",
                            "Olimpíadas é a única época que eu assisto esporte de verdade.",
                            "Já tentou praticar alguma arte marcial ou esporte de combate?",
                            "Natação é um dos esportes mais completos para o corpo.",
                            "Você frequenta academia ou treina em casa mesmo?",
                            "Estou precisando fazer yoga para melhorar minha flexibilidade.",
                            "Basquete tem um ritmo tão rápido que é legal até de assistir.",
                            "Morro de vontade de aprender a surfar.",
                            "Você acha que xadrez exige tanto treino quanto um esporte físico?",
                            "Fazer trilhas na natureza é a única atividade física que eu amo.",
                            "Acho que jogar tênis parece ser muito elegante e cansativo."
                        ],
                        "positive": [
                            "Claro! Foi uma partida emocionante de assistir.",
                            "Eu sempre me exercito de manhã, é ótimo pra saúde!",
                            "Acho que ginástica olímpica exige uma força sobre-humana.",
                            "Jogar bola? Bora! Só marcar o horário.",
                            "A adrenalina dos esportes radicais é surreal, acompanho sempre.",
                            "Amo o clima de Olimpíadas, torço até para o que não entendo.",
                            "Fiz lutas por anos, ensina muito sobre respeito e disciplina.",
                            "Amo nadar, a sensação da água alivia o estresse do dia a dia.",
                            "Sou rato de academia, manter a rotina de treinos me dá foco.",
                            "Yoga transforma a vida, traz paz de espírito e cura dores.",
                            "A dinâmica na quadra é sensacional, os lances são lindos.",
                            "Surfe e praia formam o melhor estilo de vida que existe.",
                            "Com certeza, é um esporte da mente que queima muitas calorias.",
                            "Trilha junta ar puro, natureza e exercício, é perfeito.",
                            "Tênis é incrível, exige reflexo rápido e resistência absurda."
                        ],
                        "negative": [
                            "Não vi não. Não ligo muito pra esportes.",
                            "Eu sou meio sedentário, pra ser honesto.",
                            "Não sei avaliar, sou ruim em absolutamente todos.",
                            "Esportes nunca foram o meu forte.",
                            "Tenho muito medo de altura, radical pra mim é ficar no sofá.",
                            "Acho um saco, as emissoras só falam disso o mês inteiro.",
                            "Luta é muito violento, não vejo sentido em levar soco de graça.",
                            "Detesto o cheiro de cloro na pele e no cabelo depois da piscina.",
                            "Odeio o clima de academia, cheio de espelhos e gente competitiva.",
                            "Yoga exige uma paciência que eu não tenho, fico entediado.",
                            "Não tenho a menor coordenação nem altura pra arremessar uma bola.",
                            "Morro de medo do mar aberto e das ondas, passo longe.",
                            "Ficar horas sentado encarando um tabuleiro dá um sono terrível.",
                            "Trilha pra mim significa só lama e insetos, prefiro a cidade.",
                            "Acho o ambiente do tênis muito de elite e a pontuação confusa."
                        ]
                    },
                    "music": {
                        "player": [
                            "Você já ouviu a música nova que está tocando em todo lugar?",
                            "Qual instrumento você gostaria de saber tocar?",
                            "Não consigo viver sem meus fones de ouvido.",
                            "Fui num show inesquecível ano passado...",
                            "O que você prefere para relaxar: rock clássico ou MPB?",
                            "Música eletrônica é a melhor coisa para animar uma festa.",
                            "Ainda faz sentido comprar discos de vinil na era do streaming?",
                            "Você é do tipo que faz performances cantando no chuveiro?",
                            "Bora em um bar com karaokê no fim de semana?",
                            "Gosta de ir a grandes festivais com vários palcos?",
                            "Costumo escutar música clássica ou instrumental quando preciso focar.",
                            "A cultura e as letras do rap me inspiram bastante.",
                            "Uma roda de samba tem uma energia que nenhuma outra festa tem.",
                            "Sertanejo raiz e um violão formam a melhor trilha para um churrasco.",
                            "Para viagens de carro, eu prefiro colocar playlists de reggae."
                        ],
                        "positive": [
                            "Sim! Tá no repeat na minha playlist o dia todo.",
                            "Ahh eu adoraria tocar violão ou teclado.",
                            "Música é a trilha sonora da minha vida!",
                            "Shows ao vivo têm uma energia mágica, né?",
                            "MPB no volume baixinho me traz uma paz absurda.",
                            "As batidas da eletrônica fazem a gente querer pular até de manhã.",
                            "O vinil tem um som analógico e um chiadinho super aconchegante.",
                            "Meu banheiro vira o palco de um grande show todo dia!",
                            "Karaokê é parada obrigatória, já vou separando meu repertório.",
                            "Festivais são experiências de vida únicas e inesquecíveis.",
                            "Música instrumental ajuda demais a manter a mente concentrada.",
                            "Rap é poesia pura, as rimas carregam muita verdade social.",
                            "O batuque do samba balança o coração e anima qualquer um.",
                            "A viola tocando dá um clima aconchegante e familiar demais.",
                            "As melodias do reggae trazem a calmaria que a estrada pede."
                        ],
                        "negative": [
                            "Normalmente, eu prefiro escutar podcasts.",
                            "Não tenho talento pra isso, mal sei bater palma no ritmo.",
                            "Acho barulho alto um pouco irritante.",
                            "Música pra mim é só som de fundo...",
                            "Acho rock muito pesado e MPB muito devagar, não gosto.",
                            "Parece um martelo batendo na cabeça, muito repetitivo.",
                            "Colecionar vinil hoje em dia é só uma moda cara e pouco prática.",
                            "Eu evito cantar até sozinho de tão ruim que é a minha voz.",
                            "Cantar no microfone me dá vergonha alheia, não subo num palco.",
                            "Odeio a aglomeração, o cansaço e a sujeira desses eventos.",
                            "Música sem vocal não me prende, orquestras me dão sono.",
                            "Infelizmente, tenho muita dificuldade de acompanhar o ritmo acelerado.",
                            "Muito pandeiro e agitação num lugar só me deixam um pouco surdo.",
                            "Sertanejo só me deixa deprimido, não acho muito divertido.",
                            "Acho um estilo muito monótono para ouvir por muito tempo."
                        ]
                    },
                    "art": {
                        "player": [
                            "Você já foi na nova exposição do museu do centro?",
                            "Comprei umas tintas novas pra tentar pintar.",
                            "Acho incrível como a arte consegue expressar sentimentos.",
                            "Estava desenhando uns sprites em pixel art para um projeto hoje.",
                            "Para você, grafite e pintura de rua contam como arte legítima?",
                            "Obras do período renascentista têm detalhes muito realistas.",
                            "Costuma ir a teatros para assistir peças ou musicais?",
                            "Fotografia é minha maneira de congelar bons momentos da vida.",
                            "Você consegue encontrar sentido e emoção na arte abstrata?",
                            "Comecei a dobrar papéis e aprender origamis pra desestressar.",
                            "Tatuagem é carregar uma galeria de arte no próprio corpo.",
                            "Amo passear e garimpar coisas em feiras de artesanato.",
                            "Pintura em aquarela parece tão suave, mas deve ser super difícil.",
                            "Você gosta de visitar catedrais antigas só pela arquitetura?",
                            "Gosto de olhar fotografias e ilustrações no tempo livre."
                        ],
                        "positive": [
                            "Eu amo arte! Quero muito visitar essa galeria.",
                            "Que legal! Pintar é super relaxante.",
                            "Totalmente, a arte inspira a alma.",
                            "Que incrível! Criar personagens em pixel art exige muita criatividade.",
                            "Com certeza, o grafite traz vida, cor e protesto para muros cinzas.",
                            "O talento que os pintores clássicos tinham com luz é invejável.",
                            "O teatro tem uma energia crua que o cinema não consegue replicar.",
                            "Compor uma boa foto requer um olhar muito sensível para o mundo.",
                            "Deixar a mente livre pra interpretar o abstrato é um ótimo exercício.",
                            "A delicadeza do papel dobrado exige um foco terapêutico lindo.",
                            "O corpo humano se torna uma tela em branco para eternizar histórias.",
                            "Apoiar os artesãos valoriza muito a cultura da nossa região.",
                            "A água espalhando o pigmento no papel cria um efeito mágico.",
                            "A arquitetura e os vitrais históricos são de tirar o fôlego mesmo.",
                            "Também passo horas vendo portfólios de desenho online!"
                        ],
                        "negative": [
                            "Sendo sincero, não entendo muito de arte moderna.",
                            "Sou péssimo desenhando, nem palito sai direito.",
                            "Acho galerias de arte um pouco entediantes.",
                            "Não entendo muito de arte digital, acho meio sem graça.",
                            "Na maioria das vezes acho que pixo e grafite só poluem o visual.",
                            "Arte muito antiga costuma ter temas religiosos demais para mim.",
                            "Os ingressos de teatro costumam ser super caros e as poltronas apertadas.",
                            "Foto de celular já cumpre o papel, não vejo necessidade de ir além.",
                            "Abstrato pra mim muitas vezes parece que alguém só jogou tinta numa tela.",
                            "Não tenho o mínimo de paciência ou destreza motora pra dobrar papel.",
                            "Riscar a pele com agulha pra sempre me dá arrependimento só de pensar.",
                            "Essas feiras costumam estar lotadas e as coisas são caras demais.",
                            "Aquarela mancha tudo com muita facilidade, me deixa frustrado.",
                            "Acho lugares muito antigos com cheiro de mofo e energia pesada.",
                            "Prefiro coisas mais lógicas e matemáticas."
                        ]
                    },
                    "cooking": {
                        "player": [
                            "Testei uma receita nova de macarrão ontem que ficou divina.",
                            "Qual é o seu prato favorito de comer (e fazer)?",
                            "Acho cozinhar uma terapia muito boa.",
                            "Você é do time dos doces ou dos salgados?",
                            "Gosta da culinária japonesa e de comer peixe cru?",
                            "Fazer um churrasco no domingo é a melhor tradição brasileira.",
                            "O cheiro de um bolo assando deixa a casa com clima de infância.",
                            "Estou tentando aprender mais receitas de pratos vegetarianos.",
                            "Seu paladar aguenta comidas cheias de pimenta?",
                            "Fazer pão caseiro do zero exige tempo, mas vale cada mordida.",
                            "Massas e culinária italiana costumam ser o forte de muita gente.",
                            "Gosta de arriscar no preparo de pratos com frutos do mar?",
                            "Cá entre nós, comer um fast food gorduroso de vez em quando salva.",
                            "Acho que a comida tem o poder de preservar as memórias de família.",
                            "Você costuma seguir as receitas à risca ou improvisa na panela?"
                        ],
                        "positive": [
                            "Que delícia! Eu adoro passar um tempo na cozinha.",
                            "Massa! Eu faço um bolo que todo mundo elogia.",
                            "Cozinhar é misturar ingredientes com muito amor.",
                            "Sou formiga! Um doce resolve metade dos meus problemas.",
                            "Sushi e sashimi fresquinhos são minha fraqueza e paixão absoluta.",
                            "O clima de assar uma carne conversando com amigos não tem preço.",
                            "Sempre assisto programas de culinária para pegar dicas!",
                            "Uma refeição sem carne pode ser super leve, saborosa e criativa.",
                            "Eu amo ardência, pimenta dá vida pra qualquer ensopado.",
                            "Sovar a massa com as mãos é cansativo, mas o resultado é maravilhoso.",
                            "Dificilmente alguém resiste a um bom molho rústico e muito queijo.",
                            "Um prato com camarão e temperos frescos é sinônimo de almoço chique.",
                            "Um hambúrguer e muita batata frita curam qualquer tristeza.",
                            "Aquele sabor do almoço de vó é insuperável, tento manter a tradição.",
                            "Eu adoro improvisar e testar temperos novos, a cozinha é um laboratório."
                        ],
                        "negative": [
                            "Sinceramente, meu talento é queimar até a água.",
                            "Eu prefiro pedir comida do que preparar.",
                            "Acho cozinhar uma perda de tempo total.",
                            "Só uso o micro-ondas pra tudo, facilita muito.",
                            "A textura do peixe cru me embrulha o estômago, fujo disso.",
                            "Fumaça e cheiro de gordura impregnados na roupa me irritam.",
                            "O problema de fazer doces em casa é lavar a louça cheia de caramelo.",
                            "Eu acho que uma refeição principal precisa ter algum tipo de carne.",
                            "Pimenta rouba todo o sabor da comida e só serve pra queimar a boca.",
                            "A bagunça de farinha que fica na bancada me desanima logo de cara.",
                            "Evito comer massas pesadas à noite, o estômago fica estufado demais.",
                            "Sou bastante alérgico, o cheiro de maresia na comida me afasta.",
                            "Fast food faz um mal danado pra saúde, prefiro as marmitas que eu faço.",
                            "Na minha família, todo prato acaba virando uma gororoba sem gosto.",
                            "Se eu não seguir as medidas exatas, o prato vira um desastre completo."
                        ]
                    },
                    "gaming": {
                        "player": [
                            "Você joga nos consoles ou prefere PC?",
                            "Aquele novo RPG de mundo aberto está engolindo minhas horas.",
                            "Bora jogar uma partida online mais tarde?",
                            "Gosto muito da história e dos gráficos dos jogos atuais.",
                            "Você prefere criar personagens de RPG de mesa ou só joga eletrônicos?",
                            "Jogos que exploram o folclore e lendas locais me chamam muita atenção.",
                            "Acho que a realidade virtual vai dominar completamente a indústria em breve.",
                            "Jogos de celular são ótimos para matar o tempo no transporte público.",
                            "Tomar uns sustos jogando um survival horror de madrugada é tenso.",
                            "Fico relaxado só de plantar e colher em simuladores de fazendinha.",
                            "A agilidade que jogos de tiro em primeira pessoa exigem é loucura.",
                            "Ficar travado tentando resolver puzzles no cenário é minha sina.",
                            "Eu destruo meus botões nos combos de jogos de luta.",
                            "Amo reunir o pessoal em casa para abrir um jogo de tabuleiro moderno.",
                            "Você liga para platinar jogos ou só zera a campanha e abandona?"
                        ],
                        "positive": [
                            "Eu amo videogames! Sou muito competitivo online.",
                            "Nossa, eu já devo ter umas 100 horas nesse RPG fácil fácil.",
                            "Bora jogar sim! Vou te mandar meu nick lá.",
                            "Level design é uma arte. Eu adoro explorar mundos virtuais.",
                            "Mesa com amigos é incrível, rolar os dados traz muita emoção.",
                            "Demais! Adoro ver criaturas como o Saci e a Mula sem Cabeça ganhando vida.",
                            "A imersão do VR é absurda, você realmente se sente dentro da tela.",
                            "A portabilidade salva a gente, sempre tenho uns passatempos no bolso.",
                            "O coração acelerado e a tensão de se esconder dão muita emoção.",
                            "Cuidar dos bichinhos e regar plantações me desliga da rotina.",
                            "O reflexo e a precisão das miras dão uma sensação de recompensa muito boa.",
                            "A sensação de destravar uma porta depois de muito pensar vale a pena.",
                            "Eu decoro os golpes especiais de todo mundo, é pura adrenalina.",
                            "Colocar cartas e miniaturas numa mesa com pizza é um sábado perfeito.",
                            "Eu sou caçador de troféus, revirei o mapa até platinar tudo!"
                        ],
                        "negative": [
                            "Eu não tenho muita paciência pra videogames.",
                            "Acho que jogos eletrônicos tomam muito do dia.",
                            "Nunca fui muito de ficar na frente da tela jogando.",
                            "Prefiro jogos de tabuleiro analógicos, sabe?",
                            "Acho complexo demais montar fichas e decorar centenas de regras de manuais.",
                            "Não muito, geralmente prefiro histórias focadas em mitologias nórdicas ou gregas.",
                            "Colocar aqueles óculos pesados na cara me dá muita tontura e enjoo.",
                            "A maioria do mercado mobile é cheia de anúncios ou te obriga a pagar para vencer.",
                            "Tenho problemas de estresse, não vou tomar susto de propósito!",
                            "Eu fujo de jogos que se parecem muito com trabalho duro ou rotina chata.",
                            "A comunidade online de jogos de tiro costuma ser extremamente tóxica.",
                            "Ficar preso num puzzle quebra o ritmo, eu acabo olhando tutoriais na internet.",
                            "Macetar botões à toa acaba estragando os controles que hoje custam uma fortuna.",
                            "Ler manuais infinitos pra brincar no papel afasta qualquer vontade minha de jogar.",
                            "Quando sobe os créditos finais eu desinstalo na mesma hora, não tenho paciência."
                        ]
                    },
                    "books": {
                        "player": [
                            "Estou lendo um livro de ficção científica fantástico.",
                            "O que você prefere: ler no papel ou no kindle?",
                            "A narrativa daquele autor te prende logo nas primeiras páginas.",
                            "Tem alguma indicação de leitura boa pra me passar?",
                            "Você liga para astrologia? Estava lendo sobre os signos.",
                            "A poesia consegue dizer tanta coisa usando tão poucas palavras, né?",
                            "Você acha que os livros de autoajuda e negócios realmente funcionam?",
                            "Gosto de ler biografias para entender a cabeça de pessoas geniais.",
                            "Tentar descobrir quem é o assassino em romances policiais me vicia.",
                            "Muitos quadrinhos e mangás trazem roteiros brilhantes.",
                            "Costuma escutar audiobooks enquanto faz as tarefas domésticas?",
                            "Participar de um clube de leitura é uma ótima forma de se forçar a ler.",
                            "As vezes eu só preciso de um romance fofinho e clichê pra descansar a mente.",
                            "Você usa marcadores bonitinhos ou tem coragem de dobrar a ponta da folha?",
                            "Ler dentro de carros e ônibus ajuda a matar o tempo no trânsito."
                        ],
                        "positive": [
                            "Que legal! Eu devoro livros, adoro ler.",
                            "Prefiro o cheiro das páginas dos livros físicos antigos.",
                            "Sempre que começo um livro eu não consigo parar!",
                            "Tenho uma lista enorme de sugestões pra te dar!",
                            "Sim! Acho o estudo dos astros super interessante e conectado.",
                            "Os versos tocam num lugar da alma que os textos corridos não conseguem.",
                            "Textos sobre hábitos e disciplina me tiram do sofá, acho motivadores.",
                            "Aprender com os erros e acertos de pessoas históricas é enriquecedor.",
                            "Juntar as pistas e suspeitar de todo mundo é a melhor dinâmica do suspense.",
                            "A arte dos desenhistas dá muito peso e fluidez para a ação na página.",
                            "As vozes dos narradores são ótimas pra otimizar o tempo limpando a casa.",
                            "Os debates em grupos me fazem enxergar a história com outros olhos.",
                            "É um conforto quentinho pro coração ler histórias previsíveis e felizes.",
                            "Tenho um ciúme enorme com meus livros, cuido da capa e guardo com cuidado.",
                            "Andar com um livrinho na mochila é o segredo pra não surtar em filas."
                        ],
                        "negative": [
                            "Ah, eu tenho muita preguiça de ler livros grandes.",
                            "Chego no segundo capítulo e já me dá sono.",
                            "Prefiro ver o filme quando lançar a adaptação.",
                            "Não tenho paciência pra ler ultimamente.",
                            "Acho tudo isso de signos uma grande bobagem, não acredito.",
                            "Raramente entendo as metáforas, me sinto lendo charadas complicadas.",
                            "A maioria dessas autoajudas é cheia de frases de efeito vazias.",
                            "Não tenho muito interesse em fofocas antigas de quem já morreu.",
                            "Crimes sangrentos acabam me dando ansiedade ao invés de relaxar.",
                            "Gibi na minha cabeça ainda está associado a revistinha infantil.",
                            "Não consigo focar, e o tom das narrações costuma me fazer dormir.",
                            "Odeio a ideia de ter um cronograma com metas sobre a leitura por hobby.",
                            "O excesso de açúcar em algumas tramas revira meu estômago de tão irreal.",
                            "Eu dobro a folha, quebro a lombada e risco de caneta mesmo.",
                            "Se eu bater o olho numa página com o veículo em movimento, fico tonto."
                        ]
                    },
                    "tech": {
                        "player": [
                            "Viu a nova inteligência artificial que lançaram?",
                            "Gosto de montar computadores e mexer com hardware.",
                            "Estou aprendendo a programar, acho super interessante.",
                            "A tecnologia avança num ritmo assustador.",
                            "Você acha que automações residenciais valem o investimento?",
                            "As redes sociais mudaram drasticamente a forma como lidamos com os outros.",
                            "Você já tentou investir em criptomoedas ou moedas digitais?",
                            "Eu sinto a necessidade de trocar de celular a cada novo lançamento.",
                            "Você se preocupa com a coleta e o rastreio dos seus dados privados?",
                            "Confia nos recursos de carros que dirigem sozinhos?",
                            "A impressão 3D abriu as portas para muitos inventores.",
                            "Você usa relógios inteligentes para checar notificações e batimentos?",
                            "Vídeos feitos no alto usando drones sempre entregam uma qualidade de cinema.",
                            "Amo a ideia de ter robôs aspiradores trabalhando na limpeza da casa.",
                            "Às vezes eu compro uns gadgets modernos mesmo sabendo que não vou usar tanto."
                        ],
                        "positive": [
                            "Eu acho incrível! Estou sempre lendo sobre novas tecnologias.",
                            "Montar PC é montar um quebra-cabeças muito caro e legal.",
                            "Nossa, eu programaria o dia inteiro se pudesse!",
                            "Adotar as inovações tecnológicas facilita demais a vida!",
                            "Apagar a luz da cama falando com um assistente virtual é o futuro.",
                            "Com as comunidades virtuais, a gente consegue conversar com o globo inteiro.",
                            "Estudar o mercado financeiro do futuro e as carteiras virtuais é importante.",
                            "Tirar o plástico de um eletrônico de última geração é satisfatório demais.",
                            "Uso protocolos de segurança pesados e VPNs para manter minha identidade blindada.",
                            "Poder descansar no banco de um carro inteligente vai evitar muitos acidentes.",
                            "Ter a liberdade de materializar peças em casa é absolutamente genial.",
                            "Esses smartwatches são essenciais, ajudam a cuidar da saúde sem falhas.",
                            "Pilotar equipamentos voadores e registrar imagens bonitas é meu hobby.",
                            "A limpeza automatizada tira um peso enorme das minhas costas na rotina.",
                            "Ter um ecossistema com tudo conectado transforma a casa num lar do futuro."
                        ],
                        "negative": [
                            "Sinceramente, acho que a tecnologia vai dominar o mundo...",
                            "Me perco com tantos aplicativos novos.",
                            "Essa coisa toda de tela e chip me dá dor de cabeça.",
                            "Prefiro um estilo de vida mais desconectado.",
                            "Tenho um certo pânico da ideia de microfones gravando minhas conversas em casa.",
                            "As pessoas estão ficando deprimidas comparando vidas falsas o tempo todo.",
                            "Essas moedas invisíveis me soam muito como um golpe moderno.",
                            "Trocar um bom aparelho só pelo design é puro desperdício capitalista.",
                            "Eu já aceitei a derrota, não existe mais privacidade no mundo de hoje.",
                            "Jamais deixaria um software tomar decisões sozinho numa estrada a 100 por hora.",
                            "A maioria das pessoas faz apenas estátuas inúteis, muito dinheiro gasto à toa.",
                            "Ficar com um negócio vibrando grudado no braço o dia inteiro é exaustivo.",
                            "O barulho agudo de mosquito que esses drones fazem no céu tira a paz.",
                            "Aquelas maquininhas sempre acabam presas nas cadeiras ou enrolando nos tapetes.",
                            "O pior da modernidade é depender de ter uma tomada por perto a cada duas horas."
                        ]
                    },
                    "travel": {
                        "player": [
                            "Meu sonho é fazer um mochilão pela Europa.",
                            "Qual foi o lugar mais memorável que você já viajou?",
                            "Adoro conhecer novas culturas e provar comidas locais.",
                            "Estava vendo passagens, viajar é o melhor investimento.",
                            "Você tem o costume de se hospedar em hostels dividindo quarto?",
                            "Acha que acampar na natureza vale mais a pena que um hotel?",
                            "Prefere explorar o interior e litorais do Brasil ou fazer voos internacionais?",
                            "Cruzeiros em alto mar parecem roteiros super divertidos.",
                            "Tenho muita vontade de fazer aquelas viagens panorâmicas de trem.",
                            "Geralmente você prefere roteiros detalhados ou viaja improvisando?",
                            "Já teve a coragem de arrumar as malas e embarcar completamente sozinho?",
                            "Lugares onde cai neve e faz muito frio são os destinos mais elegantes.",
                            "Gosto muito do turismo ecológico, procurar trilhas e cachoeiras.",
                            "Turismo para visitar museus históricos e construções antigas é seu estilo?",
                            "Na hora do aeroporto, viaja despachando malas pesadas ou apenas uma mochila?"
                        ],
                        "positive": [
                            "Eu também! Quero conhecer o mundo inteiro.",
                            "Viajar me abre a cabeça para novas perspectivas.",
                            "Ah, praia, campo ou montanha, se tem viagem eu tô dentro!",
                            "Adoraria planejar uma Road Trip com os amigos.",
                            "Ficar em hostel rende as amizades de viagem mais improváveis e sinceras.",
                            "Montar a barraca, acender uma fogueira e ver as estrelas limpas é maravilhoso.",
                            "Bater o passaporte pela primeira vez e ver outro idioma é pura emoção.",
                            "Os navios e as festas à noite lá no deck parecem uma cidade flutuante.",
                            "A lentidão e os cenários pela janela transformam o passeio numa poesia.",
                            "Caminhar sem mapa esbarrando em cantos inexplorados da cidade não tem preço.",
                            "Andar no seu próprio fuso horário ensina o maior nível de liberdade.",
                            "Colocar casacos grandes e tentar esquiar parece ser surreal e mágico.",
                            "Lavar a alma nas águas geladas das cachoeiras limpa todas as preocupações.",
                            "Ouvir as lendas nas ruínas faz a história ganhar vida na nossa frente.",
                            "Eu arrumo um monte de roupas extras na bolsa pra garantir que não vai faltar nada."
                        ],
                        "negative": [
                            "Ah, eu tenho um pouco de medo de avião...",
                            "Sinceramente, odeio fazer malas e a confusão dos aeroportos.",
                            "Acho viajar muito cansativo, prefiro ficar em casa.",
                            "Não vejo muita graça em sair da rotina, é estressante.",
                            "Dormir no beliche ouvindo barulho de outras pessoas roncando é terrível.",
                            "Para mim acampamento é sinônimo de mosquito, banheiro ruim e goteira.",
                            "A cotação atual da moeda no exterior tirou qualquer ânimo meu de viajar.",
                            "Passar a semana preso numa caixa de metal sentindo náusea de maresia não rola.",
                            "A velocidade é devagar demais, eu quero chegar ao destino o mais rápido possível.",
                            "Eu fico hiper ansioso e não consigo relaxar se as coisas não estiverem agendadas.",
                            "Almoçar em um país sem conhecer ninguém na mesa me deixaria melancólico.",
                            "Lidar com o frio cortante, derrapando e congelando as mãos é horrível pra mim.",
                            "Acho perigoso andar em pedras escorregadias e a água costuma estar congelante.",
                            "Olhar para estátuas paradas de pedra num ambiente antigo ataca muito o meu tédio.",
                            "Arrastar rodinhas na calçada acaba com meu braço, viajo de forma minimalista."
                        ]
                    }
                },
                story_npcs: [
                    {
                        "id": "mentor",
                        "name": "Mentor",
                        "gender": "male",
                        "orientation": "heterosexual",
                        "friendship": 50,
                        "romanced": false,
                        "recentTopics": [],
                        "contactAdded": true,
                        "interests": ["books", "travel", "humor"],
                        "isPaused": false,
                        "x": -100,
                        "y": 500,
                        "speed": 0,
                        "direction": 0,
                        "frame": 0,
                        "animTimer": 0,
                        "face": { "pendingType": null, "isAnimating": false, "currentFrame": 0, "type": "smile", "cycles": 0 },
                        "chatBubble": null,
                        "state": {
                            "skinColor": "#8d5524",
                            "body": { "index": 0, "color": null },
                            "hair": { "index": 3, "color": "#2c3e50" },
                            "torso": { "index": 5, "color": "#f39c12" },
                            "legs": { "index": 1, "color": "#34495e" },
                            "feet": { "index": 2, "color": "#000000" }
                        }
                    },
                    {
                        "id": "npc_ze",
                        "name": "Seu Zé",
                        "gender": "male",
                        "orientation": "heterosexual",
                        "friendship": 0,
                        "romanced": false,
                        "recentTopics": [],
                        "contactAdded": false,
                        "interests": ["cooking", "sports", "money"],
                        "isPaused": true,
                        "x": 400,
                        "y": 480,
                        "speed": 0,
                        "direction": 0,
                        "frame": 0,
                        "animTimer": 0,
                        "face": { "pendingType": null, "isAnimating": false, "currentFrame": 0, "type": "static", "cycles": 0 },
                        "chatBubble": null,
                        "state": {
                            "skinColor": "#f1c27d",
                            "body": { "index": 0, "color": null },
                            "hair": { "index": 5, "color": "#7f8c8d" },
                            "torso": { "index": 2, "color": "#ecf0f1" },
                            "legs": { "index": 0, "color": "#2c3e50" },
                            "feet": { "index": 0, "color": "#333333" }
                        }
                    },
                    {
                        "id": "npc_landlord",
                        "name": "Dona Odete",
                        "gender": "female",
                        "orientation": "heterosexual",
                        "friendship": -10,
                        "romanced": false,
                        "recentTopics": [],
                        "contactAdded": false,
                        "interests": ["money", "rules", "cleaning"],
                        "isPaused": true,
                        "x": 200,
                        "y": 480,
                        "speed": 0,
                        "direction": 0,
                        "frame": 0,
                        "animTimer": 0,
                        "face": { "pendingType": null, "isAnimating": false, "currentFrame": 0, "type": "angry", "cycles": 0 },
                        "chatBubble": null,
                        "state": {
                            "skinColor": "#e0ac69",
                            "body": { "index": 1, "color": null },
                            "hair": { "index": 4, "color": "#e0e0e0" },
                            "torso": { "index": 8, "color": "#8e44ad" },
                            "legs": { "index": 3, "color": "#000000" },
                            "feet": { "index": 1, "color": "#000000" }
                        }
                    }
                ]
            };
        }
    }

    resizeCanvas() {
        const parent = this.canvas.parentElement;
        if (parent) {
            this.canvas.width = parent.clientWidth;
            this.canvas.height = parent.clientHeight;
        }
    }

    initInput() {
        window.addEventListener('keydown', (e) => {
            if (this.game.currentScreen === 'game-screen') {
                switch (e.key) {
                    case 'o':
                    case 'O':
                        // Prevent key repeat
                        if (!this.keys.o) {
                            this.toggleMenu();
                            this.keys.o = true;
                        }
                        break;
                    case 'p':
                    case 'P':
                        // Prevent key repeat
                        if (!this.keys.p) {
                            this.toggleProfileModal();
                            this.keys.p = true;
                        }
                        break;
                    case 't':
                    case 'T':
                        // Prevent key repeat
                        if (!this.keys.t) {
                            this.toggleSmartphoneModal();
                            this.keys.t = true;
                        }
                        break;
                    case 'Enter':
                        if (!this.keys.Enter) {
                            if (this.phoneState.isOpen) {
                                this.handlePhoneEnter();
                                e.preventDefault();
                            } else if (this.dialogueState && this.dialogueState.isOpen) {
                                if (['chat_player_speaking', 'chat_npc_speaking', 'flirt_result'].includes(this.dialogueState.phase)) {
                                    this.advanceDialoguePhase();
                                } else {
                                    this.executeDialogueChoice();
                                }
                                e.preventDefault();
                            } else if (this.isMenuOpen) {
                                if (this.faceOptions.length > 0) {
                                    this.playFaceAnimation(this.faceOptions[this.selectedFaceIndex]);
                                    this.toggleMenu();
                                }
                            } else if (this.nearDoor) {
                                this.interactWithDoor();
                            }
                            this.keys.Enter = true; // Keep Enter key state
                        }
                        break;
                    case 'Escape':
                        if (this.phoneState.isOpen) {
                            this.toggleSmartphoneModal(); // Close phone
                        } else if (this.dialogueState && this.dialogueState.isOpen && this.dialogueState.node === 'root') {
                            this.closeNpcDialogue(); // Optionally allow closing dialogue with Esc
                        }
                        break;
                    case 'Backspace':
                        if (this.phoneState.isOpen) {
                            this.handlePhoneBack();
                        }
                        break;
                    case 'ArrowRight':
                        if (this.phoneState.isOpen) {
                            this.movePhoneSelection(1, 0);
                            e.preventDefault();
                        } else if (this.dialogueState && this.dialogueState.isOpen) {
                            this.moveDialogueSelection(1);
                            e.preventDefault();
                        } else if (this.isMenuOpen) {
                            this.moveMenuSelection(1);
                            e.preventDefault();
                        } else if (this.keys.hasOwnProperty(e.key)) {
                            this.keys[e.key] = true;
                        }
                        break;
                    case 'ArrowLeft':
                        if (this.phoneState.isOpen) {
                            this.movePhoneSelection(-1, 0);
                            e.preventDefault();
                        } else if (this.dialogueState && this.dialogueState.isOpen) {
                            this.moveDialogueSelection(-1);
                            e.preventDefault();
                        } else if (this.isMenuOpen) {
                            this.moveMenuSelection(-1);
                            e.preventDefault();
                        } else if (this.keys.hasOwnProperty(e.key)) {
                            this.keys[e.key] = true;
                        }
                        break;
                    case 'ArrowUp':
                        if (this.phoneState.isOpen) {
                            this.movePhoneSelection(0, -1);
                            e.preventDefault();
                        } else if (this.dialogueState && this.dialogueState.isOpen) {
                            this.moveDialogueSelection(-1);
                            e.preventDefault();
                        } else if (this.isMenuOpen) {
                            this.moveMenuSelection(-3); // Approximating grid up
                            e.preventDefault();
                        } else if (this.keys.hasOwnProperty(e.key)) {
                            this.keys[e.key] = true;
                        }
                        break;
                    case 'ArrowDown':
                        if (this.phoneState.isOpen) {
                            this.movePhoneSelection(0, 1);
                            e.preventDefault();
                        } else if (this.dialogueState && this.dialogueState.isOpen) {
                            this.moveDialogueSelection(1);
                            e.preventDefault();
                        } else if (this.isMenuOpen) {
                            this.moveMenuSelection(3); // Approximating grid down
                            e.preventDefault();
                        } else if (this.keys.hasOwnProperty(e.key)) {
                            this.keys[e.key] = true;
                        }
                        break;
                    default:
                        if (this.keys.hasOwnProperty(e.key)) {
                            this.keys[e.key] = true;
                        }
                        break;
                }
            }
        });

        window.addEventListener('keyup', (e) => {
            if (this.game.currentScreen === 'game-screen') {
                if (e.key === 'o' || e.key === 'O') {
                    this.keys.o = false;
                } else if (e.key === 'p' || e.key === 'P') {
                    this.keys.p = false;
                } else if (e.key === 't' || e.key === 'T') {
                    this.keys.t = false;
                } else if (e.key === 'Enter') {
                    this.keys.Enter = false;
                } else if (this.keys.hasOwnProperty(e.key)) {
                    this.keys[e.key] = false;
                }
            }
        });
    }

    initFaceMenu() {
        const menu = document.getElementById('game-face-menu');
        if (!menu) return;

        this.faceButtons = Array.from(document.querySelectorAll('.btn-game-face'));
        this.faceOptions = this.faceButtons.map(btn => btn.dataset.face);

        // Populate button text with emojis
        this.faceButtons.forEach((btn, index) => {
            const faceType = this.faceOptions[index];
            if (this.emojis && this.emojis[faceType]) {
                btn.innerText = this.emojis[faceType];
            }

            btn.addEventListener('click', (e) => {
                const type = e.target.dataset.face;
                this.playFaceAnimation(type);
                this.toggleMenu(); // Close after picking
            });
        });
    }

    moveMenuSelection(dir) {
        if (!this.faceOptions || this.faceOptions.length === 0) return;
        this.selectedFaceIndex = (this.selectedFaceIndex + dir + this.faceOptions.length) % this.faceOptions.length;
        this.updateMenuHighlight();
    }

    updateMenuHighlight() {
        if (!this.faceButtons) return;
        this.faceButtons.forEach((btn, index) => {
            if (index === this.selectedFaceIndex) {
                btn.style.boxShadow = '0 0 0 2px #fff';
                btn.style.transform = 'scale(1.3)';
                btn.style.zIndex = '2';
            } else {
                btn.style.boxShadow = 'none';
                btn.style.transform = 'scale(1)';
                btn.style.zIndex = '1';
            }
        });
    }

    initModals() {
        const closeStore = document.getElementById('btn-close-store');
        const closeWardrobe = document.getElementById('btn-close-wardrobe');

        if (closeStore) {
            closeStore.addEventListener('click', () => {
                document.getElementById('store-modal').style.display = 'none';
                this.isMenuOpen = false;
                this.keys.Enter = false; // Prevent immediate reopening
            });
        }
        if (closeWardrobe) {
            closeWardrobe.addEventListener('click', () => {
                document.getElementById('wardrobe-modal').style.display = 'none';
                this.isMenuOpen = false;
                this.keys.Enter = false;
            });
        }

        const btnProfileHUD = document.getElementById('btn-profile');
        if (btnProfileHUD) btnProfileHUD.addEventListener('click', () => this.toggleProfileModal());

        const btnCloseProfile = document.getElementById('btn-close-profile');
        if (btnCloseProfile) btnCloseProfile.addEventListener('click', () => this.toggleProfileModal(false));

        // Smartphone HUD Button
        const btnSmartphoneHUD = document.getElementById('btn-smartphone');
        if (btnSmartphoneHUD) btnSmartphoneHUD.addEventListener('click', () => this.toggleSmartphoneModal());

        // Close OS Modals
        const btnCloseSmartphone = document.getElementById('btn-close-smartphone');
        if (btnCloseSmartphone) btnCloseSmartphone.addEventListener('click', () => this.toggleSmartphoneModal(false));

        const btnCloseComputer = document.getElementById('btn-close-computer');
        if (btnCloseComputer) btnCloseComputer.addEventListener('click', () => this.toggleComputerModal(false));

        // NPC Dialogue Modals
        const btnCloseNpc = document.getElementById('btn-npc-close');
        if (btnCloseNpc) btnCloseNpc.addEventListener('click', () => this.closeNpcDialogue());

        const btnAddContactNpc = document.getElementById('btn-npc-add-contact');
        if (btnAddContactNpc) btnAddContactNpc.addEventListener('click', () => this.addNpcToContacts());

        const btnDoorGo = document.getElementById('btn-door-go');
        if (btnDoorGo) {
            btnDoorGo.addEventListener('click', () => {
                if (this.nearDoor) this.interactWithDoor();
            });
        }

        // Global App Click Handler
        document.querySelectorAll('.app-icon').forEach(app => {
            app.addEventListener('click', (e) => {
                const appId = app.getAttribute('data-app') || app.closest('.app-icon').getAttribute('data-app');
                this.openApp(appId);
            });
        });

        // Messages App Inner Navigation
        const btnBackMessagesPhone = document.getElementById('btn-back-messages');
        if (btnBackMessagesPhone) {
            btnBackMessagesPhone.addEventListener('click', () => {
                document.getElementById('phone-app-messages').style.display = 'none';
            });
        }
        const btnCloseMessagesPc = document.getElementById('btn-close-pc-messages');
        if (btnCloseMessagesPc) {
            btnCloseMessagesPc.addEventListener('click', () => {
                document.getElementById('pc-app-messages').style.display = 'none';
            });
        }
    }

    openApp(appId) {
        if (!appId) return;

        if (appId === 'contacts') {
            this.openPhoneContactsApp();
            return;
        } else if (appId === 'taxi') {
            if (this.stats.money >= 15) {
                this.stats.money -= 15;
                alert("🚕 Táxi chamado! -$15 \nVocê foi ao Centro da Cidade. (Lógica de viagem no mapa a ser implementada)");
            } else {
                alert("🚕 Sem dinheiro para o táxi! Custa $15.");
            }
        } else if (appId === 'ifood') {
            if (this.stats.money >= 25) {
                this.stats.hunger = 100;
                this.stats.bladder = Math.max(0, this.stats.bladder - 20); // Drops bladder faster with fast food
                this.stats.money -= 25;
                alert("🍔 iFood Chegou! Fome Restaurada! (-$25)");
            } else {
                alert("🍔 Saldo insuficiente pro lanche! Custa $25.");
            }
        } else if (appId === 'ereader') {
            this.stats.time += 60; // Reading takes 1 hour
            this.player.attributes.intelligence += 0.5;
            this.checkQuests('intelligence', this.player.attributes.intelligence);
            alert("📚 Você leu um livro maravilhoso no app! \nTempo: +1h \nInteligência subiu! (+0.5)");
        } else if (appId === 'store') {
            this.toggleSmartphoneModal(false);
            this.toggleComputerModal(false);
            this.openStoreModal();
        } else if (appId === 'messages') {
            this.openMessagesApp();
            this.phoneState.view = 'messages';
            this.phoneState.selectedIndex = 0;
            return; // Don't run updateStatsUI after UI transition
        }
        this.updateStatsUI();
    }

    openMessagesApp() {
        // Mark all as read
        this.player.messages.forEach(msg => msg.read = true);
        this.updateUnreadBadges();

        const isComputer = document.getElementById('modal-computer').style.display === 'flex';
        const chatAreaId = isComputer ? 'pc-chat-area' : 'phone-chat-area';
        const modalId = isComputer ? 'pc-app-messages' : 'phone-app-messages';

        const chatArea = document.getElementById(chatAreaId);
        if (!chatArea) return;

        chatArea.innerHTML = ''; // Clear previous

        this.player.messages.forEach(msg => {
            const bubbleCont = document.createElement('div');
            bubbleCont.style.display = 'flex';
            bubbleCont.style.flexDirection = 'column';
            // Mocking that all these initial messages are "Received" (left aligned)
            bubbleCont.style.alignItems = 'flex-start';

            const senderName = document.createElement('div');
            senderName.className = 'chat-sender-name';
            senderName.innerText = msg.sender;

            const bubble = document.createElement('div');
            bubble.className = 'chat-message received';

            // Convert newlines to <br> for HTML rendering
            bubble.innerHTML = msg.text.replace(/\n/g, '<br>');

            const timestamp = document.createElement('div');
            timestamp.className = 'chat-timestamp';
            timestamp.innerText = msg.date;

            bubble.appendChild(timestamp);
            bubbleCont.appendChild(senderName);
            bubbleCont.appendChild(bubble);

            chatArea.appendChild(bubbleCont);
        });

        document.getElementById(modalId).style.display = 'flex';
    }

    updateUnreadBadges() {
        const hasUnread = this.player.messages.some(msg => !msg.read);
        const phoneBadge = document.getElementById('phone-msg-badge');
        const pcBadge = document.getElementById('pc-msg-badge');

        if (phoneBadge) phoneBadge.style.display = hasUnread ? 'block' : 'none';
        if (pcBadge) pcBadge.style.display = hasUnread ? 'block' : 'none';
    }

    toggleSmartphoneModal(forceOpen) {
        const modal = document.getElementById('modal-smartphone');
        if (!modal) return;

        // Prevent opening if computer is open
        if (document.getElementById('modal-computer').style.display === 'flex' && forceOpen !== false) return;

        const isOpen = forceOpen !== undefined ? forceOpen : modal.style.display === 'none';

        if (isOpen) {
            modal.style.display = 'flex';
            this.updateUnreadBadges();
            this.stopMovement();

            // Init phone navigation state
            this.phoneState.isOpen = true;
            this.phoneState.view = 'home';
            this.phoneState.selectedIndex = 0;
            this.phoneState.activeNpcId = null;

            // Hide inner apps
            const messagesList = document.getElementById('phone-app-messages-list');
            if (messagesList) messagesList.style.display = 'none';
            const contactsList = document.getElementById('phone-app-contacts-list');
            if (contactsList) contactsList.style.display = 'none';
            const activeChat = document.getElementById('phone-app-active-chat');
            if (activeChat) activeChat.style.display = 'none';

            this.updatePhoneUI();
        } else {
            modal.style.display = 'none';
            this.phoneState.isOpen = false;

            // Clean up selections
            const selected = document.querySelectorAll('.phone-selected');
            selected.forEach(el => el.classList.remove('phone-selected'));

            const childMsg = document.getElementById('phone-app-messages-list');
            if (childMsg) childMsg.style.display = 'none';
            const childCont = document.getElementById('phone-app-contacts-list');
            if (childCont) childCont.style.display = 'none';
            const activeChat = document.getElementById('phone-app-active-chat');
            if (activeChat) activeChat.style.display = 'none';
        }
    }

    // --- Phone Navigation Logic ---

    updatePhoneUI() {
        // Clear all previous selections
        const prevSelected = document.querySelectorAll('.phone-selected');
        prevSelected.forEach(el => el.classList.remove('phone-selected'));

        if (!this.phoneState.isOpen) return;

        if (this.phoneState.view === 'home') {
            // Apps are in a 3-column grid inside modal-smartphone
            // Usually we have 6 apps
            const modal = document.getElementById('modal-smartphone');
            const apps = Array.from(modal.querySelectorAll('.app-icon'));
            // Filter only direct children of the phone grid, avoid PC icons
            const phoneApps = apps.filter(app => app.closest('#modal-smartphone') && !app.closest('#modal-computer'));

            if (phoneApps.length > 0) {
                // Ensure index is within bounds
                this.phoneState.selectedIndex = Math.max(0, Math.min(this.phoneState.selectedIndex, phoneApps.length - 1));

                const selectedApp = phoneApps[this.phoneState.selectedIndex];
                if (selectedApp) {
                    selectedApp.classList.add('phone-selected');
                }
            }
        } else if (this.phoneState.view === 'contacts') {
            const list = document.getElementById('phone-contacts-list');
            const items = Array.from(list.querySelectorAll('.phone-contact-item'));
            if (items.length > 0) {
                this.phoneState.selectedIndex = Math.max(0, Math.min(this.phoneState.selectedIndex, items.length - 1));
                const selectedItem = items[this.phoneState.selectedIndex];
                if (selectedItem) {
                    selectedItem.classList.add('phone-selected');
                    // Scroll into view if needed
                    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } else if (this.phoneState.view === 'active_chat') {
            const list = document.getElementById('phone-active-chat-options');
            const items = Array.from(list.querySelectorAll('.phone-chat-option'));
            if (items.length > 0) {
                this.phoneState.selectedIndex = Math.max(0, Math.min(this.phoneState.selectedIndex, items.length - 1));
                const selectedItem = items[this.phoneState.selectedIndex];
                if (selectedItem) {
                    selectedItem.classList.add('phone-selected');
                    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        } else if (this.phoneState.view === 'messages') {
            const list = document.getElementById('phone-messages-threads-list');
            const items = Array.from(list.querySelectorAll('.phone-message-thread'));
            if (items.length > 0) {
                this.phoneState.selectedIndex = Math.max(0, Math.min(this.phoneState.selectedIndex, items.length - 1));
                const selectedItem = items[this.phoneState.selectedIndex];
                if (selectedItem) {
                    selectedItem.classList.add('phone-selected');
                    selectedItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                }
            }
        }
    }

    movePhoneSelection(dx, dy) {
        if (!this.phoneState.isOpen) return;

        if (this.phoneState.view === 'home') {
            const cols = 3;
            const rows = 2; // Assuming 6 apps
            let r = Math.floor(this.phoneState.selectedIndex / cols);
            let c = this.phoneState.selectedIndex % cols;

            c += dx;
            r += dy;

            // Clamp rows and wrap columns (or keep clamped)
            if (c < 0) c = 0;
            if (c >= cols) c = cols - 1;
            if (r < 0) r = 0;
            if (r >= rows) r = rows - 1;

            this.phoneState.selectedIndex = r * cols + c;

        } else if (this.phoneState.view === 'contacts') {
            const list = document.getElementById('phone-contacts-list');
            const items = list.querySelectorAll('.phone-contact-item');
            const len = items.length;
            if (len > 0) {
                // Only vertical movement
                this.phoneState.selectedIndex += dy;
                // Clamp
                if (this.phoneState.selectedIndex < 0) this.phoneState.selectedIndex = 0;
                if (this.phoneState.selectedIndex >= len) this.phoneState.selectedIndex = len - 1;
            }
        } else if (this.phoneState.view === 'active_chat') {
            const list = document.getElementById('phone-active-chat-options');
            const items = list.querySelectorAll('.phone-chat-option');
            const len = items.length;
            if (len > 0) {
                // Only vertical movement
                this.phoneState.selectedIndex += dy;
                if (this.phoneState.selectedIndex < 0) this.phoneState.selectedIndex = 0;
                if (this.phoneState.selectedIndex >= len) this.phoneState.selectedIndex = len - 1;
            }
        }

        this.updatePhoneUI();
    }

    handlePhoneEnter() {
        if (!this.phoneState.isOpen) return;

        if (this.phoneState.view === 'home') {
            // Find selected app
            const modal = document.getElementById('modal-smartphone');
            const apps = Array.from(modal.querySelectorAll('.app-icon')).filter(app => !app.closest('#modal-computer'));
            const selectedApp = apps[this.phoneState.selectedIndex];

            if (selectedApp) {
                const appId = selectedApp.getAttribute('data-app');
                if (appId === 'contacts') {
                    this.openPhoneContactsApp();
                } else if (appId === 'messages') {
                    this.openPhoneMessagesApp();
                }
            }
        } else if (this.phoneState.view === 'contacts') {
            const list = document.getElementById('phone-contacts-list');
            const items = list.querySelectorAll('.phone-contact-item');
            const selectedItem = items[this.phoneState.selectedIndex];
            if (selectedItem) {
                const npcId = parseFloat(selectedItem.getAttribute('data-npcid'));
                this.openPhoneChat(npcId);
            }
        } else if (this.phoneState.view === 'messages') {
            const list = document.getElementById('phone-messages-threads-list');
            const items = list.querySelectorAll('.phone-message-thread');
            const selectedItem = items[this.phoneState.selectedIndex];
            if (selectedItem) {
                const sender = selectedItem.getAttribute('data-sender');
                this.openPhoneChat(sender);
            }
        } else if (this.phoneState.view === 'active_chat') {
            // Find selected dialogue option
            const list = document.getElementById('phone-active-chat-options');
            const items = Array.from(list.querySelectorAll('.phone-chat-option'));
            const selectedItem = items[this.phoneState.selectedIndex];
            if (selectedItem && !selectedItem.classList.contains('disabled')) {
                const optIndex = parseInt(selectedItem.getAttribute('data-idx'), 10);
                if (this.dialogueState && this.dialogueState.options[optIndex]) {
                    const optionAction = this.dialogueState.options[optIndex].action;
                    if (optionAction) optionAction();
                }
            }
        }
    }

    handlePhoneBack() {
        if (!this.phoneState.isOpen) return;

        if (this.phoneState.view === 'contacts' || this.phoneState.view === 'messages') {
            // go back to home
            this.phoneState.view = 'home';
            this.phoneState.selectedIndex = 0;

            // hide inner apps
            document.getElementById('phone-app-messages-list').style.display = 'none';
            document.getElementById('phone-app-contacts-list').style.display = 'none';
            document.getElementById('phone-app-active-chat').style.display = 'none';

            this.updatePhoneUI();

        } else if (this.phoneState.view === 'active_chat') {
            // go back to where you came from
            if (this.dialogueState && this.dialogueState.isOpen) {
                this.dialogueState.isOpen = false;
            }
            document.getElementById('phone-app-active-chat').style.display = 'none';

            // Re-open appropriately based on sender
            if (typeof this.currentPhoneChatSender === 'string' && isNaN(parseFloat(this.currentPhoneChatSender))) {
                this.openPhoneMessagesApp();
            } else {
                this.openPhoneContactsApp();
            }
        }
    }

    // --- Phone App Implementations ---

    openPhoneMessagesApp() {
        this.phoneState.view = 'messages';
        this.phoneState.selectedIndex = 0;

        document.getElementById('phone-app-messages-list').style.display = 'flex';

        const list = document.getElementById('phone-messages-threads-list');
        list.innerHTML = '';

        // Group messages by sender
        const threads = {};
        this.player.messages.forEach(msg => {
            if (!threads[msg.sender]) {
                threads[msg.sender] = {
                    sender: msg.sender,
                    messages: [],
                    unread: 0
                };
            }
            threads[msg.sender].messages.push(msg);
            if (!msg.read) threads[msg.sender].unread++;
        });

        const threadArray = Object.values(threads);

        if (threadArray.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #888; margin-top: 20px;">Sua caixa de entrada está vazia.</div>';
        } else {
            threadArray.forEach((thread, index) => {
                // Determine icon based on sender type
                const isMentor = thread.sender.toLowerCase().includes('mentor');
                let initial = thread.sender.charAt(0);
                let bgColor = isMentor ? '#e1b12c' : '#0984e3';

                const latestMsg = thread.messages[0]; // Messages are unshifted, so index 0 is newest

                const item = document.createElement('div');
                item.className = 'phone-message-thread phone-navigable';
                item.setAttribute('data-sender', thread.sender);

                // Truncate text for preview
                let previewText = latestMsg.text;
                if (previewText.length > 30) {
                    previewText = previewText.substring(0, 30) + '...';
                }

                item.innerHTML = `
                    <div style="width: 40px; height: 40px; background: ${bgColor}; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem; position: relative;">
                        ${initial}
                        ${thread.unread > 0 ? `<div style="position: absolute; top: -5px; right: -5px; width: 15px; height: 15px; background: red; border-radius: 50%; border: 2px solid white; display:flex; justify-content:center; align-items:center; font-size:9px;">${thread.unread}</div>` : ''}
                    </div>
                    <div style="flex-grow: 1; margin-left:10px;">
                        <div style="font-weight: bold; color: #333; display: flex; justify-content: space-between;">
                            <span>${thread.sender}</span>
                            <span style="font-size: 0.7rem; color: #aaa; font-weight:normal;">${latestMsg.date}</span>
                        </div>
                        <div style="font-size: 0.8rem; color: ${thread.unread > 0 ? '#333' : '#888'}; font-weight: ${thread.unread > 0 ? 'bold' : 'normal'};">
                            ${previewText}
                        </div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    this.phoneState.selectedIndex = index;
                    this.updatePhoneUI();
                    this.openPhoneChat(thread.sender);
                });

                list.appendChild(item);
            });
        }

        this.updatePhoneUI();
    }

    openPhoneContactsApp() {
        this.phoneState.view = 'contacts';
        this.phoneState.selectedIndex = 0;

        document.getElementById('phone-app-contacts-list').style.display = 'flex';

        const list = document.getElementById('phone-contacts-list');
        list.innerHTML = '';

        const contacts = this.npcs.filter(npc => npc.contactAdded);

        if (contacts.length === 0) {
            list.innerHTML = '<div style="text-align: center; color: #888; margin-top: 20px;">Nenhum contato salvo ainda.</div>';
        } else {
            contacts.forEach((npc, index) => {
                const item = document.createElement('div');
                item.className = 'phone-contact-item phone-navigable';
                item.setAttribute('data-npcid', npc.id);
                // Profile Avatar Initial
                const initial = npc.name.charAt(0);

                item.innerHTML = `
                    <div style="width: 40px; height: 40px; background: #0984e3; color: white; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 1.2rem;">${initial}</div>
                    <div style="flex-grow: 1;">
                        <div style="font-weight: bold; color: #333;">${npc.name} ${npc.romanced ? '❤️' : ''}</div>
                        <div style="font-size: 0.8rem; color: #888;">Amizade: ${Math.floor(npc.friendship)}%</div>
                    </div>
                `;

                item.addEventListener('click', () => {
                    this.phoneState.selectedIndex = index;
                    this.updatePhoneUI();
                    this.openPhoneChat(npc.id);
                });

                list.appendChild(item);
            });
        }

        this.updatePhoneUI();
    }

    openPhoneChat(senderOrId) {
        this.currentPhoneChatSender = senderOrId;
        this.phoneState.view = 'active_chat';
        this.phoneState.selectedIndex = 0;

        document.getElementById('phone-app-active-chat').style.display = 'flex';

        // Check if it's an NPC ID or a generic sender (string)
        let npc = this.npcs.find(n => n.id == senderOrId || n.name === senderOrId);
        let senderName = senderOrId;
        let friendship = 0;

        if (npc) {
            senderName = npc.name;
            friendship = npc.friendship !== undefined ? Math.floor(npc.friendship) : 0;
            document.getElementById('phone-active-chat-friendship-container').style.display = 'block';
        } else {
            // It's a system string like "Mentor"
            document.getElementById('phone-active-chat-friendship-container').style.display = 'none';
        }

        document.getElementById('phone-active-chat-name').innerText = senderName;
        document.getElementById('phone-active-chat-friendship').innerText = `${friendship}%`;

        // Mark messages from this sender as read
        this.player.messages.forEach(msg => {
            if (msg.sender === senderName || msg.sender.includes(senderName)) {
                msg.read = true;
            }
        });
        this.updateUnreadBadges();

        // Clear and rebuild chat history from player messages
        const chatArea = document.getElementById('phone-active-chat-history');
        if (chatArea) chatArea.innerHTML = '';

        // Filter messages for this chat
        const chatHistory = this.player.messages.filter(msg => msg.sender === senderName || (npc && msg.sender.includes(npc.name)));

        // We push them in order (they are saved in unshift order, so we reverse it)
        const reversedHistory = [...chatHistory].reverse();
        reversedHistory.forEach(msg => {
            this.addMessageToPhoneChat(msg.sender, false, msg.text, msg.date); // For now, all static messages are received
        });

        if (npc) {
            // Initialize remote dialogue state mimicking real conversation
            this.dialogueState = {
                isOpen: true,
                isPhone: true,
                node: 'root',
                options: [],
                phase: 'idle',
                pendingAction: null
            };
            this.buildPhoneDialogueNode(npc);
        } else {
            // Disable dialogue state for non-NPCs
            this.dialogueState = null;
            const optionsContainer = document.getElementById('phone-active-chat-options');
            if (optionsContainer) optionsContainer.innerHTML = '';
        }
    }

    buildPhoneDialogueNode(npc) {
        if (!this.dialogueState) return;
        const optionsContainer = document.getElementById('phone-active-chat-options');
        if (!optionsContainer) return;
        optionsContainer.innerHTML = ''; // Clear old menu

        this.dialogueState.options = [];
        this.phoneState.selectedIndex = 0;

        const friendshipEl = document.getElementById('phone-active-chat-friendship');
        if (friendshipEl) friendshipEl.innerText = `${Math.floor(npc.friendship)}%`;

        if (this.dialogueState.node === 'root') {
            this.dialogueState.options.push({ text: "💬 Conversar sobre...", action: () => { this.dialogueState.node = 'chat'; this.buildPhoneDialogueNode(npc); } });

            if (npc.friendship > 50) {
                this.dialogueState.options.push({ text: "💘 Mandar um flerte", action: () => { this.dialogueState.node = 'flirt'; this.buildPhoneDialogueNode(npc); } });
            } else {
                this.dialogueState.options.push({ text: "💘 Flertar (Bloqueado)", disabled: true, action: () => { } });
            }

            this.dialogueState.options.push({
                text: "⬅️ Voltar aos contatos", action: () => {
                    this.dialogueState.isOpen = false;
                    const activeChat = document.getElementById('phone-app-active-chat');
                    if (activeChat) activeChat.style.display = 'none';
                    this.openPhoneContactsApp();
                    this.updatePhoneUI();
                }
            });

        } else if (this.dialogueState.node === 'chat') {
            const allInterests = ['pets', 'cars', 'humor', 'movies', 'sports', 'music', 'art', 'cooking', 'gaming', 'books', 'tech', 'travel'];
            const emojiMap = {
                'pets': '🐶 Pets', 'cars': '🏎️ Carros', 'humor': '😂 Humor', 'movies': '🎬 Filmes',
                'sports': '⚽ Esportes', 'music': '🎵 Música', 'art': '🎨 Arte', 'cooking': '🍳 Culinária',
                'gaming': '🎮 Jogos', 'books': '📚 Livros', 'tech': '💻 Tecnologia', 'travel': '✈️ Viagens'
            };

            const correctTopic = npc.interests[Math.floor(Math.random() * npc.interests.length)];
            let choices = [correctTopic];

            while (choices.length < 3) {
                const randomPick = allInterests[Math.floor(Math.random() * allInterests.length)];
                if (!choices.includes(randomPick)) choices.push(randomPick);
            }
            choices.sort(() => Math.random() - 0.5); // Shuffle

            choices.forEach(topic => {
                this.dialogueState.options.push({
                    text: `${emojiMap[topic]}`,
                    action: () => { this.handleNpcChat(npc, topic, topic === correctTopic, true); }
                });
            });

            this.dialogueState.options.push({ text: "⬅️ Voltar", action: () => { this.dialogueState.node = 'root'; this.buildPhoneDialogueNode(npc); } });
        } else if (this.dialogueState.node === 'flirt') {
            const flirtTypes = ['elogio', 'brincadeira', 'romantico', 'ousado'];
            const flirtDesc = {
                'elogio': '🥰 Elogio sincero',
                'brincadeira': '😜 Brincadeira leve',
                'romantico': '🌹 Fala romântica',
                'ousado': '🔥 Cantada ousada'
            };

            let choices = flirtTypes.sort(() => Math.random() - 0.5).slice(0, 3);
            choices.forEach(type => {
                this.dialogueState.options.push({
                    text: flirtDesc[type],
                    action: () => { this.handleNpcFlirt(npc, type, true); }
                });
            });
            this.dialogueState.options.push({ text: "⬅️ Voltar", action: () => { this.dialogueState.node = 'root'; this.buildPhoneDialogueNode(npc); } });
        }

        // Render options
        this.dialogueState.options.forEach((opt, idx) => {
            const btn = document.createElement('div');
            btn.className = 'phone-chat-option phone-navigable';
            if (opt.disabled) btn.classList.add('disabled');
            btn.innerText = opt.text;
            btn.setAttribute('data-idx', idx);

            btn.addEventListener('click', () => {
                if (!opt.disabled) {
                    this.phoneState.selectedIndex = idx;
                    this.updatePhoneUI();
                    if (opt.action) opt.action();
                }
            });

            optionsContainer.appendChild(btn);
        });

        this.updatePhoneUI();
    }

    addMessageToPhoneChat(sender, isPlayer, text) {
        const chatArea = document.getElementById('phone-active-chat-history');
        if (!chatArea) return;

        const bubbleCont = document.createElement('div');
        bubbleCont.style.display = 'flex';
        bubbleCont.style.flexDirection = 'column';
        bubbleCont.style.alignItems = isPlayer ? 'flex-end' : 'flex-start';

        if (!isPlayer) {
            const senderName = document.createElement('div');
            senderName.className = 'chat-sender-name';
            senderName.innerText = sender;
            bubbleCont.appendChild(senderName);
        }

        const bubble = document.createElement('div');
        bubble.className = `chat-message ${isPlayer ? 'sent' : 'received'}`;
        bubble.innerHTML = text.replace(/\n/g, '<br>');

        const timestamp = document.createElement('div');
        timestamp.className = 'chat-timestamp';
        // Mock instant time
        const now = new Date();
        timestamp.innerText = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;

        bubble.appendChild(timestamp);
        bubbleCont.appendChild(bubble);

        chatArea.appendChild(bubbleCont);

        // Auto-scroll to bottom
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    // --- End Phone App Implementations ---

    toggleComputerModal(forceOpen) {
        const modal = document.getElementById('modal-computer');
        if (!modal) return;

        const isOpen = forceOpen !== undefined ? forceOpen : modal.style.display === 'none';

        if (isOpen) {
            modal.style.display = 'flex';
            this.updateUnreadBadges();
            this.stopMovement();
        } else {
            modal.style.display = 'none';
            const childMsg = document.getElementById('pc-app-messages');
            if (childMsg) childMsg.style.display = 'none'; // Close child app too
        }
    }

    stopMovement() {
        for (let key in this.keys) {
            if (key !== 'p' && key !== 't') this.keys[key] = false;
        }
    }

    toggleProfileModal(forceOpen) {
        const modal = document.getElementById('modal-profile');
        if (!modal) return;

        const isOpen = forceOpen !== undefined ? forceOpen : modal.style.display === 'none';

        if (isOpen) {
            modal.style.display = 'flex';
            // Populate data
            document.getElementById('profile-name').innerText = this.characterState.name || 'Sem Nome';
            document.getElementById('profile-beauty').innerText = this.player.attributes.beauty.toFixed(1);
            document.getElementById('profile-intelligence').innerText = this.player.attributes.intelligence.toFixed(1);
            document.getElementById('profile-charisma').innerText = this.player.attributes.charisma.toFixed(1);
            document.getElementById('profile-fitness').innerText = this.player.attributes.fitness.toFixed(1);

            const interestsContainer = document.getElementById('profile-interests');
            interestsContainer.innerHTML = ''; // Clear existing

            const emojiMap = {
                'pets': '🐶 Pets', 'cars': '🏎️ Carros', 'humor': '😂 Humor', 'movies': '🎬 Filmes',
                'sports': '⚽ Esportes', 'music': '🎵 Música', 'art': '🎨 Arte', 'cooking': '🍳 Culinária',
                'gaming': '🎮 Jogos', 'books': '📚 Livros', 'tech': '💻 Tecnologia', 'travel': '✈️ Viagens'
            };

            if (this.player.interests.length > 0) {
                this.player.interests.forEach(interest => {
                    const pill = document.createElement('span');
                    pill.style.background = '#6c5ce7';
                    pill.style.color = 'white';
                    pill.style.padding = '3px 10px';
                    pill.style.borderRadius = '15px';
                    pill.style.fontSize = '0.9rem';
                    pill.innerText = emojiMap[interest] || interest;
                    interestsContainer.appendChild(pill);
                });
            } else {
                interestsContainer.innerText = "Nenhum interesse selecionado.";
            }

            // Stop movement
            this.stopMovement();
        } else {
            modal.style.display = 'none';
        }

        // Ensure event listener for "Salvar Jogo" isn't duplicated (run it once or use anonymous if confident)
        const btnSave = document.getElementById('btn-save-game');
        if (btnSave && !btnSave.dataset.listener) {
            btnSave.addEventListener('click', () => {
                this.saveGame();
            });
            btnSave.dataset.listener = 'true';
        }
    }

    toggleMenu() {
        const menu = document.getElementById('game-face-menu');
        if (!menu) return;
        this.isMenuOpen = !this.isMenuOpen;
        menu.style.display = this.isMenuOpen ? 'flex' : 'none';
        if (this.isMenuOpen) {
            this.selectedFaceIndex = 0;
            this.updateMenuHighlight();

            // Calculate absolute position within the parent container
            const canvasRect = this.canvas.getBoundingClientRect();
            const parentRect = this.canvas.parentElement.getBoundingClientRect();

            const offsetX = canvasRect.left - parentRect.left;
            const offsetY = canvasRect.top - parentRect.top;

            // menuWidth and menuHeight
            const menuWidth = 80;
            const menuHeight = 80;

            // px and py are screen coordinates now
            const px = offsetX + this.player.x - this.camera.x;
            const py = offsetY + this.player.y - this.camera.y;

            // Position to the left of the character, aligned with head
            let menuX = px - menuWidth - 40;
            let menuY = py - 120 - (menuHeight / 2) + 20;

            menu.style.left = `${menuX}px`;
            menu.style.top = `${menuY}px`;
        }

        menu.style.display = this.isMenuOpen ? 'flex' : 'none';

        // Stop movement if menu is open
        if (this.isMenuOpen) {
            for (let key in this.keys) {
                if (key !== 'o') this.keys[key] = false;
            }
        }
    }


    interactWithDoor() {
        if (this.nearDoor === 'exit_bedroom') {
            // Going to Living Room
            this.currentRoom = 'livingroom';
            // Spawn near living room door entering from bedroom
            this.player.x = 120;
            this.player.y = 230;
        } else if (this.nearDoor === 'bathroom') {
            // Going to Bathroom
            this.currentRoom = 'bathroom';
            // Spawn near bathroom door entering from bedroom
            this.player.x = 400;
            this.player.y = 500; // Entering from bottom usually
        } else if (this.nearDoor === 'exit_bathroom') {
            // Going back to Bedroom from Bathroom
            this.currentRoom = 'bedroom';
            this.player.x = 680;
            this.player.y = 230;
        } else if (this.nearDoor === 'enter_bedroom') {
            // Going back to Bedroom from Living Room
            this.currentRoom = 'bedroom';
            this.player.x = 120;
            this.player.y = 230;
        } else if (this.nearDoor === 'enter_kitchen') {
            // Going to Kitchen from Living Room
            this.currentRoom = 'kitchen';
            this.player.x = 750; // Spawn on right side of kitchen
            this.player.y = this.player.y; // Keep Y coordinate
        } else if (this.nearDoor === 'exit_kitchen') {
            // Going back to Living Room from Kitchen
            this.currentRoom = 'livingroom';
            this.player.x = 50; // Spawn on left side of living room
            this.player.y = this.player.y;
        } else if (this.nearDoor === 'enter_street') {
            // Going to Street from Living Room
            this.currentRoom = 'street';
            this.player.x = 50; // Spawn on left side of street
            this.player.y = this.player.y;
        } else if (this.nearDoor === 'exit_street') {
            // Going back to Living Room from Street
            this.currentRoom = 'livingroom';
            this.player.x = 750; // Spawn on right side of living room
            this.player.y = this.player.y;
            this.checkTasks('go_to_location', 'apartment');
        } else if (this.nearDoor === 'enter_coffee_shop') {
            this.currentRoom = 'coffee_shop';
            this.player.x = 400; // Center map
            this.player.y = 450; // Bottom spawn
            this.checkTasks('go_to_location', 'coffee_shop');
        } else if (this.nearDoor === 'exit_coffee_shop') {
            this.currentRoom = 'street';
            this.player.x = 350; // Door on street
            this.player.y = 350;
        } else if (this.nearDoor === 'enter_gym') {
            this.currentRoom = 'gym';
            this.player.x = 400;
            this.player.y = 450;
            this.checkTasks('go_to_location', 'gym');
        } else if (this.nearDoor === 'exit_gym') {
            this.currentRoom = 'street';
            this.player.x = 510;
            this.player.y = 350;
        } else if (this.nearDoor === 'enter_plaza') {
            this.currentRoom = 'plaza';
            this.player.x = 400;
            this.player.y = 450;
            this.checkTasks('go_to_location', 'plaza');
        } else if (this.nearDoor === 'exit_plaza') {
            this.currentRoom = 'street';
            this.player.x = 775;
            this.player.y = 350;
        } else if (this.nearDoor === 'enter_grocery') {
            this.currentRoom = 'grocery';
            this.player.x = 400;
            this.player.y = 450;
            this.checkTasks('go_to_location', 'grocery');
        } else if (this.nearDoor === 'exit_grocery') {
            this.currentRoom = 'street';
            this.player.x = 1020;
            this.player.y = 350;
        } else if (this.nearDoor.startsWith('obj_')) {
            const objMsg = {
                'obj_bed': 'Que cama macia... Zzz...',
                'obj_tv': 'Peguei o controle... Só tem reprise rolando na TV.',
                'obj_sink_bath': 'Limpando as mãos.',
                'obj_toilet': '... *Descarga soando* ...',
                'obj_shower': 'Hora de tomar um banhinho quente!',
                'obj_stove': 'Hmm, tá cheirando a comida boa!',
                'obj_sink_kitchen': 'Tem uma pilha de louça aqui...',
                'obj_fridge': 'Abrindo a geladeira de 5 em 5 minutos sem motivo.',
                'obj_diner': 'Lanchonete do Seu Zé. O cheiro de gordura é forte.',
                'obj_clothing_store': 'Loja de Roupas. Roupas da moda na vitrine.',
                'obj_party': 'Festa do Bairro! Som no talo e luzes coloridas!'
            };

            // Apply stat changes based on interaction
            if (this.nearDoor === 'obj_bed') {
                this.stats.time += 8 * 60; // Sleep 8 hours
                if (this.stats.time >= 24 * 60) this.stats.time -= 24 * 60;
                this.stats.health = 100;
                objMsg['obj_bed'] = 'Dormiu por 8 horas. Saúde restaurada!';
                this.checkTasks('interact_object', 'bedroom_bed');
            } else if (this.nearDoor === 'obj_fridge' || this.nearDoor === 'obj_stove' || this.nearDoor === 'obj_table') {
                if (this.stats.money >= 10) {
                    this.stats.hunger = 100;
                    this.stats.bladder = Math.max(0, this.stats.bladder - 15); // Drop bladder by 15% when eating
                    this.stats.money -= 10;
                    objMsg[this.nearDoor] = 'Comeu uma refeição deliciosa! (-$10)';

                    if (this.nearDoor === 'obj_fridge') {
                        this.checkTasks('interact_object', 'kitchen_fridge');
                    }
                    this.checkTasks('stat_reach', 'hunger', this.stats.hunger);
                } else {
                    objMsg[this.nearDoor] = 'Sem dinheiro para comida! Trabalhe no computador.';
                }
            } else if (this.nearDoor === 'obj_shower' || this.nearDoor === 'obj_sink_bath') {
                this.stats.hygiene = 100;
                this.player.attributes.beauty += 0.2; // Aumentar beleza
                this.checkTasks('interact_object', 'bathroom_shower');
                objMsg[this.nearDoor] = 'Lavou-se e ficou limpinho. Beleza subindo! (+0.2 Beleza)';
            } else if (this.nearDoor === 'obj_toilet') {
                this.stats.bladder = 100;
                objMsg[this.nearDoor] = '*Descarga soando*... Alívio! Vontade de ir ao banheiro 100%!';
            } else if (this.nearDoor === 'obj_computer') {
                this.player.attributes.intelligence += 0.2; // Aumentar Inteligência
                // Se gosta de tecnologia, ganha bônus de felicidade/carisma
                if (this.player.interests.includes('tech') || this.player.interests.includes('gaming')) {
                    this.stats.health = Math.min(100, this.stats.health + 10);
                    // Message silently adds up to computer modal context
                }
                this.toggleComputerModal(true);
            } else if (this.nearDoor === 'obj_tv') { // Clicando na TV (obj interativo) - A TV atual não era interativa mas podemos adicionar hook futuro, ou tratar se a TV virar interativa. 
                // A TV que temos é apenas decorativa. Vamos manter o hook.
            } else if (this.nearDoor === 'obj_wardrobe') {
                this.openWardrobeModal();
            }

            // Se clicar na Cama, TV, etc
            if (this.nearDoor === 'obj_tv') {
                this.player.attributes.charisma += 0.2;
                if (this.player.interests.includes('movies') || this.player.interests.includes('humor')) {
                    this.stats.health = Math.min(100, this.stats.health + 10);
                    objMsg['obj_tv'] = 'Assistindo um filme ótimo! (+0.2 Carisma, +10 Saúde)';
                } else {
                    objMsg['obj_tv'] = 'Assistindo TV pra passar o tempo... (+0.2 Carisma)';
                }
            }

            if (this.nearDoor === 'obj_diner') {
                this.checkTasks('go_to_location', 'downtown_diner');
            } else if (this.nearDoor === 'obj_clothing_store') {
                this.checkTasks('go_to_location', 'clothing_store');
                // Simulate Shop
                if (confirm('Bem-vindo à Loja de Roupas! Deseja comprar uma Camisa Nova por $50?')) {
                    if (this.stats.money >= 50) {
                        this.stats.money -= 50;
                        this.checkTasks('buy_item', 'item_category_shirt');
                        alert('Camisa comprada com sucesso!');
                    } else {
                        alert('Dinheiro insuficiente para a camisa.');
                    }
                }
            } else if (this.nearDoor === 'obj_party') {
                this.checkTasks('go_to_location', 'neighborhood_party');
            } else if (this.nearDoor === 'obj_coffee_shop') {
                this.checkTasks('go_to_location', 'coffee_shop');
                if (confirm('Tomar um café expresso por $5? (Restaura +30 Energia)')) {
                    if (this.stats.money >= 5) {
                        this.stats.money -= 5;
                        this.stats.health = Math.min(100, this.stats.health + 30);
                        alert('Você tomou o café. Bateria recarregada!');
                    } else {
                        alert('Dinheiro insuficiente!');
                    }
                }
            } else if (this.nearDoor === 'obj_gym') {
                this.checkTasks('go_to_location', 'gym');
                if (confirm('Treinar por 1 hora? Custa $15. (Aumenta Fitness, Gasta Energia/Higiene)')) {
                    if (this.stats.money >= 15 && this.stats.health > 20) {
                        this.stats.money -= 15;
                        this.stats.time += 60;
                        this.stats.health = Math.max(0, this.stats.health - 20);
                        this.stats.hygiene = Math.max(0, this.stats.hygiene - 30);
                        this.player.attributes.fitness += 0.5;
                        alert('Você fez um treino insano! (+0.5 Fitness)');
                    } else if (this.stats.health <= 20) {
                        alert('Você está muito cansado para treinar!');
                    } else {
                        alert('Dinheiro insuficiente!');
                    }
                }
            } else if (this.nearDoor === 'obj_plaza') {
                this.checkTasks('go_to_location', 'plaza');
                this.stats.time += 30;
                alert('Você deu uma caminhada relaxante na praça. (+30 min)');
            }

            if (objMsg[this.nearDoor]) {
                alert(objMsg[this.nearDoor]);
            }
            this.updateStatsUI();
        } else if (this.nearDoor && this.nearDoor.startsWith('npc_')) {
            // Initiating NPC discussion
            const npcIdStr = this.nearDoor.split('_')[1];
            this.openNpcDialogue(npcIdStr);
            return; // Prevent standard Door resets below until dialogue is done
        }

        // Briefly bounce player down to show interaction
        this.player.y += 10;
        this.nearDoor = null; // Reset near door state
        this.updateDoorMenu(); // Hide menu immediately
    }

    playFaceAnimation(type) {
        this.player.face.pendingType = type;
    }

    // --- NPC Dialogue System ---

    openNpcDialogue(npcIdStr) {
        const npc = this.npcs.find(n => String(n.id) === npcIdStr);
        if (!npc) return;

        this.currentDialoguingNpcId = npc.id;
        npc.isPaused = true;
        this.stopMovement();

        this.dialogueState = {
            isOpen: true,
            node: 'root',
            options: [],
            selectedIndex: 0,
            phase: 'idle',
            pendingAction: null
        };

        const modal = document.getElementById('modal-npc-dialogue');
        modal.style.display = 'flex';
        modal.style.opacity = '1';

        // Add heart emoji next to name if kissed
        let displayName = npc.name;
        if (npc.romanced) displayName += ' ❤️';
        document.getElementById('npc-dialogue-name').innerText = displayName;

        this.updateNpcDebugPanel(npc);

        // Position modal above NPC
        const canvasRect = this.canvas.getBoundingClientRect();
        const parentRect = this.canvas.parentElement.getBoundingClientRect();
        const offsetX = canvasRect.left - parentRect.left;
        const offsetY = canvasRect.top - parentRect.top;

        const px = offsetX + npc.x - this.camera.x;
        // Subindo o menu para flutuar acima do chapéu de forma mais natural (~150px)
        let py = offsetY + npc.y - 150 - this.camera.y;

        // If off-screen on the top, move it to the right of the head
        if (py - 50 < 0) {
            modal.style.transform = `translate(0%, -100%)`; // Anchor bottom-left
            modal.style.left = `${px + 40}px`;
            modal.style.top = `${py + 60}px`;
        } else {
            modal.style.transform = `translate(-50%, -100%)`; // Anchor bottom-center
            modal.style.left = `${px}px`;
            modal.style.top = `${py}px`;
        }

        this.renderNpcFriendshipUI(npc);
        this.buildDialogueNode(npc);
    }

    renderNpcFriendshipUI(npc) {
        const friendshipBar = document.getElementById('npc-friendship-bar');
        const friendshipTxt = document.getElementById('npc-friendship-text');

        const clampedFriend = Math.max(0, Math.min(100, npc.friendship));
        if (friendshipBar) {
            friendshipBar.style.width = `${clampedFriend}%`;
        }
        if (friendshipTxt) {
            friendshipTxt.innerText = `${Math.floor(clampedFriend)}%`;
        }
    }

    buildDialogueNode(npc) {
        if (!this.dialogueState) return;
        const container = document.getElementById('npc-dialogue-options');
        const promptContainer = document.getElementById('npc-dialogue-prompt');
        container.innerHTML = ''; // Clear old

        this.dialogueState.options = [];
        this.dialogueState.selectedIndex = 0; // Reset scroll index

        if (this.dialogueState.node === 'root') {
            promptContainer.innerText = 'O que você quer falar?';
            this.dialogueState.options.push({ icon: '💬', text: "Conversar", action: () => { this.dialogueState.node = 'chat'; this.buildDialogueNode(npc); } });

            // Flirt unlocks at > 50 and requires contact exchanged
            if (npc.friendship > 50 && npc.contactAdded) {
                this.dialogueState.options.push({ icon: '💘', text: "Flertar...", action: () => { this.dialogueState.node = 'flirt'; this.buildDialogueNode(npc); } });
            } else {
                this.dialogueState.options.push({ icon: '💘', text: "Flertar... (Bloqueado)", disabled: true, action: () => { } });
            }

            // Story Specific - Seu Zé
            if (npc.id === 'npc_ze') {
                if (npc.friendship >= 30) {
                    this.dialogueState.options.push({
                        icon: '💼', text: "Pedir Emprego", action: () => {
                            this.checkTasks('dialogue_choice', 'ask_for_job');
                            alert('Seu Zé: "Você parece esforçado. Pode começar lavando pratos lá no fundo!"');
                            this.closeNpcDialogue();
                        }
                    });
                } else {
                    this.dialogueState.options.push({ icon: '💼', text: "Emprego (30% Amizade)", disabled: true, action: () => { } });
                }

                // If job is unlocked, show Work shift option
                if (this.characterState.unlocked_jobs && this.characterState.unlocked_jobs.includes('dishwasher')) {
                    this.dialogueState.options.push({
                        icon: '🍽️', text: "Trabalhar Turno", action: () => {
                            alert('Você trabalhou na lanchonete por 4 horas e ganhou $50!');
                            this.stats.time += 4 * 60;
                            this.stats.hunger = Math.max(0, this.stats.hunger - 30);
                            this.stats.hygiene = Math.max(0, this.stats.hygiene - 20);
                            this.stats.money += 50;
                            this.checkTasks('work_shift', 'job_dishwasher', 1);
                            this.updateStatsUI();
                            this.closeNpcDialogue();
                        }
                    });
                }
            }

            // Contact
            if (!npc.contactAdded) {
                if (npc.friendship >= 50) {
                    this.dialogueState.options.push({ icon: '📱', text: "Trocar Contato", action: () => { this.addNpcToContacts(); this.buildDialogueNode(npc); } });
                } else {
                    this.dialogueState.options.push({ icon: '📱', text: "Contato (50% Amizade)", disabled: true, action: () => { } });
                }
            }

            this.dialogueState.options.push({ icon: '👋', text: "Sair", action: () => { this.closeNpcDialogue(); } });

        } else if (this.dialogueState.node === 'chat') {
            promptContainer.innerText = "Escolha um assunto:";

            // Topic Generator
            const allInterests = ['pets', 'cars', 'humor', 'movies', 'sports', 'music', 'art', 'cooking', 'gaming', 'books', 'tech', 'travel'];
            const emojiMap = {
                'pets': { i: '🐶', t: 'Pets' }, 'cars': { i: '🏎️', t: 'Carros' }, 'humor': { i: '😂', t: 'Humor' }, 'movies': { i: '🎬', t: 'Filmes' },
                'sports': { i: '⚽', t: 'Esportes' }, 'music': { i: '🎵', t: 'Música' }, 'art': { i: '🎨', t: 'Arte' }, 'cooking': { i: '🍳', t: 'Culinária' },
                'gaming': { i: '🎮', t: 'Jogos' }, 'books': { i: '📚', t: 'Livros' }, 'tech': { i: '💻', t: 'Tecnologia' }, 'travel': { i: '✈️', t: 'Viagens' }
            };

            const correctTopic = npc.interests[Math.floor(Math.random() * npc.interests.length)];
            let choices = [correctTopic];

            while (choices.length < 3) {
                const randomPick = allInterests[Math.floor(Math.random() * allInterests.length)];
                if (!choices.includes(randomPick)) choices.push(randomPick);
            }
            choices.sort(() => Math.random() - 0.5);

            choices.forEach(topic => {
                this.dialogueState.options.push({
                    icon: emojiMap[topic].i,
                    text: emojiMap[topic].t,
                    action: () => { this.handleNpcChat(npc, topic, npc.interests.includes(topic)); }
                });
            });

            // Back button
            this.dialogueState.options.push({ icon: '🔙', text: "Voltar", action: () => { this.dialogueState.node = 'root'; this.buildDialogueNode(npc); } });

        } else if (this.dialogueState.node === 'flirt') {
            promptContainer.innerText = "Lançando um charme...";

            if (this.npcData && this.npcData.flirts) {
                // To keep the menu size manageable, we can show 3 random flirts + the kiss option if high enough, 
                // or just list them all. The smartwatch menu supports scrolling but let's list them all.

                const flirtKeys = Object.keys(this.npcData.flirts);

                flirtKeys.forEach(key => {
                    const flirtItem = this.npcData.flirts[key];
                    let icon = '✨';
                    if (key === 'kiss' || key === 'ousado') icon = '💋';
                    else if (key === 'hug') icon = '🤗';
                    else if (key === 'romantico') icon = '🌹';
                    else if (key === 'brincadeira') icon = '😜';
                    else if (key === 'elogio') icon = '🥰';

                    if (npc.friendship >= flirtItem.reqFriendship || key !== 'kiss') { // Always show, except maybe hide kiss if too low or block it
                        // For kiss, let's keep the block logic
                        if (flirtItem.isKiss) {
                            if (npc.friendship >= flirtItem.reqFriendship) {
                                this.dialogueState.options.push({ icon: icon, text: flirtItem.desc, action: () => { this.handleNpcFlirt(npc, key); } });
                            } else {
                                this.dialogueState.options.push({ icon: icon, text: `${flirtItem.desc} (Bloqueado)`, disabled: true, action: () => { } });
                            }
                        } else {
                            this.dialogueState.options.push({ icon: icon, text: flirtItem.desc, action: () => { this.handleNpcFlirt(npc, key); } });
                        }
                    }
                });
            } else {
                // Fallback
                this.dialogueState.options.push({ icon: '✨', text: "Elogiar o estilo", action: () => { this.handleNpcFlirt(npc, 'compliment'); } });
                this.dialogueState.options.push({ icon: '🤗', text: "Dar um Abraço", action: () => { this.handleNpcFlirt(npc, 'hug'); } });

                if (npc.friendship >= 80) {
                    this.dialogueState.options.push({ icon: '💋', text: "Tentar Beijar", action: () => { this.handleNpcFlirt(npc, 'kiss'); } });
                } else {
                    this.dialogueState.options.push({ icon: '💋', text: "Beijar (Muito cedo!)", disabled: true, action: () => { } });
                }
            }

            this.dialogueState.options.push({ icon: '🔙', text: "Voltar", action: () => { this.dialogueState.node = 'root'; this.buildDialogueNode(npc); } });
        }

        this.renderDialogueMenuUI();
    }

    renderDialogueMenuUI() {
        const container = document.getElementById('npc-dialogue-options');
        const promptContainer = document.getElementById('npc-dialogue-prompt');
        container.innerHTML = '';

        this.dialogueState.options.forEach((opt, index) => {
            const li = document.createElement('li');
            li.className = 'smartwatch-option';
            if (opt.disabled) li.classList.add('disabled');

            if (index === this.dialogueState.selectedIndex) {
                li.classList.add('selected');
            }

            // Wear OS shows icon + text inline
            li.innerText = `${opt.icon} ${opt.text}`;

            // Mouse Over override
            li.addEventListener('mouseenter', () => {
                if (!opt.disabled) {
                    this.dialogueState.selectedIndex = index;
                    this.renderDialogueMenuUI();
                }
            });

            li.addEventListener('click', () => {
                if (!opt.disabled) this.executeDialogueChoice();
            });

            container.appendChild(li);
        });

        // Smartwatch circular offset calculation (itemHeight = 20px due to CSS resize)
        const itemHeight = 24;
        const offset = (this.dialogueState.selectedIndex * itemHeight) + (itemHeight / 2);
        container.style.transform = `translateY(-${offset}px)`;
    }

    moveDialogueSelection(dir) {
        if (!this.dialogueState || !this.dialogueState.isOpen) return;
        const total = this.dialogueState.options.length;
        if (total === 0) return;

        let safety = 0;
        let newIdx = this.dialogueState.selectedIndex;

        // Find next non-disabled option
        do {
            newIdx = (newIdx + dir + total) % total;
            safety++;
        } while (this.dialogueState.options[newIdx].disabled && safety < total);

        this.dialogueState.selectedIndex = newIdx;
        this.renderDialogueMenuUI();
    }

    executeDialogueChoice() {
        if (!this.dialogueState || !this.dialogueState.isOpen) return;
        const selectedOpt = this.dialogueState.options[this.dialogueState.selectedIndex];

        if (selectedOpt && !selectedOpt.disabled) {
            selectedOpt.action();
        }
    }

    handleNpcChat(npc, topic, isCorrect, isPhone = false) {
        let playerTxt = "Você viu aquilo sobre " + topic + "?";
        let npcTxt = isCorrect ? "Nossa, sim! Eu adoro!" : "Ah, não ligo muito pra isso não.";

        if (this.npcData && this.npcData.conversations && this.npcData.conversations[topic]) {
            const topicData = this.npcData.conversations[topic];
            let msgIndex = 0;

            if (topicData.player && topicData.player.length > 0) {
                msgIndex = Math.floor(Math.random() * topicData.player.length);
                playerTxt = topicData.player[msgIndex];
            }

            const responsePool = isCorrect ? topicData.positive : topicData.negative;
            if (responsePool && responsePool.length > 0) {
                // Sincroniza o índice de resposta com o da pergunta, prevenindo falhas caso os tamanhos não batam
                let respIndex = Math.min(msgIndex, responsePool.length - 1);
                npcTxt = responsePool[respIndex];
            }
        }

        // --- Friendship Logic Calculations ---
        let baseGain = isCorrect ? 5 : -5;
        let pTxtFeedback = isCorrect ? " (+5 Amizade) 😊" : " (-5 Amizade) 😬";

        if (isCorrect) {
            // Repeated Topic Penalty Check
            if (npc.recentTopics && npc.recentTopics[0] === topic) {
                baseGain = 2; // repeated back to back
                pTxtFeedback = " (+2 Amizade - Assunto Repetido) 😅";
            }
            else {
                // Shared Interests Bonus Check
                const playerSharesInterest = this.player && this.player.interests && this.player.interests.includes(topic);
                if (playerSharesInterest) {
                    baseGain = 10;
                    pTxtFeedback = " (+10 Amizade - Interesse em Comum!) ✨";
                }
            }

            // Register Topic History (Keeps last 2 to allow reset after 2)
            if (!npc.recentTopics) npc.recentTopics = [];
            npc.recentTopics.unshift(topic);
            if (npc.recentTopics.length > 2) npc.recentTopics.pop();
        }

        if (isPhone) {
            // Send Player Message Immediately
            this.addMessageToPhoneChat("Você", true, playerTxt);

            // Execute Logic immediately
            npc.friendship += baseGain;
            npc.friendship = Math.max(0, Math.min(100, npc.friendship));

            // Small delay for NPC reply
            setTimeout(() => {
                this.addMessageToPhoneChat(npc.name, false, npcTxt + pTxtFeedback);
                this.buildPhoneDialogueNode(npc); // Re-render logic to update screen
            }, 800);

        } else {
            // Set state to strictly wait for Enter key and render player balloon over an invisible modal UI
            this.dialogueState.phase = 'chat_player_speaking';
            this.player.chatBubble = { text: playerTxt, expiresAt: Date.now() + 9999999 };

            document.getElementById('modal-npc-dialogue').style.display = 'none'; // Hide to not overlap bubbles
            this.dialogueState.pendingAction = { type: 'chat_npc', npcTxt, isCorrect, npc, feedbackText: pTxtFeedback, baseGain: baseGain };
        }
    }

    advanceDialoguePhase() {
        const npc = this.npcs.find(n => n.id === this.currentDialoguingNpcId);
        if (!npc || !this.dialogueState) return;

        if (this.dialogueState.phase === 'chat_player_speaking') {
            this.player.chatBubble = null;
            this.dialogueState.phase = 'chat_npc_speaking';
            const pa = this.dialogueState.pendingAction;

            // Replaces prompt text UI by directly injecting friendship result in text to be seen cleanly in balloon
            npc.chatBubble = { text: pa.pa_npcTxt || (pa.npcTxt + pa.feedbackText), expiresAt: Date.now() + 9999999 };

            npc.friendship += pa.baseGain;
            // Clamp friendship
            npc.friendship = Math.max(0, Math.min(100, npc.friendship));

            this.checkTasks('npc_relationship', npc.id, npc.friendship);
            if (npc.friendship >= 50 && !npc.contactAdded) {
                this.addNpcToContacts();
            }

            if (pa.type === 'flirt_npc') {
                npc.face.pendingType = pa.flirt_face || (pa.isCorrect ? 'smile' : 'angry');
                npc.face.cycles = 4;
            } else {
                if (pa.isCorrect) {
                    npc.face.pendingType = 'smile';
                    npc.face.cycles = 4;
                } else {
                    npc.face.pendingType = 'angry';
                    npc.face.cycles = 4;
                }
            }
            this.renderNpcFriendshipUI(npc);
            this.updateNpcDebugPanel(npc);
        }
        else if (this.dialogueState.phase === 'chat_npc_speaking' || this.dialogueState.phase === 'flirt_result') {
            npc.chatBubble = null;
            this.player.chatBubble = null;

            this.dialogueState.phase = 'idle';
            this.dialogueState.pendingAction = null;

            // Re-render name in case romance status changed during flirt phase
            let displayName = npc.name;
            if (npc.romanced) displayName += ' ❤️';
            document.getElementById('npc-dialogue-name').innerText = displayName;

            // Restore modal visibility exactly over the character
            document.getElementById('modal-npc-dialogue').style.display = 'flex';
            this.dialogueState.node = 'root';
            this.buildDialogueNode(npc);
        }
    }

    handleNpcFlirt(npc, interaction, isPhone = false) {
        let playerGender = this.characterState.gender || 'male';

        let isCompatible = true;
        if (npc.orientation === 'heterosexual') {
            isCompatible = (playerGender !== npc.gender);
        } else if (npc.orientation === 'homosexual') {
            isCompatible = (playerGender === npc.gender);
        } else if (npc.orientation === 'bisexual') {
            isCompatible = true;
        } else {
            isCompatible = (playerGender === npc.gender);
        }

        let npcBubbleTxt = "";
        let playerTxt = "";
        let msgIndex = 0;
        let success = false;

        const flirtData = (this.npcData && this.npcData.flirts) ? this.npcData.flirts[interaction] : null;

        if (!flirtData) {
            console.warn("Flirt data not found for: ", interaction);
            return;
        }

        if (flirtData.player && flirtData.player.length > 0) {
            msgIndex = Math.floor(Math.random() * flirtData.player.length);
            playerTxt = flirtData.player[msgIndex];
        } else {
            playerTxt = "Oi...";
        }

        if (!isCompatible) {
            npcBubbleTxt = "Eh... me desculpe, mas não curto seu estilo. (-10 Amizade) 🚫";
            npc.friendship -= 10;
            npc.face.pendingType = 'angry';
            npc.face.cycles = 4;
            success = false;
        } else {
            let successChance = npc.friendship >= flirtData.reqFriendship ? flirtData.highChance : flirtData.lowChance;

            if (Math.random() < successChance) {
                success = true;
                npc.friendship += flirtData.gain;

                if (flirtData.isKiss) {
                    npc.romanced = true;
                    this.checkTasks('romance', true);
                }

                npc.face.pendingType = flirtData.successFace || 'smile';
                npc.face.cycles = 4;

                if (flirtData.positive && flirtData.positive.length > 0) {
                    let respIndex = Math.min(msgIndex, flirtData.positive.length - 1);
                    npcBubbleTxt = flirtData.positive[respIndex];
                } else {
                    npcBubbleTxt = `(+${flirtData.gain} Amizade)`;
                }
            } else {
                success = false;
                npc.friendship += flirtData.penalty; // penalty is negative

                npc.face.pendingType = flirtData.failFace || 'angry';
                npc.face.cycles = 4;

                if (flirtData.negative && flirtData.negative.length > 0) {
                    let respIndex = Math.min(msgIndex, flirtData.negative.length - 1);
                    npcBubbleTxt = flirtData.negative[respIndex];
                } else {
                    npcBubbleTxt = `(${flirtData.penalty} Amizade)`;
                }
            }
        }

        // Clamp Flirt Friendship Results
        npc.friendship = Math.max(0, Math.min(100, npc.friendship));

        if (isPhone) {
            this.addMessageToPhoneChat("Você", true, playerTxt);
            setTimeout(() => {
                this.addMessageToPhoneChat(npc.name, false, npcBubbleTxt);
                this.buildPhoneDialogueNode(npc);
            }, 800);
        } else {
            // Set state to strictly wait for Enter key and render player balloon over an invisible modal UI
            this.dialogueState.phase = 'chat_player_speaking';
            this.player.chatBubble = { text: playerTxt, expiresAt: Date.now() + 9999999 };

            document.getElementById('modal-npc-dialogue').style.display = 'none'; // Hide to not overlap bubbles

            // Re-using the chat pipeline variables for flirt
            // pa_npcTxt allows us to bypass the feedbackText injection logic in advanceDialoguePhase 
            // since flirt texts already have the gains appended in the logic above.
            this.dialogueState.pendingAction = {
                type: 'flirt_npc',
                pa_npcTxt: npcBubbleTxt,
                isCorrect: success, // Passes the exact true/false value obtained from the random check above
                flirt_face: npc.face.pendingType, // Exactly the face string decided 
                npc: npc,
                baseGain: 0 // logic already executed above, prevent double applying
            };
        }
    }

    addNpcToContacts() {
        if (!this.currentDialoguingNpcId) return;
        const npc = this.npcs.find(n => n.id === this.currentDialoguingNpcId);

        if (npc && npc.friendship >= 50 && !npc.contactAdded) {
            npc.contactAdded = true;

            // Send introduction SMS to player
            this.player.messages.unshift({
                id: Date.now(),
                sender: `${npc.name} 👋`,
                text: `Ei!! Salvei seu número aqui. Foi muito massa conversar com você hoje! A gente se esbarra por aí hahaha ✌️`,
                date: 'Agora', // Will parse correctly in phone app
                read: false
            });
            this.updateUnreadBadges();
        }
    }

    closeNpcDialogue() {
        document.getElementById('modal-npc-dialogue').style.display = 'none';

        const debugPanel = document.getElementById('npc-debug-panel');
        if (debugPanel) debugPanel.style.display = 'none';

        let pushed = false;

        if (this.dialogueState) {
            this.dialogueState.isOpen = false;
        }
        if (this.currentDialoguingNpcId) {
            const npc = this.npcs.find(n => n.id === this.currentDialoguingNpcId);
            if (npc) {
                npc.isPaused = false;

                // Repulsion vector on the X axis to prevent sticking to hitboxes
                if (this.player.x > npc.x) {
                    this.player.x += 25; // Push player further right
                } else {
                    this.player.x -= 25; // Push player further left
                }
                // Zero out any residual movement commands just in case
                this.player.isMoving = false;
                pushed = true;
            }
        }

        if (!pushed) {
            this.player.y += 20; // Fallback bound
        }

        this.currentDialoguingNpcId = null;
        this.nearDoor = null;

        this.updateDoorMenu();
    }

    updateNpcDebugPanel(npc) {
        const debugPanel = document.getElementById('npc-debug-panel');
        if (!debugPanel || !npc) return;

        document.getElementById('panel-npc-name').innerText = npc.name;

        let genderStr = npc.gender === 'male' ? 'Masculino' : 'Feminino';
        let orientStr = npc.orientation === 'heterosexual' ? 'Hétero' : (npc.orientation === 'homosexual' ? 'Homo' : 'Bi');

        document.getElementById('panel-npc-gender').innerText = genderStr;
        document.getElementById('panel-npc-orientation').innerText = orientStr;
        document.getElementById('panel-npc-friendship').innerText = npc.friendship + '%';

        const interestsContainer = document.getElementById('panel-npc-interests');
        interestsContainer.innerHTML = '';
        npc.interests.forEach(interest => {
            const tag = document.createElement('span');
            tag.style.background = '#444';
            tag.style.padding = '2px 5px';
            tag.style.borderRadius = '3px';
            tag.style.fontSize = '10px';
            tag.innerText = interest;
            interestsContainer.appendChild(tag);
        });

        debugPanel.style.display = 'block';
    }

    // --- Graphics Render ---ing Logic
    createItemCard(part, index, isStore) {
        const card = document.createElement('div');
        card.style.border = '1px solid #ccc';
        card.style.borderRadius = '8px';
        card.style.padding = '10px';
        card.style.textAlign = 'center';
        card.style.background = '#fff';

        // Draw preview using cached image system
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');

        const img = this.assets.idle[part][index];
        if (img) {
            // Using a default color so the preview is visible
            let color = '#333333';
            if (part === 'body') color = this.characterState.skinColor;
            else if (this.characterState[part] && this.characterState[part].color) {
                // Try to use currently equipped color 
                color = this.characterState[part].color;
            }

            const finalImg = this.game.characterCreator.getCachedImage(part, img, color, 'idle', index);
            // Draw just the front-facing frame
            const fw = finalImg.width / 4;
            const fh = finalImg.height / 4;
            ctx.drawImage(finalImg, 0, 0, fw, fh, 0, 0, 64, 64);
        }
        card.appendChild(canvas);

        const name = document.createElement('div');
        name.innerText = `${part.toUpperCase()} #${index + 1}`;
        name.style.fontWeight = 'bold';
        name.style.margin = '5px 0';
        card.appendChild(name);

        const btn = document.createElement('button');
        btn.style.padding = '5px 10px';
        btn.style.border = 'none';
        btn.style.borderRadius = '4px';
        btn.style.cursor = 'pointer';
        btn.style.fontWeight = 'bold';
        btn.style.width = '100%';

        if (isStore) {
            btn.innerText = 'Comprar ($50)';
            btn.style.background = '#1dd1a1';
            btn.style.color = '#fff';
            btn.onclick = () => {
                if (this.stats.money >= 50) {
                    this.stats.money -= 50;
                    this.inventory[part].push(index);
                    this.updateStatsUI();
                    alert('Item comprado com sucesso!');
                    this.populateStore(); // refresh
                } else {
                    alert('Dinheiro insuficiente!');
                }
            };
        } else {
            btn.innerText = 'Vestir';
            btn.style.background = '#667eea';
            btn.style.color = '#fff';
            btn.onclick = () => {
                this.characterState[part].index = index;
                // Generate a random color or keep current for now. Keeping current.
                alert('Roupa trocada!');
                this.populateWardrobe(); // refresh
            };
        }
        card.appendChild(btn);
        return card;
    }

    openStoreModal() {
        this.isMenuOpen = true;
        document.getElementById('store-modal').style.display = 'flex';
        this.updateStatsUI();
        this.populateStore();
    }

    openWardrobeModal() {
        this.isMenuOpen = true;
        document.getElementById('wardrobe-modal').style.display = 'flex';
        this.populateWardrobe();
    }

    populateStore() {
        const container = document.getElementById('store-items-container');
        if (!container) return;
        container.innerHTML = '';

        const parts = ['hair', 'torso', 'legs', 'feet'];
        parts.forEach(part => {
            if (this.assets.idle[part]) {
                for (let i = 0; i < this.assets.idle[part].length; i++) {
                    if (!this.inventory[part].includes(i)) {
                        container.appendChild(this.createItemCard(part, i, true));
                    }
                }
            }
        });
    }

    populateWardrobe() {
        const container = document.getElementById('wardrobe-items-container');
        if (!container) return;
        container.innerHTML = '';

        const parts = ['hair', 'torso', 'legs', 'feet'];
        parts.forEach(part => {
            if (this.assets.idle[part]) {
                for (let i = 0; i < this.inventory[part].length; i++) {
                    const idx = this.inventory[part][i];
                    container.appendChild(this.createItemCard(part, idx, false));
                }
            }
        });
    }

    // New stats properties
    stats = {
        health: 100,
        hunger: 100,
        hygiene: 100,
        money: 100,
        time: 8 * 60 // Start at 8:00 AM (in minutes)
    };

    async start(isLoaded = false) {
        if (!isLoaded) {
            // Spawn no final da rua, para ter que caminhar até o apartamento
            this.player.x = 2300; // Final da rua à direita expandida
            this.player.y = 150; // Na calçada
            this.player.direction = 0; // Olhando pra baixo

            await this.loadNpcData();

            this.npcs = [];

            // Add fixed story NPCs
            if (this.npcData && this.npcData.story_npcs) {
                this.npcData.story_npcs.forEach(npc => {
                    this.npcs.push(JSON.parse(JSON.stringify(npc))); // Deep copy
                });
            }

            for (let i = 0; i < 6; i++) {
                this.npcs.push(this.generateNPC(this.npcs));
            }
        } else {
            // Only load data if we didn't already
            if (!this.npcData) await this.loadNpcData();

            // Patch old saves: inject story NPCs if they don't exist in the loaded npcs
            if (this.npcData && this.npcData.story_npcs) {
                this.npcData.story_npcs.forEach(storyNpc => {
                    if (!this.npcs.find(n => n.id === storyNpc.id)) {
                        this.npcs.push(JSON.parse(JSON.stringify(storyNpc)));
                    }
                });
            }
        }

        this.loadQuestsDef();

        this.updateStatsUI(); // Initial UI draw

        this.lastTime = performance.now();
        this.loop(this.lastTime);
    }

    async loadQuestsDef() {
        try {
            const response = await fetch('data/quests.json');
            this.questsData = await response.json();
            this.initMissions();
        } catch (e) {
            console.warn("Failed to load quests, using fallback:", e);
            this.questsData = {
                "missions": [
                    {
                        "id": "m00_chegando_na_cidade",
                        "title": "A Selva de Pedra",
                        "trigger": { "type": "game_start" },
                        "mentor_message": "Finalmente você chegou! A viagem foi longa, né? Pega suas malas e tenta achar a porta do prédio onde a gente alugou aquele quartinho pra você. Não vai se perder na rua!",
                        "tasks": [
                            { "id": "t1", "type": "go_to_location", "target": "apartment", "description": "Encontre e entre no seu apartamento pela rua." }
                        ],
                        "rewards": { "popularity": 2 }
                    },
                    {
                        "id": "m01_chegada",
                        "title": "Poeira da Estrada",
                        "trigger": { "type": "mission_completed", "target": "m00_chegando_na_cidade" },
                        "mentor_message": "Aí, achou o lugar! O apê é minúsculo, mas pelo menos não tem assombração igual naquelas histórias que a gente contava na calçada. Vai tirar essa poeira da estrada, toma um banho e testa esse colchão aí.",
                        "tasks": [
                            { "id": "t1", "type": "interact_object", "target": "bathroom_shower", "description": "Tome um banho para recuperar sua barra de Higiene." },
                            { "id": "t2", "type": "interact_object", "target": "bedroom_bed", "description": "Durma um pouco para recuperar Energia." }
                        ],
                        "rewards": { "energy": 100, "hygiene": 100 }
                    },
                    {
                        "id": "m02_fome_e_realidade",
                        "title": "Aqui Ninguém Dá Pão",
                        "trigger": { "type": "mission_completed", "target": "m01_chegada" },
                        "mentor_message": "Dormiu bem? Seguinte, aqui na cidade grande o povo não tem o costume de dar um prato de comida pra quem bate na porta não. Abre a geladeira e vê se tem algo, senão vai ter que gastar os trocados da passagem na mercearia da esquina. Não vai desmaiar de fome no primeiro dia!",
                        "tasks": [
                            { "id": "t1", "type": "interact_object", "target": "kitchen_fridge", "description": "Verifique a geladeira no seu apartamento." },
                            { "id": "t2", "type": "stat_reach", "target": "hunger", "value": 80, "description": "Coma algo para deixar sua fome acima de 80%." }
                        ],
                        "rewards": { "money": 0 }
                    },
                    {
                        "id": "m03_a_busca_pelo_emprego",
                        "title": "Correndo Atrás do Prejuízo",
                        "trigger": { "type": "mission_completed", "target": "m02_fome_e_realidade" },
                        "mentor_message": "Ó, esqueci de um detalhe importantíssimo: o dono do prédio é brabo e o aluguel vence toda sexta-feira sem choro. Dá um pulo na Lanchonete do centro. O gerente de lá, o Seu Zé, tá precisando de um ajudante. Puxa um papo com ele primeiro, ganha a confiança do homem e depois pede a vaga.",
                        "tasks": [
                            { "id": "t1", "type": "go_to_location", "target": "downtown_diner", "description": "Vá até a Lanchonete no centro da cidade." },
                            { "id": "t2", "type": "npc_relationship", "target": "npc_ze", "value": 30, "description": "Converse com o Seu Zé até atingir 30% de amizade." },
                            { "id": "t3", "type": "dialogue_choice", "target": "ask_for_job", "description": "Escolha a opção de diálogo para pedir o emprego." }
                        ],
                        "rewards": { "unlock_job": "dishwasher" }
                    },
                    {
                        "id": "m04_suor_e_lagrimas",
                        "title": "O Primeiro Salário",
                        "trigger": { "type": "mission_completed", "target": "m03_a_busca_pelo_emprego" },
                        "mentor_message": "Boa! Lavar prato e limpar mesa não é o glamour que você sonhava, mas paga as contas. Faz o teu primeiro turno lá e tenta juntar pelo menos uns R$ 200 pra garantir a semana do aluguel. Mostra que o povo da nossa terra tem garra pra trabalhar!",
                        "tasks": [
                            { "id": "t1", "type": "work_shift", "target": "job_dishwasher", "value": 1, "description": "Cumpra pelo menos um turno completo de trabalho na lanchonete." },
                            { "id": "t2", "type": "stat_reach", "target": "money", "value": 200, "description": "Acumule R$ 200 na sua carteira." }
                        ],
                        "rewards": { "popularity": 5, "unlock_location": "clothing_store" }
                    },
                    {
                        "id": "m05_banho_de_loja",
                        "title": "Deixando o Passado pra Trás",
                        "trigger": { "type": "mission_completed", "target": "m04_suor_e_lagrimas" },
                        "mentor_message": "Aluguel garantido! Parabéns. Mas olha, vai ter uma festinha aqui no bairro hoje à noite, e com essa sua roupa de quem acabou de descer da caçamba do caminhão, os seguranças não vão te deixar passar da porta. Passa na loja de roupas que acabou de abrir e compra uma camisa nova. Depois me encontra na porta da festa!",
                        "tasks": [
                            { "id": "t1", "type": "go_to_location", "target": "clothing_store", "description": "Vá até a Loja de Roupas." },
                            { "id": "t2", "type": "buy_item", "target": "item_category_shirt", "description": "Compre e equipe qualquer camisa nova." },
                            { "id": "t3", "type": "go_to_location", "target": "neighborhood_party", "description": "Vá até o local da festa à noite." }
                        ],
                        "rewards": { "popularity": 20, "unlock_location": "neighborhood_party" }
                    }
                ]
            };
            this.initMissions();
        }
    }

    initMissions() {
        if (!this.currentMissionId && this.completedMissions.length === 0) {
            // Delay the first mission trigger slightly so the game canvas and DOM finish loading
            setTimeout(() => {
                this.checkMissionTrigger('game_start');
            }, 500);
        } else {
            this.updateQuestsUI(); // refresh UI for loaded state
        }
    }

    startMission(missionId) {
        const mission = this.questsData.missions.find(m => m.id === missionId);
        if (!mission) return;

        this.currentMissionId = mission.id;
        this.taskProgress = {};
        mission.tasks.forEach(t => {
            this.taskProgress[t.id] = false;
        });

        // Find mentor NPC to use actual name as sender, fallback to "Mentor"
        const mentorNpc = this.npcs.find(n => n.id === 'mentor' || n.name === 'Lucas');
        const senderName = mentorNpc ? mentorNpc.name : "Mentor";

        // Send mentor message via smartphone
        this.receiveSmartphoneMessage(senderName, mission.title, mission.mentor_message, mission);
        this.updateQuestsUI();
    }

    receiveSmartphoneMessage(sender, title, text, missionData = null) {
        // Push message to player state
        const msgObj = {
            id: Date.now() + Math.random(),
            sender: sender,
            title: title,
            text: text,
            date: 'Agora',
            read: false,
            linkedMissionId: missionData ? missionData.id : null
        };
        this.player.messages.unshift(msgObj);

        // Show visual alert on screen
        // this.showVisualAlert(`Nova Mensagem de ${sender}: ${title}`);

        // Update unread icon
        this.updateUnreadBadges();

        // Invasive alert & automatic phone open as requested by user
        alert(`Nova Missão: ${title}\n\nMensagem de ${sender}:\n"${text}"`);
        this.toggleSmartphoneModal(true);
        this.openPhoneMessagesApp();
        this.openPhoneChat(sender);
    }

    checkMissionTrigger(triggerType, target = null) {
        if (!this.questsData || !this.questsData.missions) return;

        // Find standard next mission
        const nextMissions = this.questsData.missions.filter(m =>
            !this.completedMissions.includes(m.id) && m.id !== this.currentMissionId
        );

        for (let mission of nextMissions) {
            if (mission.trigger.type === triggerType) {
                if (triggerType === 'mission_completed') {
                    if (mission.trigger.target === target) {
                        this.startMission(mission.id);
                        break;
                    }
                } else if (triggerType === 'game_start') {
                    this.startMission(mission.id);
                    break;
                }
            }
        }
    }

    checkTasks(actionType, target, value = null) {
        if (!this.currentMissionId || !this.questsData) return;

        const currentMission = this.questsData.missions.find(m => m.id === this.currentMissionId);
        if (!currentMission) return;

        let missionUpdated = false;

        currentMission.tasks.forEach(task => {
            if (this.taskProgress[task.id]) return; // already completed

            let isComplete = false;

            if (task.type === actionType) {
                if (actionType === 'interact_object' || actionType === 'go_to_location' || actionType === 'dialogue_choice' || actionType === 'buy_item') {
                    if (task.target === target) isComplete = true;
                } else if (actionType === 'stat_reach') {
                    // For stat reach, 'target' is the stat name (e.g. 'hunger', 'money')
                    // 'value' is the current value of that stat
                    if (task.target === target && value >= task.value) isComplete = true;
                } else if (actionType === 'work_shift') {
                    if (task.target === target && value >= task.value) isComplete = true;
                } else if (actionType === 'npc_relationship') {
                    if (task.target === target && value >= task.value) isComplete = true;
                }
            }

            if (isComplete) {
                this.taskProgress[task.id] = true;
                missionUpdated = true;
            }
        });

        if (missionUpdated) {
            this.updateQuestsUI();

            // Check if all tasks in mission are completed
            const allTasksCompleted = currentMission.tasks.every(t => this.taskProgress[t.id] === true);
            if (allTasksCompleted) {
                this.completeCurrentMission(currentMission);
            }
        }
    }

    completeCurrentMission(mission) {
        this.completedMissions.push(mission.id);
        this.currentMissionId = null;
        this.taskProgress = {};

        // Grant Rewards
        if (mission.rewards) {
            if (mission.rewards.money !== undefined) this.stats.money += mission.rewards.money;
            if (mission.rewards.energy !== undefined) this.stats.health = Math.min(100, this.stats.health + mission.rewards.energy);
            if (mission.rewards.hygiene !== undefined) this.stats.hygiene = Math.min(100, this.stats.hygiene + mission.rewards.hygiene);
            if (mission.rewards.popularity !== undefined) {
                if (!this.player.attributes) this.player.attributes = { beauty: 0, intelligence: 0, charisma: 0, fitness: 0 };
                if (this.player.attributes.charisma === undefined) this.player.attributes.charisma = 0;
                this.player.attributes.charisma += (mission.rewards.popularity / 10);
            }

            if (mission.rewards.unlock_job) {
                this.characterState.unlocked_jobs = this.characterState.unlocked_jobs || [];
                this.characterState.unlocked_jobs.push(mission.rewards.unlock_job);
            }
        }

        // this.showVisualAlert(`Missão '${mission.title}' Concluída!`);
        alert(`Missão '${mission.title}' Concluída!`);

        this.updateStatsUI();
        this.updateQuestsUI();

        // Check active chat if phone is open
        if (this.currentPhoneChatSender) {
            this.openPhoneChat(this.currentPhoneChatSender);
        }

        // Trigger next mission if any are waiting for this completion
        this.checkMissionTrigger('mission_completed', mission.id);
    }

    updateQuestsUI() {
        const container = document.getElementById('profile-quests');
        if (!container) return;

        container.innerHTML = '';

        if (!this.currentMissionId || !this.questsData) {
            container.innerText = "Nenhuma missão ativa no momento. Aproveite a vida livremente!";
            return;
        }

        const currentMission = this.questsData.missions.find(m => m.id === this.currentMissionId);
        if (!currentMission) return;

        // Title
        const titleEl = document.createElement('div');
        titleEl.style.fontWeight = 'bold';
        titleEl.style.marginBottom = '8px';
        titleEl.style.color = '#2f3542';
        titleEl.style.borderBottom = '1px solid #eccc68';
        titleEl.style.paddingBottom = '4px';
        titleEl.innerText = `[Missão] ${currentMission.title}`;
        container.appendChild(titleEl);

        // Tasks
        currentMission.tasks.forEach(t => {
            const isCompleted = this.taskProgress[t.id] === true;
            const div = document.createElement('div');
            div.style.padding = '3px 0';
            div.innerHTML = `<strong style="color: ${isCompleted ? '#27ae60' : '#d35400'};">${isCompleted ? '✓' : '☐'}</strong> <span style="color: ${isCompleted ? '#7f8c8d' : '#2c3e50'}; text-decoration: ${isCompleted ? 'line-through' : 'none'};">${t.description}</span>`;
            container.appendChild(div);
        });
    }

    saveGame() {
        const dataToSave = {
            characterState: this.characterState,
            assets: this.assets,   // Might be huge if images but game passes it down.
            emojis: this.emojis,
            player: {
                x: this.player.x,
                y: this.player.y,
                direction: this.player.direction,
                attributes: this.player.attributes,
                interests: this.player.interests,
                messages: this.player.messages
            },
            stats: this.stats,
            inventory: this.inventory,
            npcs: this.npcs,
            currentRoom: this.currentRoom,
            currentMissionId: this.currentMissionId,
            taskProgress: this.taskProgress,
            completedMissions: this.completedMissions
        };

        try {
            // Re-stringifying assets every time is generally bad if it contains Image objects. 
            // the assets object above in characterCreator holds HTMLImageElements which JSON.stringify FAILS ON implicitly. 
            // So we skip assets and emojis, those are loaded at boot anyway.

            const safeDataToSave = {
                characterState: this.characterState,
                player: {
                    x: this.player.x,
                    y: this.player.y,
                    direction: this.player.direction,
                    attributes: this.player.attributes,
                    interests: this.player.interests,
                    messages: this.player.messages
                },
                stats: this.stats,
                inventory: this.inventory,
                npcs: this.npcs,
                currentRoom: this.currentRoom,
                currentMissionId: this.currentMissionId,
                taskProgress: this.taskProgress || {},
                completedMissions: this.completedMissions || []
            };

            const serialized = JSON.stringify(safeDataToSave);
            localStorage.setItem('highSchoolLifeSave', serialized);
            alert("Jogo Salvo com Sucesso!");
        } catch (e) {
            console.error("Failed to save the game", e);
            alert("Erro ao salvar o jogo. " + e.message);
        }
    }

    loadGameState(data) {
        if (!data) return;

        this.statsTimer = 0;
        this.characterState = data.characterState || this.characterState;

        if (data.player) {
            this.player.x = data.player.x;
            this.player.y = data.player.y;
            this.player.direction = data.player.direction;
            this.player.attributes = data.player.attributes;
            this.player.interests = data.player.interests;
            this.player.messages = data.player.messages || this.player.messages;
        }

        this.stats = data.stats || this.stats;
        this.inventory = data.inventory || this.inventory;
        this.npcs = data.npcs || this.npcs;
        this.currentRoom = data.currentRoom || 'bedroom';
        this.currentMissionId = data.currentMissionId || null;
        this.taskProgress = data.taskProgress || {};
        this.completedMissions = data.completedMissions || [];
    }


    generateNPC(existingNpcs = []) {
        const allInterests = ['pets', 'cars', 'humor', 'movies', 'sports', 'music', 'art', 'cooking', 'gaming', 'books', 'tech', 'travel'];

        // Pick exactly 3 random interests
        let npcInterests = [...allInterests].sort(() => 0.5 - Math.random()).slice(0, 3);

        // Generates fixed properties
        let npcGender = 'male'; // Fixed for now as per user instruction (sprites are male)
        let npcOrientation = ['heterosexual', 'homosexual', 'bisexual'][Math.floor(Math.random() * 3)];

        let npcName = "NPC";
        if (npcGender === 'male' && this.npcData && this.npcData.names_male && this.npcData.names_male.length > 0) {
            npcName = this.npcData.names_male[Math.floor(Math.random() * this.npcData.names_male.length)];
        } else if (npcGender === 'female' && this.npcData && this.npcData.names_female && this.npcData.names_female.length > 0) {
            npcName = this.npcData.names_female[Math.floor(Math.random() * this.npcData.names_female.length)];
        } else {
            const possibleNames = ['Lucas', 'Sofia', 'Mateus', 'Julia', 'Pedro', 'Beatriz', 'Arthur', 'Alice', 'Enzo', 'Laura', 'Gabriel', 'Manuela'];
            npcName = possibleNames[Math.floor(Math.random() * possibleNames.length)];
        }

        // Generate Visual State
        const state = {
            skinColor: ['#ffdbac', '#f1c27d', '#e0ac69', '#8d5524', '#c68642', '#3d2314'][Math.floor(Math.random() * 6)]
        };

        ['body', 'hair', 'torso', 'legs', 'feet'].forEach(part => {
            const count = this.assets.walk && this.assets.walk[part] ? this.assets.walk[part].length : 0;
            const index = count > 0 ? Math.floor(Math.random() * count) : 0;
            const color = (part !== 'body') ? '#' + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0') : null;
            state[part] = { index, color };
        });

        // Smart Spawning logic to avoid Y overlapping
        let py = 400 + Math.random() * 100;
        let dir = Math.random() > 0.5 ? 2 : 3;
        let px = dir === 2 ? -50 - Math.random() * 100 : 2050 + Math.random() * 100;

        // Ensure new spawn doesn't land exactly on someone else's Y track
        if (existingNpcs && existingNpcs.length > 0) {
            let overlapping = true;
            let attempts = 0;
            while (overlapping && attempts < 10) {
                overlapping = existingNpcs.some(n => Math.abs(n.y - py) < 30 && Math.abs(n.x - px) < 100);
                if (overlapping) {
                    py = 400 + Math.random() * 100;
                    px = dir === 2 ? -50 - Math.random() * 150 : 2050 + Math.random() * 150;
                }
                attempts++;
            }
        }

        return {
            id: Math.random(),
            name: npcName,
            gender: npcGender,
            orientation: npcOrientation,
            friendship: 0,
            romanced: false,
            recentTopics: [],
            contactAdded: false,
            interests: npcInterests,
            isPaused: false,
            x: px,
            y: py, // Walk along street pavement
            speed: 1 + Math.random() * 1.5,
            direction: dir, // 2 = Right, 3 = Left
            frame: 0,
            animTimer: 0,
            face: { pendingType: null, isAnimating: false, currentFrame: 0, type: 'static', cycles: 0 },
            chatBubble: null,
            state: state
        };
    }

    // Helper to evaluate collisions against an array of bounding boxes: {x, y, w, h}
    // Character represents a point near the bottom of their sprite (their feet).
    checkCollisions(nx, ny, boxes) {
        // We'll give the player a small footprint box (e.g. 30px wide, 10px tall)
        const pw = 30;
        const ph = 10;
        const px = nx - pw / 2;
        const py = ny - ph;

        for (let box of boxes) {
            if (px < box.x + box.w &&
                px + pw > box.x &&
                py < box.y + box.h &&
                py + ph > box.y) {
                return true; // Collision detected
            }
        }
        return false;
    }

    update(dt) {
        let dx = 0;
        let dy = 0;

        if (this.keys.w || this.keys.ArrowUp) dy -= 1;
        if (this.keys.s || this.keys.ArrowDown) dy += 1;
        if (this.keys.a || this.keys.ArrowLeft) dx -= 1;
        if (this.keys.d || this.keys.ArrowRight) dx += 1;

        if (dx !== 0 || dy !== 0) {
            if (!this.isMenuOpen) {
                this.player.isMoving = true;

                // Normalize diagonal movement
                const length = Math.sqrt(dx * dx + dy * dy);
                dx /= length;
                dy /= length;

                const newX = this.player.x + dx * this.player.speed;
                const newY = this.player.y + dy * this.player.speed;

                // Determine hitboxes based on current room
                let hitboxes = [];
                if (this.currentRoom === 'bedroom') {
                    hitboxes = [
                        { x: 180, y: 150, w: 100, h: 30 }, // Wardrobe base (drawn at y:150ish bottom)
                        { x: 480, y: 100, w: 120, h: 80 }, // Desk
                        { x: 300, y: 150, w: 140, h: 130 } // Bed (fixed hitbox to avoid top bypass)
                    ];
                } else if (this.currentRoom === 'livingroom') {
                    hitboxes = [
                        { x: 280, y: 170, w: 240, h: 40 }, // TV Stand
                        { x: 250, y: 320, w: 300, h: 80 }  // Sofa
                    ];
                } else if (this.currentRoom === 'bathroom') {
                    hitboxes = [
                        { x: 320, y: 110, w: 160, h: 40 }, // Sink area
                        { x: 240, y: 120, w: 50, h: 40 },  // Toilet
                        { x: 600, y: 130, w: 150, h: 50 }  // Shower base
                    ];
                } else if (this.currentRoom === 'kitchen') {
                    hitboxes = [
                        { x: 80, y: 160, w: 300, h: 40 }, // Counters/Sink/Stove base
                        { x: 450, y: 160, w: 80, h: 40 }, // Fridge base
                        { x: 250, y: 350, w: 160, h: 80 } // Dining table
                    ];
                } else if (this.currentRoom === 'street') {
                    // Prevent walking into buildings
                    hitboxes = [
                        { x: 0, y: 0, w: this.canvas.width, h: 140 } // Upper buildings edge (sidewalk is y>140)
                    ];
                    // Tree trunk
                    hitboxes.push({ x: 600, y: 140, w: 20, h: 20 });

                    // Foot-based Collision boxes for NPCs
                    // This creates a physical 40x20 pixel barrier at the NPC's feet.
                    // The player cannot physically walk through this, preventing clipping.
                    this.npcs.forEach(npc => {
                        hitboxes.push({ x: npc.x - 20, y: npc.y - 10, w: 40, h: 20 });
                    });
                }

                // Apply X movement if no collision
                if (!this.checkCollisions(newX, this.player.y, hitboxes)) {
                    this.player.x = newX;
                }
                // Apply Y movement if no collision
                if (!this.checkCollisions(this.player.x, newY, hitboxes)) {
                    this.player.y = newY;
                }

                // Update Direction based on dominant movement
                if (Math.abs(dx) > Math.abs(dy)) {
                    this.player.direction = dx > 0 ? 2 : 3; // Right : Left
                } else {
                    this.player.direction = dy > 0 ? 0 : 1; // Down : Up
                }
            }
        } else {
            this.player.isMoving = false;
            // Remove frame lock to allow idle animation
            // Remove idle lock
        }

        // Set map boundaries based on room
        if (this.currentRoom === 'street') {
            this.mapBounds.width = 2400;
        } else {
            this.mapBounds.width = 800; // standard room width
        }

        // Clamp player to map bounds (Floor is y > 200, char heights are from bottom)
        this.player.x = Math.max(24, Math.min(this.mapBounds.width - 24, this.player.x));
        this.player.y = Math.max(220, Math.min(this.mapBounds.height - 20, this.player.y));

        // Update Camera Position (Follow player, but clamp to map bounds)
        let camX = this.player.x - this.canvas.width / 2;
        let camY = this.player.y - this.canvas.height / 2;

        // Ensure we don't show areas outside the map boundaries
        if (this.canvas.width >= this.mapBounds.width) {
            camX = -(this.canvas.width - this.mapBounds.width) / 2;
        } else {
            camX = Math.max(0, Math.min(camX, this.mapBounds.width - this.canvas.width));
        }

        if (this.canvas.height >= this.mapBounds.height) {
            camY = -(this.canvas.height - this.mapBounds.height) / 2;
        } else {
            camY = Math.max(0, Math.min(camY, this.mapBounds.height - this.canvas.height));
        }

        this.camera.x = camX;
        this.camera.y = camY;

        // Animation Timer
        const fps = this.player.isMoving ? 6 : 3; // 6 for Walk, 3 for Idle
        this.player.animTimer += dt;

        if (this.player.animTimer > (1000 / fps)) {
            // Always cycle frame, whether walking or idle
            this.player.frame = (this.player.frame + 1) % 4;

            // Face animation logic
            if (this.player.frame === 0 && this.player.face.pendingType) {
                this.player.face.type = this.player.face.pendingType;
                this.player.face.isAnimating = true;
                if (!this.player.face.cycles) this.player.face.cycles = 1;
                this.player.face.currentCycle = 0;
                this.player.face.pendingType = null;
            } else if (this.player.face.isAnimating && this.player.face.type !== 'static') {
                if (this.player.frame === 0) { // Cycle completed
                    const isCritical = this.stats.health <= 5 || this.stats.hunger <= 5 || this.stats.hygiene <= 5 || this.stats.bladder <= 5;
                    this.player.face.currentCycle = (this.player.face.currentCycle || 0) + 1;
                    let targetCycles = this.player.face.cycles || 1;

                    if (this.player.face.currentCycle >= targetCycles) {
                        if (!(this.player.face.type === 'tired' && isCritical)) {
                            this.player.face.isAnimating = false;
                            this.player.face.type = isCritical ? 'tired' : 'static';
                            this.player.face.cycles = 1;
                            if (isCritical) {
                                this.player.face.isAnimating = true;
                            }
                        }
                    }
                }
            } else if (!this.player.face.isAnimating) {
                // Determine base idle face
                const isCritical = this.stats.health <= 5 || this.stats.hunger <= 5 || this.stats.hygiene <= 5 || this.stats.bladder <= 5;
                const newBaseFace = isCritical ? 'tired' : 'static';

                if (this.player.face.type !== newBaseFace && !this.player.face.pendingType) {
                    this.player.face.type = newBaseFace;
                }

                // Whenever base face is tired, strictly ensure it's animating
                if (this.player.face.type === 'tired' && !this.player.face.pendingType && isCritical) {
                    this.player.face.isAnimating = true;
                }
            }

            this.player.animTimer -= (1000 / fps);
        }

        // Proximity detection for doors based on current room
        this.nearDoor = null;

        if (this.currentRoom === 'bedroom') {
            // Exit Door: X around 80-160, Y near 220
            // Bathroom Door: X around 640-720, Y near 220
            if (this.player.y < 250) {
                if (this.player.x > 60 && this.player.x < 180) {
                    this.nearDoor = 'exit_bedroom';
                } else if (this.player.x > 620 && this.player.x < 740) {
                    this.nearDoor = 'bathroom';
                } else if (this.player.x >= 180 && this.player.x <= 280) {
                    this.nearDoor = 'obj_wardrobe'; // Wardrobe X: 180-280
                } else if (this.player.x >= 480 && this.player.x <= 600) {
                    this.nearDoor = 'obj_computer'; // Desk/PC X: 480-600
                }
            } else if (this.player.y >= 250 && this.player.y <= 360) {
                if (this.player.x >= 300 && this.player.x <= 440) {
                    this.nearDoor = 'obj_bed'; // Bed X: 300-440 Y: 250-360
                }
            }
        } else if (this.currentRoom === 'livingroom') {
            // Bedroom Door: X around 80-160, Y near 220
            if (this.player.y < 250) {
                if (this.player.x > 60 && this.player.x < 180) {
                    this.nearDoor = 'enter_bedroom';
                } else if (this.player.x >= 280 && this.player.x <= 520) {
                    this.nearDoor = 'obj_tv'; // TV X: 280-520
                }
            }
            // Kitchen transition on the far left
            if (this.player.x < 50) {
                this.nearDoor = 'enter_kitchen';
            }
            // Street transition on the far right
            if (this.player.x > 750) {
                this.nearDoor = 'enter_street';
            }
        } else if (this.currentRoom === 'bathroom') {
            // Exit Bathroom Door: X around 360-440, Y near bottom 580
            if (this.player.y > 450) {
                if (this.player.x > 340 && this.player.x < 460) {
                    this.nearDoor = 'exit_bathroom';
                }
            } else if (this.player.y < 250) {
                if (this.player.x >= 130 && this.player.x <= 230) {
                    this.nearDoor = 'obj_toilet'; // Toilet X: 150-210
                } else if (this.player.x >= 310 && this.player.x <= 490) {
                    this.nearDoor = 'obj_sink_bath'; // Sink X: 330-470
                } else if (this.player.x >= 530 && this.player.x <= 750) {
                    this.nearDoor = 'obj_shower'; // Shower X: 550-750
                }
            }
        } else if (this.currentRoom === 'kitchen') {
            // Exit Kitchen to Living Room on the far right
            if (this.player.x > 750) {
                this.nearDoor = 'exit_kitchen';
            } else if (this.player.y < 250) {
                if (this.player.x >= 100 && this.player.x <= 160) {
                    this.nearDoor = 'obj_stove';
                } else if (this.player.x > 160 && this.player.x <= 380) {
                    this.nearDoor = 'obj_sink_kitchen'; // sink and counter
                } else if (this.player.x >= 450 && this.player.x <= 530) {
                    this.nearDoor = 'obj_fridge';
                }
            } else if (this.player.y >= 350 && this.player.y <= 450) {
                if (this.player.x >= 230 && this.player.x <= 430) {
                    this.nearDoor = 'obj_table';
                }
            }
        } else if (this.currentRoom === 'street') {
            // Exit Street to Living Room on the far left
            if (this.player.x < 100) {
                this.nearDoor = 'exit_street';
            } else if (this.player.y < 380) { // Near the top edge of the sidewalk buildings
                if (this.player.x >= 200 && this.player.x <= 300) {
                    this.nearDoor = 'obj_diner';
                } else if (this.player.x >= 400 && this.player.x <= 500) {
                    this.nearDoor = 'obj_clothing_store';
                } else if (this.player.x >= 600 && this.player.x <= 700) {
                    this.nearDoor = 'enter_coffee_shop';
                } else if (this.player.x >= 800 && this.player.x <= 900) {
                    this.nearDoor = 'enter_gym';
                } else if (this.player.x >= 1000 && this.player.x <= 1100) {
                    this.nearDoor = 'enter_grocery';
                }
            } else if (this.player.y > 520 && this.player.x > 300 && this.player.x < 600) {
                // Approximate plaza area
                this.nearDoor = 'enter_plaza';
            }
        } else if (this.currentRoom === 'coffee_shop') {
            if (this.player.y > 500 && this.player.x > 300 && this.player.x < 500) {
                this.nearDoor = 'exit_coffee_shop';
            }
        } else if (this.currentRoom === 'gym') {
            if (this.player.y > 500 && this.player.x > 350 && this.player.x < 450) {
                this.nearDoor = 'exit_gym';
            }
        } else if (this.currentRoom === 'plaza') {
            if (this.player.y < 100 && this.player.x > 350 && this.player.x < 450) {
                this.nearDoor = 'exit_plaza';
            }
        } else if (this.currentRoom === 'grocery') {
            if (this.player.y > 500 && this.player.x > 350 && this.player.x < 450) {
                this.nearDoor = 'exit_grocery';
            }
        }

        // Update NPCs and proximity
        if (this.currentRoom === 'street') {
            let closestNpc = null;
            let minDistance = 70; // Interaction radius (X axis)

            // 1. Find the single closest NPC to prompt interaction
            // Only consider NPCs that are physically sharing the same Y-lane as the player
            this.npcs.forEach(npc => {
                const yDiff = Math.abs(this.player.y - npc.y);
                const xDiff = Math.abs(this.player.x - npc.x);

                if (yDiff <= 20 && xDiff < minDistance) {
                    minDistance = xDiff;
                    closestNpc = npc;
                }
            });

            // 2. Handle all NPCs
            this.npcs.forEach(npc => {
                // Determine if this specific NPC is the one currently engaging the player
                const isEngaged = (npc === closestNpc);

                if (isEngaged && !this.currentDialoguingNpcId) {
                    this.nearDoor = `npc_${npc.id}`;
                    if (!npc.isNearPlayer) { // Just entered proximity
                        npc.isNearPlayer = true;
                        if (npc.direction !== 0 && npc.direction !== 1) {
                            npc.originalDirection = npc.direction;
                        }
                        npc.direction = 0; // Face camera
                        npc.frame = 1;     // Idle static frame
                    }
                } else {
                    // Either not the closest, or we walked away
                    if (npc.isNearPlayer && !npc.isPaused) {
                        npc.isNearPlayer = false;
                        if (npc.originalDirection !== undefined) {
                            npc.direction = npc.originalDirection; // Resume walking
                        }
                    }
                }

                // Remove interaction prompt if no one is close or if currently in dialogue
                if (!closestNpc && !this.currentDialoguingNpcId) {
                    // Prevent clearing if we are looking at a door
                    if (this.nearDoor && this.nearDoor.startsWith('npc_')) {
                        this.nearDoor = null;
                    }
                }

                // Always animate the frames (so they breathe/bounce when idle too)
                const fps = (npc.isPaused || npc.isNearPlayer) ? 4 : 6;
                npc.animTimer += dt;
                if (npc.animTimer > (1000 / fps)) {
                    npc.frame = (npc.frame + 1) % 4;

                    // Face animation logic for NPCs
                    if (npc.frame === 0 && npc.face.pendingType) {
                        npc.face.type = npc.face.pendingType;
                        npc.face.isAnimating = true;
                        if (!npc.face.cycles) npc.face.cycles = 1;
                        npc.face.currentCycle = 0;
                        npc.face.pendingType = null;
                    } else if (npc.face.isAnimating && npc.face.type !== 'static') {
                        if (npc.frame === 0) { // Cycle completed
                            npc.face.currentCycle = (npc.face.currentCycle || 0) + 1;
                            let targetCycles = npc.face.cycles || 1;
                            if (npc.face.currentCycle >= targetCycles) {
                                npc.face.isAnimating = false;
                                npc.face.type = 'static';
                                npc.face.cycles = 1;
                            }
                        }
                    }

                    npc.animTimer -= (1000 / fps);
                }

                // Only move and dodge if not engaging the player and not in the modal
                if (!npc.isPaused && !npc.isNearPlayer) {

                    // Simple Dodging/Collision logic for walking NPCs
                    // They check if moving forward will hit the player or another NPC
                    let nextX = npc.x + (npc.direction === 2 ? npc.speed : (npc.direction === 3 ? -npc.speed : 0));

                    let willCollide = false;
                    let emergencyStopX = false;
                    let dodgeDirY = 0;

                    // Feature: Directional Field of View Dodging

                    // Check hitting player
                    let diffXPlayer = this.player.x - npc.x;
                    let facingPlayer = (npc.direction === 2 && diffXPlayer > 0) || (npc.direction === 3 && diffXPlayer < 0);

                    if (facingPlayer && Math.abs(npc.y - this.player.y) < 30 && Math.abs(diffXPlayer) < 120) {
                        willCollide = true;
                        // Determine which way is easiest to step out of the lane
                        dodgeDirY = npc.y >= this.player.y ? 1 : -1;
                        if (Math.abs(diffXPlayer) < 50) emergencyStopX = true;
                    }

                    // Check hitting other NPCs
                    if (!willCollide) {
                        for (let other of this.npcs) {
                            if (other !== npc) {
                                let diffXOther = other.x - npc.x;
                                let facingOther = (npc.direction === 2 && diffXOther > 0) || (npc.direction === 3 && diffXOther < 0);
                                if (facingOther && Math.abs(npc.y - other.y) < 30 && Math.abs(diffXOther) < 120) {
                                    willCollide = true;
                                    dodgeDirY = npc.y >= other.y ? 1 : -1;
                                    if (Math.abs(diffXOther) < 50) emergencyStopX = true;
                                    break;
                                }
                            }
                        }
                    }

                    if (willCollide) {
                        // Slide smoothly away from the collision center
                        npc.y += dodgeDirY * npc.speed * 1.5;

                        // Keep within Sidewalk Bounds
                        if (npc.y < 350) npc.y = 350;
                        if (npc.y > 600) npc.y = 600;

                        // We still let them slowly move forward while dodging, unless they are too close
                        if (!emergencyStopX) {
                            npc.x += (npc.direction === 2 ? npc.speed * 0.3 : (npc.direction === 3 ? -npc.speed * 0.3 : 0));
                        }
                    } else {
                        // Free to move normally
                        if (npc.direction === 2) {
                            npc.x += npc.speed;
                            if (npc.x > this.mapBounds.width + 100) {
                                if (npc.contactAdded || npc.friendship > 0 || npc.romanced) {
                                    npc.x = -100;
                                } else {
                                    Object.assign(npc, this.generateNPC(this.npcs));
                                }
                            }
                        } else if (npc.direction === 3) {
                            npc.x -= npc.speed;
                            if (npc.x < -100) {
                                if (npc.contactAdded || npc.friendship > 0 || npc.romanced) {
                                    npc.x = this.mapBounds.width + 100;
                                } else {
                                    Object.assign(npc, this.generateNPC(this.npcs));
                                }
                            }
                        }
                    }
                }
            });
        }

        // CRITICAL: Call updateDoorMenu AFTER all nearDoor updates are completely calculated
        this.updateDoorMenu();

        this.updateStats(dt);
    }

    updateStats(dt) {
        this.statsTimer += dt;
        if (this.statsTimer >= 1000) { // Every real second
            this.statsTimer -= 1000;

            // Time passes (1 in-game minute per real second)
            this.stats.time += 1;
            if (this.stats.time >= 24 * 60) this.stats.time -= 24 * 60;

            // Stats decrease over time
            this.stats.hunger = Math.max(0, this.stats.hunger - 0.5); // Loses 100% in 200 seconds
            this.stats.hygiene = Math.max(0, this.stats.hygiene - 0.2); // Slower
            this.stats.bladder = Math.max(0, this.stats.bladder - 0.4); // Medium drop
            this.stats.health = Math.max(0, this.stats.health - 0.1); // Health decreases naturally

            // Extra health penalty if needs are low
            if (this.stats.hunger < 20 || this.stats.hygiene < 20 || this.stats.bladder < 20) {
                this.stats.health = Math.max(0, this.stats.health - 0.5);
            }

            this.updateStatsUI();
        }
    }

    updateStatsUI() {
        const hours = Math.floor(this.stats.time / 60).toString().padStart(2, '0');
        const mins = Math.floor(this.stats.time % 60).toString().padStart(2, '0');

        const elTime = document.getElementById('stat-time');
        const elHealth = document.getElementById('stat-health');
        const elHunger = document.getElementById('stat-hunger');
        const elHygiene = document.getElementById('stat-hygiene');
        const elBladder = document.getElementById('stat-bladder');
        const elMoney = document.getElementById('stat-money');

        const isWardrobeOpen = document.getElementById('modal-wardrobe')?.style.display === 'flex';
        const isStoreOpen = document.getElementById('modal-store')?.style.display === 'flex';
        const isProfileOpen = document.getElementById('modal-profile')?.style.display === 'flex';
        const isSmartphoneOpen = document.getElementById('modal-smartphone')?.style.display === 'flex';
        const isComputerOpen = document.getElementById('modal-computer')?.style.display === 'flex';

        if (this.isMenuOpen || isWardrobeOpen || isStoreOpen || isProfileOpen || isSmartphoneOpen || isComputerOpen) return;
        if (elTime) elTime.innerText = `${hours}:${mins}`;
        if (elHealth) elHealth.innerText = `${Math.floor(this.stats.health)}%`;
        if (elHunger) elHunger.innerText = `${Math.floor(this.stats.hunger)}%`;
        if (elHygiene) elHygiene.innerText = `${Math.floor(this.stats.hygiene)}%`;
        if (elBladder) elBladder.innerText = `${Math.floor(this.stats.bladder)}%`;
        if (elMoney) elMoney.innerText = `$${this.stats.money}`;

        // Change colors if critical
        if (elHealth) elHealth.style.color = this.stats.health < 30 ? '#ff0000' : '#ff6b6b';
        if (elHunger) elHunger.style.color = this.stats.hunger < 30 ? '#ff0000' : '#feca57';
        if (elHygiene) elHygiene.style.color = this.stats.hygiene < 30 ? '#ff0000' : '#48dbfb';
        if (elBladder) elBladder.style.color = this.stats.bladder < 30 ? '#ff0000' : '#f1c40f';
    }

    updateDoorMenu() {
        const menu = document.getElementById('door-interaction-menu');
        if (!menu) return;

        if (!this.nearDoor) {
            menu.style.display = 'none';
            return;
        }

        // If it's an NPC and their smartwatch dialogue is OPEN, hide the prompt
        if (this.nearDoor.startsWith('npc_') && this.dialogueState && this.dialogueState.isOpen) {
            menu.style.display = 'none';
            return;
        }

        // Show HUD
        const canvasRect = this.canvas.getBoundingClientRect();
        const parentRect = this.canvas.parentElement.getBoundingClientRect();
        const offsetX = canvasRect.left - parentRect.left;
        const offsetY = canvasRect.top - parentRect.top;

        // Base entity position
        let entityX = this.player.x;
        let entityY = this.player.y - 120; // Above player head by default

        if (this.nearDoor.startsWith('npc_')) {
            const npcId = parseInt(this.nearDoor.split('_')[1]);
            const npc = this.npcs.find(n => n.id === npcId);
            if (npc) {
                entityX = npc.x;
                entityY = npc.y - 130;
            }
        }

        const px = offsetX + entityX - this.camera.x;
        const py = offsetY + entityY - this.camera.y;

        menu.style.display = 'block';
        menu.style.left = `${px}px`;
        menu.style.top = `${py}px`;
        menu.style.transform = `translate(-50%, -100%)`; // Bottom-anchored center

        // Dynamic Text
        const btn = document.getElementById('btn-door-go');
        if (this.nearDoor.startsWith('npc_')) {
            btn.innerText = 'Falar (Enter)';
        } else if (this.nearDoor.startsWith('obj_')) {
            btn.innerText = 'Interagir (Enter)';
        } else {
            btn.innerText = 'Ir (Enter)';
        }
    }

    drawEnvironment() {
        this.ctx.save();
        this.ctx.translate(-this.camera.x, -this.camera.y);

        if (this.currentRoom === 'bedroom') {
            this.drawBedroom();
        } else if (this.currentRoom === 'livingroom') {
            this.drawLivingRoom();
        } else if (this.currentRoom === 'bathroom') {
            this.drawBathroom();
        } else if (this.currentRoom === 'kitchen') {
            this.drawKitchen();
        } else if (this.currentRoom === 'street') {
            this.drawStreet();
        } else if (this.currentRoom === 'coffee_shop') {
            this.drawCoffeeShop();
        } else if (this.currentRoom === 'gym') {
            this.drawGym();
        } else if (this.currentRoom === 'plaza') {
            this.drawPlaza();
        } else if (this.currentRoom === 'grocery') {
            this.drawGroceryStore();
        }

        this.ctx.restore();
    }

    drawBedroom() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Back Wall
        this.ctx.fillStyle = '#a2c4c9'; // Light teal wallpaper
        this.ctx.fillRect(0, 0, w, 180);

        // Baseboard
        this.ctx.fillStyle = '#f4f4f4';
        this.ctx.fillRect(0, 180, w, 20);

        // Floor (Wooden Planks)
        this.ctx.fillStyle = '#cd853f'; // Peru brown floor
        this.ctx.fillRect(0, 200, w, h - 200);

        // Wood lines
        this.ctx.strokeStyle = '#a0522d'; // Sienna lines
        this.ctx.lineWidth = 1;
        for (let i = 0; i < w; i += 40) {
            this.ctx.beginPath();
            this.ctx.moveTo(i, 200);
            this.ctx.lineTo(i, h);
            this.ctx.stroke();
        }

        // --- DOORS ---
        const doorWidth = 80;
        const doorHeight = 150;

        // Door 1 (Exit) - Left side
        const exitX = 80;
        const exitY = 50;

        // Frame
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(exitX - 5, exitY - 5, doorWidth + 10, doorHeight + 5);
        // Door
        this.ctx.fillStyle = '#deb887'; // Burlywood
        this.ctx.fillRect(exitX, exitY, doorWidth, doorHeight);
        // Knob
        this.ctx.fillStyle = '#ffd700';
        this.ctx.beginPath();
        this.ctx.arc(exitX + doorWidth - 12, exitY + doorHeight / 2, 5, 0, Math.PI * 2);
        this.ctx.fill();
        // Label
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("SALA", exitX + doorWidth / 2, exitY - 10);

        // Door 2 (Bathroom) - Right side
        const bathX = 640;
        const bathY = 50;

        // Frame
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(bathX - 5, bathY - 5, doorWidth + 10, doorHeight + 5);
        // Door
        this.ctx.fillStyle = '#87cefa'; // LightSkyBlue
        this.ctx.fillRect(bathX, bathY, doorWidth, doorHeight);
        // Knob
        this.ctx.fillStyle = '#c0c0c0';
        this.ctx.beginPath();
        this.ctx.arc(bathX + 12, bathY + doorHeight / 2, 5, 0, Math.PI * 2); // Knob on left side for variety
        this.ctx.fill();
        // Label
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("BANHEIRO", bathX + doorWidth / 2, bathY - 10);

        // --- DECOR ---
        // Rug
        this.ctx.fillStyle = '#6b8e23'; // Olive Drab
        this.ctx.beginPath();
        this.ctx.ellipse(this.canvas.width / 2, 380, 160, 60, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Wardrobe
        this.ctx.fillStyle = '#8b4513'; // Saddle brown
        this.ctx.fillRect(180, 30, 100, 150);
        this.ctx.fillStyle = '#a0522d'; // Sienna doors
        this.ctx.fillRect(185, 40, 40, 130);
        this.ctx.fillRect(235, 40, 40, 130);
        this.ctx.fillStyle = '#ffd700'; // Knobs
        this.ctx.fillRect(220, 100, 4, 15);
        this.ctx.fillRect(236, 100, 4, 15);

        // Desk
        this.ctx.fillStyle = '#cd853f'; // Desk color
        this.ctx.fillRect(480, 130, 120, 50);
        // PC Screen
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(510, 100, 60, 40);
        // PC Screen inner
        this.ctx.fillStyle = '#4169e1'; // Royal blue screen
        this.ctx.fillRect(515, 105, 50, 30);
        // PC Base
        this.ctx.fillStyle = '#333';
        this.ctx.fillRect(530, 140, 20, 10);
        // Keyboard
        this.ctx.fillStyle = '#ddd';
        this.ctx.fillRect(515, 160, 50, 15);

        // Double Bed
        this.ctx.fillStyle = '#8b4513'; // Bed frame headboard
        this.ctx.fillRect(300, 80, 140, 100);
        // Mattress
        this.ctx.fillStyle = '#f0f8ff'; // Alice blue
        this.ctx.fillRect(310, 130, 120, 150);
        // Blanket
        this.ctx.fillStyle = '#ff69b4'; // Hot pink blanket
        this.ctx.fillRect(310, 180, 120, 100);
        // Pillows
        this.ctx.fillStyle = '#fffafa';
        this.ctx.fillRect(320, 140, 45, 25);
        this.ctx.fillRect(375, 140, 45, 25);
    }

    drawLivingRoom() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Back Wall
        this.ctx.fillStyle = '#f5e6d3'; // Beige wallpaper
        this.ctx.fillRect(0, 0, w, 180);

        // Baseboard
        this.ctx.fillStyle = '#3e2723';
        this.ctx.fillRect(0, 180, w, 20);

        // Floor (Carpet)
        this.ctx.fillStyle = '#8d6e63';
        this.ctx.fillRect(0, 200, w, h - 200);

        // --- TRANSITION ZONE (LEFT END) ---
        // Archway to Kitchen
        this.ctx.fillStyle = '#f4f4f4';
        this.ctx.fillRect(0, 20, 40, 180);
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'left';
        this.ctx.fillText("COZINHA", 10, 100);

        // --- TRANSITION ZONE (RIGHT END) ---
        // Door to Street
        const streetDoorX = this.canvas.width - 60;
        this.ctx.fillStyle = '#a0522d'; // Sienna door
        this.ctx.fillRect(streetDoorX, 50, 60, 150);
        this.ctx.fillStyle = '#ffd700'; // Knob
        this.ctx.beginPath();
        this.ctx.arc(streetDoorX + 15, 125, 5, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText("RUA", streetDoorX + 50, 40);

        // --- DOORS ---
        const doorWidth = 80;
        const doorHeight = 150;

        // Door back to Bedroom - Left side
        const bedX = 80;
        const bedY = 50;

        // Frame
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(bedX - 5, bedY - 5, doorWidth + 10, doorHeight + 5);
        // Door
        this.ctx.fillStyle = '#deb887'; // Burlywood
        this.ctx.fillRect(bedX, bedY, doorWidth, doorHeight);
        // Knob
        this.ctx.fillStyle = '#ffd700';
        this.ctx.beginPath();
        this.ctx.arc(bedX + doorWidth - 12, bedY + doorHeight / 2, 5, 0, Math.PI * 2);
        this.ctx.fill();
        // Label
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("QUARTO", bedX + doorWidth / 2, bedY - 10);

        // --- LIVING ROOM DECOR ---
        // TV
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(300, 60, 200, 110);
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(310, 70, 180, 90);
        // TV Stand
        this.ctx.fillStyle = '#5c4033'; // Dark brown
        this.ctx.fillRect(280, 170, 240, 40);

        // Sofa
        this.ctx.fillStyle = '#8b0000'; // Dark red sofa
        this.ctx.fillRect(250, 320, 300, 80);
        // Cushions
        this.ctx.fillStyle = '#a52a2a';
        this.ctx.fillRect(260, 310, 135, 40);
        this.ctx.fillRect(405, 310, 135, 40);

        // Rug
        this.ctx.fillStyle = '#ffdead'; // Navajo white rug
        this.ctx.beginPath();
        this.ctx.ellipse(400, 280, 200, 70, 0, 0, Math.PI * 2);
        this.ctx.fill();
    }

    drawBathroom() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Back Wall (Tiles)
        this.ctx.fillStyle = '#e0f7fa';
        this.ctx.fillRect(0, 0, w, 180);
        this.ctx.strokeStyle = '#b2ebf2';
        for (let i = 0; i < w; i += 20) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 0); this.ctx.lineTo(i, 180); this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.moveTo(0, i); this.ctx.lineTo(w, i); this.ctx.stroke();
        }

        // Baseboard
        this.ctx.fillStyle = '#006064';
        this.ctx.fillRect(0, 180, w, 20);

        // Floor (Dark Tiles)
        this.ctx.fillStyle = '#263238';
        this.ctx.fillRect(0, 200, w, h - 200);
        this.ctx.strokeStyle = '#37474f';
        for (let i = 0; i < w; i += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 200); this.ctx.lineTo(i, h); this.ctx.stroke();
            this.ctx.beginPath(); this.ctx.moveTo(0, 200 + i); this.ctx.lineTo(w, 200 + i); this.ctx.stroke();
        }
        // Mirror
        this.ctx.fillStyle = '#87cefa';
        this.ctx.fillRect(350, 40, 100, 70);
        this.ctx.strokeStyle = '#c0c0c0';
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(350, 40, 100, 70);

        // Sink
        this.ctx.fillStyle = '#f8f8ff';
        this.ctx.fillRect(330, 140, 140, 60);
        this.ctx.fillStyle = '#dcdcdc';
        this.ctx.beginPath();
        this.ctx.ellipse(400, 160, 40, 20, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Toilet
        this.ctx.fillStyle = '#f8f8ff';
        this.ctx.fillRect(150, 120, 60, 80);
        this.ctx.beginPath();
        this.ctx.ellipse(180, 210, 30, 40, 0, 0, Math.PI * 2);
        this.ctx.fill();

        // Bath tub
        this.ctx.fillStyle = '#f8f8ff';
        this.ctx.fillRect(550, 80, 200, 120);
        this.ctx.strokeStyle = '#b0c4de';
        this.ctx.strokeRect(560, 90, 180, 100);

        // --- EXIT DOOR ---
        // Door back to bedroom (at the bottom of the screen)
        const doorWidth = 80;
        const doorHeight = 20;
        const exitX = 360;
        const exitY = this.canvas.height - doorHeight;

        this.ctx.fillStyle = '#deb887'; // Burlywood
        this.ctx.fillRect(exitX, exitY, doorWidth, doorHeight);
        // Label mapped to floor
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("QUARTO", exitX + doorWidth / 2, exitY - 5);
    }

    drawKitchen() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Back Wall (Paint + Backsplash)
        this.ctx.fillStyle = '#fff9c4'; // Pale yellow wall
        this.ctx.fillRect(0, 0, w, 120);

        this.ctx.fillStyle = '#ffe082'; // Light orange backsplash tiles
        this.ctx.fillRect(0, 120, w, 60);

        // Baseboard
        this.ctx.fillStyle = '#e65100';
        this.ctx.fillRect(0, 180, w, 20);

        // Floor (Linoleum/Checkerboard)
        this.ctx.fillStyle = '#fafafa';
        this.ctx.fillRect(0, 200, w, h - 200);
        this.ctx.fillStyle = '#bdbdbd';
        for (let y = 200; y < h; y += 40) {
            for (let x = 0; x < w; x += 40) {
                if (((x + y) / 40) % 2 === 0) {
                    this.ctx.fillRect(x, y, 40, 40);
                }
            }
        }

        // --- KITCHEN DECOR ---

        // Window
        this.ctx.fillStyle = '#87ceeb'; // Sky blue
        this.ctx.fillRect(350, 40, 120, 80);
        this.ctx.strokeStyle = '#fff'; // Window frame
        this.ctx.lineWidth = 4;
        this.ctx.strokeRect(350, 40, 120, 80);
        this.ctx.beginPath();
        this.ctx.moveTo(410, 40); this.ctx.lineTo(410, 120);
        this.ctx.moveTo(350, 80); this.ctx.lineTo(470, 80);
        this.ctx.stroke();

        // Counters
        this.ctx.fillStyle = '#8b4513'; // Saddle brown cabinets
        this.ctx.fillRect(80, 120, 300, 80);
        this.ctx.fillStyle = '#dcdcdc'; // Marble-like countertop
        this.ctx.fillRect(75, 115, 310, 15);

        // Cabinet doors
        this.ctx.strokeStyle = '#a0522d';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(90, 140, 60, 50);
        this.ctx.strokeRect(160, 140, 60, 50);
        this.ctx.strokeRect(230, 140, 60, 50);
        this.ctx.strokeRect(300, 140, 60, 50);

        // Sink
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(240, 110, 50, 10);
        this.ctx.fillStyle = '#c0c0c0'; // Faucet
        this.ctx.fillRect(260, 90, 10, 20);
        this.ctx.fillRect(260, 90, 20, 5);
        this.ctx.fillRect(280, 90, 5, 10);

        // Stove
        this.ctx.fillStyle = '#f5f5f5'; // White stove
        this.ctx.fillRect(100, 100, 60, 100);
        // Stove top
        this.ctx.fillStyle = '#111';
        this.ctx.fillRect(105, 100, 20, 10);
        this.ctx.fillRect(135, 100, 20, 10);
        // Oven glass
        this.ctx.fillStyle = '#222';
        this.ctx.fillRect(110, 130, 40, 40);

        // Fridge
        this.ctx.fillStyle = '#f8f8ff'; // Ghost white fridge
        this.ctx.fillRect(450, 20, 80, 180);
        this.ctx.strokeStyle = '#ccc';
        this.ctx.strokeRect(450, 20, 80, 180);
        this.ctx.beginPath();
        this.ctx.moveTo(450, 100); this.ctx.lineTo(530, 100); // Freezer split
        this.ctx.stroke();
        // Handles
        this.ctx.fillStyle = '#d3d3d3';
        this.ctx.fillRect(460, 50, 10, 30);
        this.ctx.fillRect(460, 110, 10, 40);

        // Dining Table
        this.ctx.fillStyle = '#deb887'; // Burlywood table
        this.ctx.fillRect(250, 350, 160, 80);
        // Chairs
        this.ctx.fillStyle = '#cd853f';
        this.ctx.fillRect(270, 320, 30, 30);
        this.ctx.fillRect(360, 320, 30, 30);
        this.ctx.fillRect(270, 430, 30, 30);
        this.ctx.fillRect(360, 430, 30, 30);

        // --- TRANSITION ZONE (RIGHT END) ---
        // We draw an invisible or explicit 'door' at the right
        const rectX = this.canvas.width - 40;
        this.ctx.fillStyle = '#f4f4f4';
        this.ctx.fillRect(rectX, 20, 40, 180); // Open archway approximation
        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'right';
        this.ctx.fillText("SALA", rectX + 30, 100);
    }

    drawCoffeeShop() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Wall
        this.ctx.fillStyle = '#d7ccc8';
        this.ctx.fillRect(0, 0, w, 180);
        // Floor
        this.ctx.fillStyle = '#3e2723';
        this.ctx.fillRect(0, 200, w, h - 200);

        // Counter
        this.ctx.fillStyle = '#5d4037';
        this.ctx.fillRect(100, 140, 250, 60);
        this.ctx.fillStyle = '#8d6e63';
        this.ctx.fillRect(100, 140, 250, 10);

        // Machines
        this.ctx.fillStyle = '#bdbdbd';
        this.ctx.fillRect(150, 100, 60, 40);
        this.ctx.fillStyle = '#212121';
        this.ctx.fillRect(160, 110, 10, 10);
        // Glasses
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(230, 120, 10, 20);
        this.ctx.fillRect(250, 120, 10, 20);

        // Tables
        const drawTable = (x, y) => {
            this.ctx.fillStyle = '#fff'; // Table covering
            this.ctx.beginPath();
            this.ctx.arc(x, y, 40, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.fillStyle = '#8d6e63'; // Chair
            this.ctx.fillRect(x - 50, y - 10, 20, 20);
            this.ctx.fillRect(x + 30, y - 10, 20, 20);
        };
        drawTable(500, 300);
        drawTable(650, 350);

        // Exit
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(w / 2 - 40, h - 20, 80, 20);
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("SAIR", w / 2, h - 5);
    }

    drawGym() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Wall
        this.ctx.fillStyle = '#cfd8dc';
        this.ctx.fillRect(0, 0, w, 180);
        // Mirrors
        this.ctx.fillStyle = '#e3f2fd';
        this.ctx.fillRect(50, 40, 300, 100);
        this.ctx.fillRect(450, 40, 300, 100);

        // Floor
        this.ctx.fillStyle = '#263238'; // Rubber floor
        this.ctx.fillRect(0, 200, w, h - 200);

        // Treadmills
        const drawTreadmill = (x, y) => {
            this.ctx.fillStyle = '#455a64';
            this.ctx.fillRect(x, y, 40, 120);
            this.ctx.fillStyle = '#111';
            this.ctx.fillRect(x + 5, y + 5, 30, 20);
        };
        drawTreadmill(100, 250);
        drawTreadmill(200, 250);
        drawTreadmill(300, 250);

        // Weights
        this.ctx.fillStyle = '#b0bec5';
        this.ctx.fillRect(600, 250, 100, 40);
        this.ctx.fillStyle = '#212121';
        this.ctx.beginPath();
        this.ctx.arc(580, 270, 20, 0, Math.PI * 2);
        this.ctx.arc(720, 270, 20, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillRect(580, 265, 140, 10);

        // Exit
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(w / 2 - 40, h - 20, 80, 20);
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("SAIR", w / 2, h - 5);
    }

    drawPlaza() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Background grass
        this.ctx.fillStyle = '#81c784';
        this.ctx.fillRect(0, 0, w, h);

        // Paved paths
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(350, 0, 100, h);
        this.ctx.fillRect(0, 250, w, 100);

        // Center Fountain
        this.ctx.fillStyle = '#607d8b';
        this.ctx.beginPath();
        this.ctx.arc(400, 300, 80, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#29b6f6';
        this.ctx.beginPath();
        this.ctx.arc(400, 300, 60, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(395, 260, 10, 40); // Water jet

        // Benches
        const drawBench = (x, y) => {
            this.ctx.fillStyle = '#8d6e63';
            this.ctx.fillRect(x, y, 60, 20);
        };
        drawBench(250, 200);
        drawBench(490, 200);
        drawBench(250, 380);
        drawBench(490, 380);

        // Trees
        const drawTree = (x, y) => {
            this.ctx.fillStyle = '#5d4037';
            this.ctx.fillRect(x, y, 20, 60);
            this.ctx.fillStyle = '#388e3c';
            this.ctx.beginPath();
            this.ctx.arc(x + 10, y - 10, 40, 0, Math.PI * 2);
            this.ctx.fill();
        }
        drawTree(100, 100);
        drawTree(600, 100);
        drawTree(150, 450);
        drawTree(650, 400);

        // Exit area
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.)'; // No bg needed for plaza exit
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 14px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("RUA (PARA BAIXO)", w / 2, h - 20);
    }

    drawGroceryStore() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Wall
        this.ctx.fillStyle = '#fffde7'; // Light yellow
        this.ctx.fillRect(0, 0, w, 180);

        // Floor
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(0, 200, w, h - 200);
        // Floor tiles
        this.ctx.strokeStyle = '#bdbdbd';
        for (let i = 0; i < w; i += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 200); this.ctx.lineTo(i, h); this.ctx.stroke();
        }
        for (let j = 200; j < h; j += 40) {
            this.ctx.beginPath(); this.ctx.moveTo(0, j); this.ctx.lineTo(w, j); this.ctx.stroke();
        }

        // Shelves
        const drawShelf = (x, y) => {
            this.ctx.fillStyle = '#eceff1';
            this.ctx.fillRect(x, y, 200, 40);
            this.ctx.fillStyle = '#90a4ae';
            this.ctx.fillRect(x, y + 10, 200, 5);
            this.ctx.fillRect(x, y + 25, 200, 5);
            // Items on shelf
            this.ctx.fillStyle = '#f44336'; this.ctx.fillRect(x + 10, y - 15, 10, 15);
            this.ctx.fillStyle = '#4caf50'; this.ctx.fillRect(x + 30, y - 15, 10, 15);
            this.ctx.fillStyle = '#ffeb3b'; this.ctx.fillRect(x + 50, y - 15, 15, 15);
            this.ctx.fillStyle = '#2196f3'; this.ctx.fillRect(x + 80, y - 20, 10, 20);
        };
        drawShelf(50, 140);
        drawShelf(350, 140);
        drawShelf(50, 280);
        drawShelf(350, 280);

        // Checkout Counter
        this.ctx.fillStyle = '#795548';
        this.ctx.fillRect(600, 350, 150, 60);
        this.ctx.fillStyle = '#d7ccc8';
        this.ctx.fillRect(600, 350, 150, 10);
        this.ctx.fillStyle = '#212121'; // Register
        this.ctx.fillRect(620, 330, 40, 20);

        // Exit
        this.ctx.fillStyle = '#fff';
        this.ctx.fillRect(w / 2 - 40, h - 20, 80, 20);
        this.ctx.fillStyle = '#000';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("SAIR", w / 2, h - 5);
    }

    drawStreet() {
        const w = this.mapBounds.width;
        const h = this.mapBounds.height;

        // Sky
        this.ctx.fillStyle = '#87CEEB';
        this.ctx.fillRect(0, 0, w, 140);

        // Buildings background
        this.ctx.fillStyle = '#78909c';
        this.ctx.fillRect(0, 40, w, 100);
        this.ctx.fillStyle = '#546e7a';
        for (let i = 50; i < w; i += 150) {
            this.ctx.fillRect(i, 60, 80, 80);
        }

        // Sidewalk
        this.ctx.fillStyle = '#e0e0e0';
        this.ctx.fillRect(0, 140, w, 60);
        this.ctx.strokeStyle = '#9e9e9e';
        for (let i = 0; i < w; i += 30) {
            this.ctx.beginPath(); this.ctx.moveTo(i, 140); this.ctx.lineTo(i, 200); this.ctx.stroke();
        }

        // Road
        this.ctx.fillStyle = '#424242';
        this.ctx.fillRect(0, 200, w, h - 200);

        // Road lines
        this.ctx.fillStyle = '#ffeb3b';
        for (let i = 0; i < w; i += 80) {
            this.ctx.fillRect(i, 350, 40, 10);
        }

        // --- STREET DECOR ---

        // Tree
        this.ctx.fillStyle = '#8b4513';
        this.ctx.fillRect(600, 80, 20, 80); // Trunk
        this.ctx.fillStyle = '#228b22'; // Forest green
        this.ctx.beginPath();
        this.ctx.arc(610, 60, 40, 0, Math.PI * 2);
        this.ctx.arc(580, 80, 30, 0, Math.PI * 2);
        this.ctx.arc(640, 80, 30, 0, Math.PI * 2);
        this.ctx.fill();

        // Street Lamp
        this.ctx.fillStyle = '#555';
        this.ctx.fillRect(200, 60, 5, 100); // Pole
        this.ctx.fillRect(190, 50, 25, 10); // Lamp top
        this.ctx.fillStyle = '#ffffbb';
        this.ctx.beginPath();
        this.ctx.arc(202, 65, 8, 0, Math.PI * 2); // Lightbulb
        this.ctx.fill();

        // --- TRANSITION ZONE (LEFT END) - APARTMENT BUILDING ---
        const bX = 0;
        const bWidth = 140;
        // Building main body
        this.ctx.fillStyle = '#90a4ae'; // Blueish grey
        this.ctx.fillRect(bX, 20, bWidth, 180);

        // Windows
        this.ctx.fillStyle = '#cfd8dc';
        for (let wy = 40; wy < 100; wy += 40) {
            for (let wx = 10; wx < 130; wx += 40) {
                if (wx === 50 && wy > 60) continue; // Space for the awning/door
                this.ctx.fillRect(bX + wx, wy, 25, 25);
            }
        }

        // Door back to house
        const houseDoorX = 50;
        this.ctx.fillStyle = '#5d4037'; // Dark brown door
        this.ctx.fillRect(houseDoorX, 120, 40, 80);
        this.ctx.fillStyle = '#111'; // Inner shadow
        this.ctx.fillRect(houseDoorX + 2, 122, 36, 78);
        this.ctx.fillStyle = '#5d4037';
        this.ctx.fillRect(houseDoorX + 4, 124, 32, 74);

        this.ctx.fillStyle = '#ffd700'; // Knob
        this.ctx.beginPath();
        this.ctx.arc(houseDoorX + 32, 160, 4, 0, Math.PI * 2);
        this.ctx.fill();

        // Building Sign/Awning
        this.ctx.fillStyle = '#ff7043'; // Deep orange awning
        this.ctx.fillRect(bX, 100, bWidth, 20);

        // Stripes on awning
        this.ctx.fillStyle = '#ffccbc';
        for (let ax = 0; ax < bWidth; ax += 20) {
            this.ctx.fillRect(bX + ax + 10, 100, 10, 20);
        }

        this.ctx.fillStyle = '#333';
        this.ctx.font = 'bold 10px Arial';
        this.ctx.textAlign = 'center';
        // Add a sign slightly above the door
        this.ctx.fillStyle = '#eceff1';
        this.ctx.fillRect(houseDoorX - 10, 90, 60, 10);
        this.ctx.fillStyle = '#000';
        this.ctx.fillText("APTOS", houseDoorX + 20, 98);

        // --- NEW LOCATIONS ---

        // Coffee Shop
        this.ctx.fillStyle = '#6d4c41'; // Brown
        this.ctx.fillRect(300, 80, 100, 120);
        this.ctx.fillStyle = '#d7ccc8'; // Light Brown window
        this.ctx.fillRect(310, 120, 80, 50);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("CAFETERIA", 350, 100);

        // Gym
        this.ctx.fillStyle = '#455a64'; // Blue grey
        this.ctx.fillRect(450, 60, 120, 140);
        this.ctx.fillStyle = '#b0bec5'; // Light grey window
        this.ctx.fillRect(460, 100, 100, 60);
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("ACADEMIA", 510, 90);

        // Plaza (Park area)
        this.ctx.fillStyle = '#81c784'; // Light green grass
        this.ctx.fillRect(700, 120, 150, 80);
        this.ctx.fillStyle = '#388e3c'; // Dark green bush
        this.ctx.beginPath();
        this.ctx.arc(740, 140, 20, 0, Math.PI * 2);
        this.ctx.arc(770, 130, 25, 0, Math.PI * 2);
        this.ctx.arc(800, 140, 20, 0, Math.PI * 2);
        this.ctx.fill();
        this.ctx.fillStyle = '#fff';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("PRAÇA", 775, 110);

        // Grocery Store (Mercearia)
        this.ctx.fillStyle = '#f44336'; // Red facade
        this.ctx.fillRect(950, 60, 140, 140);
        this.ctx.fillStyle = '#ffc107'; // Yellow awning
        this.ctx.fillRect(940, 90, 160, 20);
        this.ctx.fillStyle = '#fff'; // Glass door/window
        this.ctx.fillRect(990, 110, 60, 90);
        this.ctx.fillStyle = '#111';
        this.ctx.font = 'bold 12px Arial';
        this.ctx.textAlign = 'center';
        this.ctx.fillText("MERCEARIA", 1020, 80);
    }



    drawNPC(npc) {
        const action = (npc.isPaused || npc.isNearPlayer) ? 'idle' : 'walk';
        if (!this.assets[action]) return;

        const drawLayer = (img, color, partName) => {
            if (!img) return;
            const finalImg = this.game.characterCreator.getCachedImage(partName, img, color, action);
            const frameWidth = finalImg.width / 4;
            const frameHeight = finalImg.height / 4;
            const sx = npc.frame * frameWidth;
            const sy = npc.direction * frameHeight;

            // Character display size (same as player 120)
            const dHeight = 120;
            const dWidth = frameWidth * (dHeight / frameHeight);

            // Apply camera offset
            const dx = npc.x - dWidth / 2 - this.camera.x;
            const dy = npc.y - dHeight - this.camera.y;

            this.ctx.drawImage(finalImg, sx, sy, frameWidth, frameHeight, dx, dy, dWidth, dHeight);
        };

        const partsOrder = ['body', 'feet', 'legs', 'torso'];
        partsOrder.forEach(part => {
            if (this.assets[action][part] && this.assets[action][part].length > 0) {
                const img = this.assets[action][part][npc.state[part].index];
                if (img) {
                    const color = part === 'body' ? npc.state.skinColor : npc.state[part].color;
                    drawLayer(img, color, part);
                }
            }
        });

        // Draw Face using full logic
        const faceImg = this.assets[action].face ? this.assets[action].face[npc.face.type] : null;
        if (faceImg) {
            if (npc.face.type === 'kissing' || npc.face.type === 'blowing_kiss') {
                console.log(`DRAWING NPC FACE: ${npc.face.type}, img width: ${faceImg.width}, height: ${faceImg.height}`);
            }
            const frameCount = 4;
            const fw = faceImg.width / frameCount;
            const fh = faceImg.height / 4;
            const sx = npc.frame * fw;
            const sy = npc.direction * fh;

            const dh = 120;
            const dw = fw * (dh / fh);

            // Apply camera offset
            this.ctx.drawImage(faceImg, sx, sy, fw, fh, npc.x - dw / 2 - this.camera.x, npc.y - dh - this.camera.y, dw, dh);
        }

        // Hair
        if (this.assets[action].hair && this.assets[action].hair.length > 0) {
            const hairImg = this.assets[action].hair[npc.state.hair.index];
            drawLayer(hairImg, npc.state.hair.color, 'hair');
        }

        // Draw Emoji Balloon in Game for NPCs
        if (npc.face.isAnimating && npc.face.type !== 'static') {
            let emojiStr = this.emojis && this.emojis[npc.face.type] ? this.emojis[npc.face.type] : '';

            if (emojiStr) {
                const chars = Array.from(emojiStr); // Conta a quantidade real de emojis
                const emojiCount = chars.length;

                // Calcula largura dinâmica para o balão
                const bubbleWidth = Math.max(24, emojiCount * 22);

                // Posições base
                const bx = npc.x - this.camera.x - 15 - bubbleWidth / 2;
                const by = npc.y - this.camera.y - 120 + 12;

                // Transparência
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

                // Desenha o Balão usando roundRect (ou fallback se o navegador for bem antigo)
                this.ctx.beginPath();
                if (this.ctx.roundRect) {
                    this.ctx.roundRect(bx - bubbleWidth / 2, by - 14, bubbleWidth, 28, 14);
                } else {
                    // Fallback
                    this.ctx.fillRect(bx - bubbleWidth / 2, by - 14, bubbleWidth, 28);
                }
                this.ctx.fill();

                // Desenha o "biquinho" (Tail) apontando pro player
                const rightEdge = bx + bubbleWidth / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(rightEdge - 2, by - 3);
                this.ctx.lineTo(rightEdge + 6, by + 5);
                this.ctx.lineTo(rightEdge - 4, by + 4);
                this.ctx.fill();

                // Desenha os Emojis
                this.ctx.fillStyle = '#000'; // reset text color for emoji drawing
                this.ctx.font = '14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(emojiStr, bx, by + 1);
            }
        }

        if (npc.chatBubble) {
            this.drawChatBubble(npc, npc.x - this.camera.x, npc.y - this.camera.y);
        }
    }

    drawCharacter() {
        this.ctx.imageSmoothingEnabled = false;

        const animType = this.player.isMoving ? 'walk' : 'idle';
        const currentAssets = this.assets[animType];

        const drawLayer = (img, color, partName) => {
            if (!img) return;

            // Borrowing getCachedImage from CharacterCreator. 
            // In a better architecture, this would be a static utility or shared service.
            const finalImg = this.game.characterCreator.getCachedImage(partName, img, color, animType);

            const frameCount = 4;
            const frameWidth = finalImg.width / frameCount;
            const frameHeight = finalImg.height / 4;

            const sx = this.player.frame * frameWidth;
            const sy = this.player.direction * frameHeight;

            // Character display size
            const charHeight = 120;
            const dWidth = frameWidth * (charHeight / frameHeight);
            const dHeight = charHeight;

            // Assuming origin is bottom-center for coordinate logic
            // We must subtract camera offset here because drawCharacter() 
            // is called after ctx.restore() in loop() therefore it has NO translation.
            const dx = this.player.x - dWidth / 2 - this.camera.x;
            const dy = this.player.y - dHeight - this.camera.y;

            this.ctx.drawImage(finalImg, sx, sy, frameWidth, frameHeight, dx, dy, dWidth, dHeight);
        };

        // Draw Order: Body -> Feet -> Legs -> Torso -> Face -> Hair
        const bodyImg = currentAssets.body[this.characterState.body.index];
        if (bodyImg) drawLayer(bodyImg, this.characterState.skinColor, 'body');

        const shoesImg = currentAssets.feet[this.characterState.feet.index];
        if (shoesImg) drawLayer(shoesImg, this.characterState.feet.color, 'feet');

        const legsImg = currentAssets.legs[this.characterState.legs.index];
        if (legsImg) drawLayer(legsImg, this.characterState.legs.color, 'legs');

        const torsoImg = currentAssets.torso[this.characterState.torso.index];
        if (torsoImg) drawLayer(torsoImg, this.characterState.torso.color, 'torso');

        // Draw Face
        const faceImg = currentAssets.face[this.player.face.type];
        if (faceImg) {
            const frameCount = 4;
            const frameWidth = faceImg.width / frameCount;
            const frameHeight = faceImg.height / 4;

            // Use body frame for face to keep them entirely synchronized
            let fFrame = this.player.frame;

            const sx = fFrame * frameWidth;
            const sy = this.player.direction * frameHeight;

            const charHeight = 120;
            const dWidth = frameWidth * (charHeight / frameHeight);
            const dHeight = charHeight;
            const dx = this.player.x - dWidth / 2 - this.camera.x;
            const dy = this.player.y - dHeight - this.camera.y;

            this.ctx.drawImage(faceImg, sx, sy, frameWidth, frameHeight, dx, dy, dWidth, dHeight);
        }

        const hairImg = currentAssets.hair[this.characterState.hair.index];
        if (hairImg) drawLayer(hairImg, this.characterState.hair.color, 'hair');

        // Draw Emoji Balloon in Game
        if (this.player.face.isAnimating && this.player.face.type !== 'static') {
            let emojiStr = '';
            const isCriticalHealth = this.stats.health <= 5;
            const isCriticalHunger = this.stats.hunger <= 5;
            const isCriticalHygiene = this.stats.hygiene <= 5;
            const isCriticalBladder = this.stats.bladder <= 5;

            // Se for do tipo cansado devido aos stats baixos, monta uma string com vários emojis
            if (this.player.face.type === 'tired' && (isCriticalHealth || isCriticalHunger || isCriticalHygiene || isCriticalBladder)) {
                if (isCriticalBladder) emojiStr += '🧻';
                if (isCriticalHunger) emojiStr += '🍔';
                if (isCriticalHygiene) emojiStr += '🚿';
                if (isCriticalHealth) emojiStr += '🥱';
            } else {
                emojiStr = this.emojis && this.emojis[this.player.face.type] ? this.emojis[this.player.face.type] : '';
            }

            if (emojiStr) {
                const chars = Array.from(emojiStr); // Conta a quantidade real de emojis
                const emojiCount = chars.length;

                // Calcula largura dinâmica para o balão
                const bubbleWidth = Math.max(24, emojiCount * 22);

                // Posições base
                const bx = this.player.x - this.camera.x - 15 - bubbleWidth / 2;
                const by = this.player.y - this.camera.y - 120 + 12;

                // Transparência
                this.ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';

                // Desenha o Balão usando roundRect (ou fallback se o navegador for bem antigo)
                this.ctx.beginPath();
                if (this.ctx.roundRect) {
                    this.ctx.roundRect(bx - bubbleWidth / 2, by - 14, bubbleWidth, 28, 14);
                } else {
                    // Fallback
                    this.ctx.fillRect(bx - bubbleWidth / 2, by - 14, bubbleWidth, 28);
                }
                this.ctx.fill();

                // Desenha o "biquinho" (Tail) apontando pro player
                const rightEdge = bx + bubbleWidth / 2;
                this.ctx.beginPath();
                this.ctx.moveTo(rightEdge - 2, by - 3);
                this.ctx.lineTo(rightEdge + 6, by + 5);
                this.ctx.lineTo(rightEdge - 4, by + 4);
                this.ctx.fill();

                // Desenha os Emojis
                this.ctx.fillStyle = '#000'; // reset text color for emoji drawing
                this.ctx.font = '14px Arial';
                this.ctx.textAlign = 'center';
                this.ctx.textBaseline = 'middle';
                this.ctx.fillText(emojiStr, bx, by + 1);
            }
        }

        if (this.player.chatBubble) {
            this.drawChatBubble(this.player, this.player.x - this.camera.x, this.player.y - this.camera.y);
        }
    }

    drawChatBubble(entity, x, y) {
        if (!entity.chatBubble) return;
        if (Date.now() > entity.chatBubble.expiresAt) {
            entity.chatBubble = null;
            return;
        }

        const text = entity.chatBubble.text;
        this.ctx.font = 'bold 12px Arial';

        // Wrap text logic
        const words = text.split(' ');
        let lines = [];
        let currentLine = words[0];
        const maxWidth = 120; // max bubble width

        for (let i = 1; i < words.length; i++) {
            let word = words[i];
            let width = this.ctx.measureText(currentLine + " " + word).width;
            if (width < maxWidth) {
                currentLine += " " + word;
            } else {
                lines.push(currentLine);
                currentLine = word;
            }
        }
        lines.push(currentLine);

        const lineHeight = 16;
        const bubbleHeight = lines.length * lineHeight + 10;
        const widthT = lines.reduce((a, b) => Math.max(a, this.ctx.measureText(b).width), 0);
        const bubbleWidth = widthT + 20;

        const bx = x - bubbleWidth / 2;
        const by = y - 130 - bubbleHeight;

        // Draw Balloon Background
        this.ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
        this.ctx.beginPath();
        if (this.ctx.roundRect) {
            this.ctx.roundRect(bx, by, bubbleWidth, bubbleHeight, 8);
        } else {
            this.ctx.fillRect(bx, by, bubbleWidth, bubbleHeight);
        }
        this.ctx.fill();

        // Minor dark border
        this.ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        this.ctx.stroke();

        // Draw Tail
        const tailX = x;
        const tailY = by + bubbleHeight;
        this.ctx.beginPath();
        this.ctx.moveTo(tailX - 5, tailY);
        this.ctx.lineTo(tailX + 5, tailY);
        this.ctx.lineTo(tailX, tailY + 8);
        this.ctx.fill();

        // Draw Text
        this.ctx.fillStyle = '#000';
        this.ctx.textAlign = 'center';
        this.ctx.textBaseline = 'middle';

        lines.forEach((line, index) => {
            this.ctx.fillText(line, x, by + 10 + (index * lineHeight));
        });
    }

    drawEntities() {
        // Collect all entities in the scene that need depth sorting
        let entities = [];

        entities.push({
            type: 'player',
            y: this.player.y,
            entity: this.player
        });

        // Only draw NPCs if we are on the street
        if (this.currentRoom === 'street' && this.npcs) {
            this.npcs.forEach(npc => {
                entities.push({
                    type: 'npc',
                    y: npc.y,
                    entity: npc
                });
            });
        }

        // Sort ascending by Y (lowest Y is further away, drawn first -> behind)
        entities.sort((a, b) => a.y - b.y);

        entities.forEach(item => {
            if (item.type === 'player') {
                this.drawCharacter();
            } else if (item.type === 'npc') {
                this.drawNPC(item.entity);
            }
        });
    }

    loop(timestamp) {
        if (this.game.currentScreen !== 'game-screen') return;

        const dt = timestamp - this.lastTime;
        this.lastTime = timestamp;

        this.update(dt);

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.drawEnvironment();
        this.drawEntities(); // Replaces drawCharacter() to handle depth sorting of all entities

        requestAnimationFrame((ts) => this.loop(ts));
    }
}
