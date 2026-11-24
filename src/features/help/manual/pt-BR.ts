import type { Manual } from './types';

/**
 * O manual, em português do Brasil. A interface do Deskstart é em inglês:
 * os nomes de botões, campos e telas aparecem aqui como estão na tela, em
 * negrito, para que se encontre o que se lê.
 */
export const MANUAL_PT_BR: Manual = {
  language: 'pt-BR',
  title: 'Manual do Deskstart',
  intro:
    'O Deskstart abre o seu dia de trabalho com um botão. Um **perfil** é uma lista de **passos** — programas, pastas, arquivos, páginas, pastas de favoritos, um terminal, o VS Code, máquinas virtuais — que rodam em ordem, com tempo, e põem as janelas onde você quer. Cada execução é gravada primeiro num log e só depois mostrada na tela. Tudo acontece na sua máquina: não há conta, nuvem, telemetria nem verificação de atualização.',
  sections: [
    {
      id: 'start',
      title: 'Primeiros passos',
      summary: 'Seu primeiro perfil, em um minuto.',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Em **Profiles**, digite um nome em **New profile** — por exemplo “Manhã” — e pressione **Add profile** (o `+`).',
            'Em **Add a step**, mantenha o tipo **Application** e digite o caminho do programa, por exemplo `%SYSTEMROOT%\\System32\\charmap.exe`. Pressione **Add step**.',
            'Pressione **Dry run**. O log mostra o que aconteceria — “Would start charmap.exe” — e nada abre.',
            'Pressione **Run**. O programa abre, e o log diz quando e com qual identificador de processo (PID).',
          ],
        },
        {
          kind: 'note',
          text: 'Já arrumou suas janelas? **Capture this desktop** faz um perfil do que está aberto agora — veja “Capturar a área de trabalho”.',
        },
        { kind: 'h', text: 'As telas' },
        {
          kind: 'list',
          items: [
            '**Profiles** — seus perfis, os passos, o Run, o log da última execução e os gatilhos.',
            '**Runs** — todas as execuções de todos os perfis, da mais nova para a mais antiga, cada uma com o log completo.',
            '**Diagnostics** — a versão, onde está seu workspace e quais programas um passo pode chamar nesta máquina.',
            '**Settings** — tema, iniciar com o Windows, backup e restauração, o idioma do manual e o About.',
            '**Help** — este manual. Um `?` num cartão abre o manual na seção daquele cartão.',
          ],
        },
      ],
    },
    {
      id: 'guide',
      title: 'Boas-vindas e o tour guiado',
      summary: 'A primeira tela, e um tour pela interface de verdade.',
      blocks: [
        {
          kind: 'p',
          text: 'Um workspace novo abre nas **boas-vindas**: o que o Deskstart faz e três caminhos — **Fazer o tour**, **Capturar esta área de trabalho** ou **Começar com um perfil vazio**. Escolher qualquer um, ou ir a qualquer tela pela barra lateral, a guarda. **Ver as boas-vindas de novo**, no Help, a traz de volta.',
        },
        {
          kind: 'p',
          text: 'O **tour** ilumina uma parte da interface de verdade por vez — a barra lateral, um perfil novo, a captura, a importação, os passos, o Where, o Run, os gatilhos, o log e este manual — e diz para que ela serve. **Próximo** e **Voltar** avançam e retornam; **Pular o tour** ou Esc saem. Uma parte que ainda não está na tela, como o editor de passos antes de existir um perfil, é pulada, e o último cartão avisa.',
        },
        {
          kind: 'p',
          text: '**Ler mais**, num cartão do tour, abre este manual naquele assunto, e **Mostrar no aplicativo**, numa seção do manual, começa o tour exatamente nela. Recomece o tour inteiro quando quiser com **Fazer o tour** no Help.',
        },
        {
          kind: 'note',
          text: 'As boas-vindas e o tour falam o idioma do manual. Quando o Windows está configurado para reduzir animações, a luz salta em vez de deslizar.',
        },
      ],
    },
    {
      id: 'profiles',
      title: 'Perfis e passos',
      summary: 'Adicionar, editar, reordenar e remover passos; caminhos com %NOMES%.',
      blocks: [
        {
          kind: 'p',
          text: 'Um perfil roda seus passos **de cima para baixo**. Cada linha mostra o que o passo é, o caminho como foi escrito e — quando um `%NOME%` o alterou — o caminho absoluto em que se tornou. Use as setas para mover um passo, o lápis para editá-lo e a lixeira para removê-lo.',
        },
        {
          kind: 'p',
          text: 'Os caminhos podem usar seis nomes, e só estes: `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` e `%SYSTEMROOT%`. Um caminho é sempre resolvido para um caminho absoluto antes de rodar; um caminho relativo é recusado.',
        },
        {
          kind: 'p',
          text: 'Os **argumentos** de um aplicativo são uma lista, um por linha, adicionados um de cada vez. São entregues ao programa exatamente como escritos — nunca por um shell — então um espaço, uma aspa ou um `&` é só parte de um argumento.',
        },
        {
          kind: 'note',
          text: 'Um passo que não pode rodar nesta máquina — um caminho que não resolve, uma espera que aponta para nada — é marcado na sua linha, e o **Run** fica desabilitado até ser corrigido.',
        },
      ],
    },
    {
      id: 'kinds',
      title: 'Tipos de passo',
      summary:
        'Aplicativo, pasta, arquivo, página, pasta de favoritos, terminal, VS Code, máquina virtual.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Application** — um programa, iniciado diretamente com seus argumentos e pasta de trabalho.',
            '**Folder** — aberta no Explorador do Windows.',
            '**File** — aberto com o programa que o Windows usa para aquele tipo de arquivo.',
            '**Web page** — um endereço `http` ou `https`, aberto no seu navegador padrão.',
            '**Bookmark folder** — todas as páginas de uma pasta de favoritos do Chrome, Edge ou Firefox, abertas como uma janela do navegador. Escreva o nome da pasta como o navegador mostra: `Work`, ou um caminho como `Bookmarks bar/Work`. Páginas em subpastas não são abertas, e no máximo 50 páginas são.',
            '**Terminal** — o Windows Terminal, num perfil nomeado, numa pasta (ambos opcionais).',
            '**VS Code** — uma pasta ou um `.code-workspace` aberto no VS Code.',
            '**Virtual machine** — uma máquina do Hyper-V, VirtualBox ou VMware Workstation, iniciada com seu console. Veja “Máquinas virtuais”.',
          ],
        },
        {
          kind: 'p',
          text: 'Navegadores, Windows Terminal, VS Code e os hypervisors são procurados onde se instalam — nunca no `PATH`. Se um não estiver instalado, o editor avisa; o passo ainda pode ser salvo, porque um perfil muitas vezes é escrito num computador e rodado em outro.',
        },
        {
          kind: 'note',
          text: 'Os favoritos do Firefox são lidos de uma **cópia** do banco dele, apagada logo em seguida: o Firefox nunca é travado nem alterado, e só as linhas de favoritos são lidas.',
        },
      ],
    },
    {
      id: 'run',
      title: 'Run, Dry run, Stop e o log',
      summary: 'O que cada botão faz, e como ler uma execução.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Run** inicia os passos de verdade.',
            '**Dry run** escreve a execução inteira no log — cada início, espera, tempo aberto e posicionamento — num relógio virtual, de uma vez, e **não inicia nada**.',
            '**Stop** encerra a execução em andamento. Fecha o que **esta execução** abriu — primeiro pedindo, à força depois de alguns segundos — e nada mais. Um programa que você abriu por conta própria nunca é tocado.',
          ],
        },
        {
          kind: 'p',
          text: 'O log **só cresce**: cada linha é gravada no workspace antes de chegar à tela, e nada no produto pode alterá-la ou apagá-la. Um passo que não pôde iniciar é uma linha com o motivo — “Could not start … : the program was not found at …” — e a execução continua no passo seguinte.',
        },
        {
          kind: 'p',
          text: 'Uma execução termina **completed** (concluída), **completed with failures** (concluída com falhas), **failed** (todos os passos falharam) ou **stopped** (interrompida). Um passo pulado — cuja senha não foi informada, ou cuja espera esgotou — não conta como falha; o log diz por que foi pulado.',
        },
      ],
    },
    {
      id: 'time',
      title: 'Tempo: pausa, manter aberto e ciclos',
      summary:
        'Esperar entre passos; manter um programa aberto por um tempo; abri-lo de novo e de novo.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Wait after this step** — segundos de pausa antes de o próximo passo começar.',
            '**Keep it open for, then close** — só aplicativos: depois desses segundos, as janelas são convidadas a fechar, e o programa é encerrado se não fechar. Vazio deixa aberto.',
            '**Open it this many times in all** e **Closed for, between openings** — um ciclo: abrir, manter, fechar, esperar, abrir de novo. **Again and again** repete até a execução ser interrompida.',
          ],
        },
        {
          kind: 'p',
          text: 'Manter aberto nunca trava o perfil: o próximo passo começa enquanto o programa mantido ainda está aberto. Só aplicativos podem ser mantidos e fechados, porque só o processo deles pertence à execução.',
        },
      ],
    },
    {
      id: 'waiting',
      title: 'Esperar outro passo',
      summary: 'Iniciar um passo só quando um anterior estiver respondendo.',
      blocks: [
        {
          kind: 'p',
          text: 'Em **Waits for**, escolha um passo anterior. Este passo só começa quando aquele estiver **respondendo**: tiver uma janela própria, ou uma **porta** que você indicar responder nesta máquina (para um servidor local). Defina quanto tempo esperar.',
        },
        {
          kind: 'p',
          text: 'Se o tempo acabar, o passo é **pulado com o motivo** e o perfil continua. Um passo que espera por outro que nunca começou é pulado na hora.',
        },
      ],
    },
    {
      id: 'where',
      title: 'Onde a janela fica',
      summary: 'Tela, posição, tamanho, maximizada; regras de janela; monitores que entram e saem.',
      blocks: [
        {
          kind: 'p',
          text: 'Em **Where**, escolha **Normal**, **Maximised** ou **Minimised**, uma **tela** (1 é a principal, as outras da esquerda para a direita) e, se quiser, **posição e tamanho** naquela tela — os quatro números, ou nenhum. As coordenadas são da própria tela: `0, 0` é o canto superior esquerdo dela.',
        },
        { kind: 'h', text: 'Regras de janela' },
        {
          kind: 'p',
          text: 'A janela de um aplicativo é encontrada pelo programa que a execução iniciou. Todo o resto — a janela do Explorador de uma pasta, um navegador, o Windows Terminal, o VS Code, o console de uma máquina, ou um programa que entrega a janela a outro processo, como o Bloco de Notas no Windows 11 — precisa de uma **regra de janela**: um pedaço do **título** da janela, a **classe** dela, ou os dois.',
        },
        {
          kind: 'note',
          text: 'Uma regra só escolhe uma janela que **apareceu depois que o passo começou**. Janelas que já estavam abertas quando o passo começou nunca são movidas, não importa o que a regra encontre.',
        },
        { kind: 'h', text: 'Monitores que entram e saem' },
        {
          kind: 'p',
          text: 'O Deskstart acompanha seus monitores. Conecte ou desconecte um e a lista do editor acompanha. Se um perfil põe uma janela num monitor que não está conectado agora, ele avisa antes do Run; essa janela abre então no monitor principal, e o log registra isso.',
        },
      ],
    },
    {
      id: 'machines',
      title: 'Máquinas virtuais',
      summary: 'Escolher máquinas de cada hypervisor; máquinas VMware criptografadas.',
      blocks: [
        {
          kind: 'p',
          text: 'Escolha **Virtual machine** e depois **Hyper-V**, **VirtualBox** ou **VMware**. O editor lista as máquinas que aquele hypervisor já tem neste computador, com as que estão ligadas marcadas. Ao adicionar, marque várias — cada uma vira um passo, na ordem da lista. Você ainda pode digitar o nome da máquina (ou, no VMware, o caminho do `.vmx`).',
        },
        {
          kind: 'p',
          text: 'A máquina é iniciada e o console aberto. O hypervisor é aguardado, por até um minuto, e o que ele responder — uma máquina que não existe, uma permissão que falta — vai para o log. Nada é elevado por você.',
        },
        { kind: 'h', text: 'Máquinas VMware criptografadas' },
        {
          kind: 'p',
          text: 'Marque **This machine is encrypted** num passo VMware. Ao pressionar **Run**, o Deskstart pede a senha de cada máquina criptografada **antes de qualquer coisa começar**. A senha é usada naquela execução e **não é guardada em lugar nenhum** — nem no perfil, nem no disco, nem no log, nem num export. Deixe um campo vazio para pular aquela máquina.',
        },
        {
          kind: 'note',
          text: 'O `vmrun` só aceita a senha na linha de comando, então, durante os segundos em que ele roda, outros programas rodando como você — e softwares de segurança que registram linhas de comando — podem vê-la. Leia “Privacidade e segurança”.',
        },
      ],
    },
    {
      id: 'triggers',
      title: 'Gatilhos: agendamento, atalho, linha de comando',
      summary: 'Iniciar um perfil sem pressionar Run.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Schedule** — um horário (24 horas), todo dia ou só em dias úteis. É entregue ao Agendador de Tarefas do Windows, então o Deskstart não precisa estar aberto; o cartão diz se o Windows o tem registrado.',
            '**Shortcut** — uma combinação de teclas com Ctrl, Alt ou Win e uma letra, dígito ou tecla de função, pressionada em qualquer programa. Uma combinação que outro programa já usa é recusada.',
            '**Linha de comando** — `deskstart.exe --run <id do perfil>` inicia um perfil a partir de um script ou de outra ferramenta.',
          ],
        },
        {
          kind: 'p',
          text: 'Fechar a janela mantém o Deskstart na **bandeja**, para que um agendamento ou atalho tenha onde chegar. **Quit** fica no menu do ícone da bandeja. Uma execução iniciada por um gatilho diz isso no cabeçalho.',
        },
        {
          kind: 'note',
          text: 'Um perfil importado de um arquivo não pode ser agendado nem ganhar atalho até ser revisado. Um gatilho não tem a quem pedir senha, então as máquinas criptografadas dele são puladas.',
        },
      ],
    },
    {
      id: 'capture',
      title: 'Capturar a área de trabalho',
      summary: 'Fazer um perfil das janelas abertas agora.',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Arrume suas janelas do jeito que você quer começar o dia.',
            'Em **Profiles**, pressione **Capture this desktop**.',
            'Desmarque as janelas que não pertencem, dê um nome ao perfil e pressione **Make a profile**.',
          ],
        },
        {
          kind: 'p',
          text: 'Cada janela marcada vira um passo **Application** que inicia o programa e põe a janela de volta onde está — tela, posição, tamanho, maximizada ou minimizada. Uma janela que não pode virar passo diz o motivo: um app da Store (não é iniciado pelo caminho), uma janela do Explorador (adicione a pasta como um passo **Folder**), ou um programa cujo nome o Windows não informou.',
        },
        {
          kind: 'note',
          text: 'Os títulos das janelas aparecem para ajudar a escolher e **não são guardados**. Os argumentos de um programa também não são capturados — adicione-os no editor se ele precisar.',
        },
      ],
    },
    {
      id: 'sharing',
      title: 'Exportar, importar e revisar',
      summary: 'Um perfil como arquivo; nada importado roda antes de você ler.',
      blocks: [
        {
          kind: 'p',
          text: '**Export** grava um perfil como arquivo JSON: seus passos, tempos, esperas e posicionamentos — e nada sobre esta máquina. **Import a profile** lê um, de um arquivo ou colado.',
        },
        {
          kind: 'p',
          text: 'Um perfil importado **não roda nada** até cada passo ser **revisado**: cada um aparece com o caminho resolvido para absoluto e cada argumento na sua linha. Leia e então pressione **Accept** (ou **Accept all**). Trate um arquivo de perfil como um programa: ele inicia programas na sua máquina.',
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings, backup e restauração',
      summary: 'Tema, iniciar com o Windows, idioma do manual, backup.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Appearance** — claro, escuro, ou o que o Windows estiver usando.',
            '**Start with Windows** — desligado até você ligar.',
            '**Manual** — o idioma em que este manual aparece: English ou Português (Brasil).',
            '**Back up…** — seu workspace inteiro, todos os perfis e todas as execuções, num arquivo.',
            '**Restore…** — substitui tudo por um backup e reinicia o Deskstart. O que existe agora se perde, a não ser que você faça backup antes. Um backup de uma versão mais nova é recusado.',
          ],
        },
        {
          kind: 'p',
          text: '**Diagnostics** mostra a versão, o schema, onde está o arquivo do workspace e cada programa que um passo pode chamar — encontrado, com o caminho, ou não encontrado.',
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Solução de problemas',
      summary: 'Quando algo não abriu, não se moveu ou não iniciou.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**“The program was not found at …”** — o caminho está errado nesta máquina. Edite o passo; a linha mostra o caminho absoluto que ele resolve.',
            '**“… is not installed where this product looks for it”** — o navegador, terminal, editor ou hypervisor não está instalado aqui, ou não no lugar de costume. O Diagnostics lista onde cada um é procurado.',
            '**“The program did not show a window of its own in time”** — o programa entregou a janela a outro processo (o Bloco de Notas no Windows 11, um navegador que já estava aberto). Adicione uma **regra de janela** em Where.',
            '**“No new window answering the rule appeared in time”** — nenhuma janela nova bateu com a regra. Confira o título ou a classe; uma janela que já estava aberta nunca é usada.',
            '**Um atalho não faz nada** — confira o cartão Triggers: outro programa pode estar usando a combinação. O Deskstart precisa estar rodando, na bandeja ou aberto.',
            '**O SmartScreen do Windows avisa na instalação** — os instaladores não são assinados. Escolha “Mais informações” e depois “Executar assim mesmo”, se você confia em onde o obteve.',
          ],
        },
        {
          kind: 'p',
          text: 'O log de cada execução está em **Runs**. Quando algo deu errado, a linha daquele passo diz o que o Windows ou o programa respondeu.',
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacidade e segurança',
      summary: 'O que o Deskstart faz, e não faz, na sua máquina.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Sem rede.** Sem conta, sincronização, telemetria, relatórios de erro ou verificação de atualização. O único contato com a rede é o que um passo que você escreveu pede a um navegador para abrir.',
            '**Sem shell.** Programas são iniciados a partir de uma lista de argumentos, nunca por texto de `cmd` ou PowerShell que você escreveu.',
            '**Sem elevação silenciosa.** Um programa que precisa de direitos de administrador falha com esse motivo; nada os pede pelas suas costas.',
            '**O Stop só toca no que a execução abriu.**',
            '**Nenhum segredo guardado.** A senha de uma máquina criptografada é pedida a cada execução e nunca gravada. Enquanto o `vmrun` roda, ela está na linha de comando dele — visível a programas rodando como você, a programas elevados e a softwares de segurança, e registrada onde a auditoria de linha de comando estiver ligada.',
            '**Perfis importados são revisados** antes de poderem rodar ou ser disparados.',
            '**A captura não guarda títulos.**',
          ],
        },
        {
          kind: 'p',
          text: 'O modelo de ameaças completo é o `SECURITY.md` no repositório do código, github.com/alexjustino/deskstart.',
        },
      ],
    },
  ],
};
