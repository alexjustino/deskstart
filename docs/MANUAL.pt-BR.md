# Manual do Deskstart

<!-- Este arquivo é gerado a partir do manual embutido no Deskstart (`src/features/help/manual`). Edite lá e rode `npm run docs:manual`; um teste falha quando os dois diferem. -->

O Deskstart abre o seu dia de trabalho com um botão. Um **perfil** é uma lista de **passos** — programas, pastas, arquivos, páginas, pastas de favoritos, um terminal, o VS Code, máquinas virtuais — que rodam em ordem, com tempo, e põem as janelas onde você quer. Cada execução é gravada primeiro num log e só depois mostrada na tela. Tudo acontece na sua máquina: não há conta, nuvem, telemetria nem verificação de atualização.

## Conteúdo

- [Primeiros passos](#start) — Seu primeiro perfil, em um minuto.
- [Perfis e passos](#profiles) — Adicionar, editar, reordenar e remover passos; caminhos com %NOMES%.
- [Tipos de passo](#kinds) — Aplicativo, pasta, arquivo, página, pasta de favoritos, terminal, VS Code, máquina virtual.
- [Run, Dry run, Stop e o log](#run) — O que cada botão faz, e como ler uma execução.
- [Tempo: pausa, manter aberto e ciclos](#time) — Esperar entre passos; manter um programa aberto por um tempo; abri-lo de novo e de novo.
- [Esperar outro passo](#waiting) — Iniciar um passo só quando um anterior estiver respondendo.
- [Onde a janela fica](#where) — Tela, posição, tamanho, maximizada; regras de janela; monitores que entram e saem.
- [Máquinas virtuais](#machines) — Escolher máquinas de cada hypervisor; máquinas VMware criptografadas.
- [Gatilhos: agendamento, atalho, linha de comando](#triggers) — Iniciar um perfil sem pressionar Run.
- [Capturar a área de trabalho](#capture) — Fazer um perfil das janelas abertas agora.
- [Exportar, importar e revisar](#sharing) — Um perfil como arquivo; nada importado roda antes de você ler.
- [Settings, backup e restauração](#settings) — Tema, iniciar com o Windows, idioma do manual, backup.
- [Solução de problemas](#troubleshooting) — Quando algo não abriu, não se moveu ou não iniciou.
- [Privacidade e segurança](#privacy) — O que o Deskstart faz, e não faz, na sua máquina.

<a id="start"></a>

## Primeiros passos

1. Em **Profiles**, digite um nome em **New profile** — por exemplo “Manhã” — e pressione **Add profile** (o `+`).
2. Em **Add a step**, mantenha o tipo **Application** e digite o caminho do programa, por exemplo `%SYSTEMROOT%\System32\charmap.exe`. Pressione **Add step**.
3. Pressione **Dry run**. O log mostra o que aconteceria — “Would start charmap.exe” — e nada abre.
4. Pressione **Run**. O programa abre, e o log diz quando e com qual identificador de processo (PID).

> **Nota:** Já arrumou suas janelas? **Capture this desktop** faz um perfil do que está aberto agora — veja “Capturar a área de trabalho”.

### As telas

- **Profiles** — seus perfis, os passos, o Run, o log da última execução e os gatilhos.
- **Runs** — todas as execuções de todos os perfis, da mais nova para a mais antiga, cada uma com o log completo.
- **Diagnostics** — a versão, onde está seu workspace e quais programas um passo pode chamar nesta máquina.
- **Settings** — tema, iniciar com o Windows, backup e restauração, o idioma do manual e o About.
- **Help** — este manual. Um `?` num cartão abre o manual na seção daquele cartão.

<a id="profiles"></a>

## Perfis e passos

Um perfil roda seus passos **de cima para baixo**. Cada linha mostra o que o passo é, o caminho como foi escrito e — quando um `%NOME%` o alterou — o caminho absoluto em que se tornou. Use as setas para mover um passo, o lápis para editá-lo e a lixeira para removê-lo.

Os caminhos podem usar seis nomes, e só estes: `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` e `%SYSTEMROOT%`. Um caminho é sempre resolvido para um caminho absoluto antes de rodar; um caminho relativo é recusado.

Os **argumentos** de um aplicativo são uma lista, um por linha, adicionados um de cada vez. São entregues ao programa exatamente como escritos — nunca por um shell — então um espaço, uma aspa ou um `&` é só parte de um argumento.

> **Nota:** Um passo que não pode rodar nesta máquina — um caminho que não resolve, uma espera que aponta para nada — é marcado na sua linha, e o **Run** fica desabilitado até ser corrigido.

<a id="kinds"></a>

## Tipos de passo

- **Application** — um programa, iniciado diretamente com seus argumentos e pasta de trabalho.
- **Folder** — aberta no Explorador do Windows.
- **File** — aberto com o programa que o Windows usa para aquele tipo de arquivo.
- **Web page** — um endereço `http` ou `https`, aberto no seu navegador padrão.
- **Bookmark folder** — todas as páginas de uma pasta de favoritos do Chrome, Edge ou Firefox, abertas como uma janela do navegador. Escreva o nome da pasta como o navegador mostra: `Work`, ou um caminho como `Bookmarks bar/Work`. Páginas em subpastas não são abertas, e no máximo 50 páginas são.
- **Terminal** — o Windows Terminal, num perfil nomeado, numa pasta (ambos opcionais).
- **VS Code** — uma pasta ou um `.code-workspace` aberto no VS Code.
- **Virtual machine** — uma máquina do Hyper-V, VirtualBox ou VMware Workstation, iniciada com seu console. Veja “Máquinas virtuais”.

Navegadores, Windows Terminal, VS Code e os hypervisors são procurados onde se instalam — nunca no `PATH`. Se um não estiver instalado, o editor avisa; o passo ainda pode ser salvo, porque um perfil muitas vezes é escrito num computador e rodado em outro.

> **Nota:** Os favoritos do Firefox são lidos de uma **cópia** do banco dele, apagada logo em seguida: o Firefox nunca é travado nem alterado, e só as linhas de favoritos são lidas.

<a id="run"></a>

## Run, Dry run, Stop e o log

- **Run** inicia os passos de verdade.
- **Dry run** escreve a execução inteira no log — cada início, espera, tempo aberto e posicionamento — num relógio virtual, de uma vez, e **não inicia nada**.
- **Stop** encerra a execução em andamento. Fecha o que **esta execução** abriu — primeiro pedindo, à força depois de alguns segundos — e nada mais. Um programa que você abriu por conta própria nunca é tocado.

O log **só cresce**: cada linha é gravada no workspace antes de chegar à tela, e nada no produto pode alterá-la ou apagá-la. Um passo que não pôde iniciar é uma linha com o motivo — “Could not start … : the program was not found at …” — e a execução continua no passo seguinte.

Uma execução termina **completed** (concluída), **completed with failures** (concluída com falhas), **failed** (todos os passos falharam) ou **stopped** (interrompida). Um passo pulado — cuja senha não foi informada, ou cuja espera esgotou — não conta como falha; o log diz por que foi pulado.

<a id="time"></a>

## Tempo: pausa, manter aberto e ciclos

- **Wait after this step** — segundos de pausa antes de o próximo passo começar.
- **Keep it open for, then close** — só aplicativos: depois desses segundos, as janelas são convidadas a fechar, e o programa é encerrado se não fechar. Vazio deixa aberto.
- **Open it this many times in all** e **Closed for, between openings** — um ciclo: abrir, manter, fechar, esperar, abrir de novo. **Again and again** repete até a execução ser interrompida.

Manter aberto nunca trava o perfil: o próximo passo começa enquanto o programa mantido ainda está aberto. Só aplicativos podem ser mantidos e fechados, porque só o processo deles pertence à execução.

<a id="waiting"></a>

## Esperar outro passo

Em **Waits for**, escolha um passo anterior. Este passo só começa quando aquele estiver **respondendo**: tiver uma janela própria, ou uma **porta** que você indicar responder nesta máquina (para um servidor local). Defina quanto tempo esperar.

Se o tempo acabar, o passo é **pulado com o motivo** e o perfil continua. Um passo que espera por outro que nunca começou é pulado na hora.

<a id="where"></a>

## Onde a janela fica

Em **Where**, escolha **Normal**, **Maximised** ou **Minimised**, uma **tela** (1 é a principal, as outras da esquerda para a direita) e, se quiser, **posição e tamanho** naquela tela — os quatro números, ou nenhum. As coordenadas são da própria tela: `0, 0` é o canto superior esquerdo dela.

### Regras de janela

A janela de um aplicativo é encontrada pelo programa que a execução iniciou. Todo o resto — a janela do Explorador de uma pasta, um navegador, o Windows Terminal, o VS Code, o console de uma máquina, ou um programa que entrega a janela a outro processo, como o Bloco de Notas no Windows 11 — precisa de uma **regra de janela**: um pedaço do **título** da janela, a **classe** dela, ou os dois.

> **Nota:** Uma regra só escolhe uma janela que **apareceu depois que o passo começou**. Janelas que já estavam abertas quando o passo começou nunca são movidas, não importa o que a regra encontre.

### Monitores que entram e saem

O Deskstart acompanha seus monitores. Conecte ou desconecte um e a lista do editor acompanha. Se um perfil põe uma janela num monitor que não está conectado agora, ele avisa antes do Run; essa janela abre então no monitor principal, e o log registra isso.

<a id="machines"></a>

## Máquinas virtuais

Escolha **Virtual machine** e depois **Hyper-V**, **VirtualBox** ou **VMware**. O editor lista as máquinas que aquele hypervisor já tem neste computador, com as que estão ligadas marcadas. Ao adicionar, marque várias — cada uma vira um passo, na ordem da lista. Você ainda pode digitar o nome da máquina (ou, no VMware, o caminho do `.vmx`).

A máquina é iniciada e o console aberto. O hypervisor é aguardado, por até um minuto, e o que ele responder — uma máquina que não existe, uma permissão que falta — vai para o log. Nada é elevado por você.

### Máquinas VMware criptografadas

Marque **This machine is encrypted** num passo VMware. Ao pressionar **Run**, o Deskstart pede a senha de cada máquina criptografada **antes de qualquer coisa começar**. A senha é usada naquela execução e **não é guardada em lugar nenhum** — nem no perfil, nem no disco, nem no log, nem num export. Deixe um campo vazio para pular aquela máquina.

> **Nota:** O `vmrun` só aceita a senha na linha de comando, então, durante os segundos em que ele roda, outros programas rodando como você — e softwares de segurança que registram linhas de comando — podem vê-la. Leia “Privacidade e segurança”.

<a id="triggers"></a>

## Gatilhos: agendamento, atalho, linha de comando

- **Schedule** — um horário (24 horas), todo dia ou só em dias úteis. É entregue ao Agendador de Tarefas do Windows, então o Deskstart não precisa estar aberto; o cartão diz se o Windows o tem registrado.
- **Shortcut** — uma combinação de teclas com Ctrl, Alt ou Win e uma letra, dígito ou tecla de função, pressionada em qualquer programa. Uma combinação que outro programa já usa é recusada.
- **Linha de comando** — `deskstart.exe --run <id do perfil>` inicia um perfil a partir de um script ou de outra ferramenta.

Fechar a janela mantém o Deskstart na **bandeja**, para que um agendamento ou atalho tenha onde chegar. **Quit** fica no menu do ícone da bandeja. Uma execução iniciada por um gatilho diz isso no cabeçalho.

> **Nota:** Um perfil importado de um arquivo não pode ser agendado nem ganhar atalho até ser revisado. Um gatilho não tem a quem pedir senha, então as máquinas criptografadas dele são puladas.

<a id="capture"></a>

## Capturar a área de trabalho

1. Arrume suas janelas do jeito que você quer começar o dia.
2. Em **Profiles**, pressione **Capture this desktop**.
3. Desmarque as janelas que não pertencem, dê um nome ao perfil e pressione **Make a profile**.

Cada janela marcada vira um passo **Application** que inicia o programa e põe a janela de volta onde está — tela, posição, tamanho, maximizada ou minimizada. Uma janela que não pode virar passo diz o motivo: um app da Store (não é iniciado pelo caminho), uma janela do Explorador (adicione a pasta como um passo **Folder**), ou um programa cujo nome o Windows não informou.

> **Nota:** Os títulos das janelas aparecem para ajudar a escolher e **não são guardados**. Os argumentos de um programa também não são capturados — adicione-os no editor se ele precisar.

<a id="sharing"></a>

## Exportar, importar e revisar

**Export** grava um perfil como arquivo JSON: seus passos, tempos, esperas e posicionamentos — e nada sobre esta máquina. **Import a profile** lê um, de um arquivo ou colado.

Um perfil importado **não roda nada** até cada passo ser **revisado**: cada um aparece com o caminho resolvido para absoluto e cada argumento na sua linha. Leia e então pressione **Accept** (ou **Accept all**). Trate um arquivo de perfil como um programa: ele inicia programas na sua máquina.

<a id="settings"></a>

## Settings, backup e restauração

- **Appearance** — claro, escuro, ou o que o Windows estiver usando.
- **Start with Windows** — desligado até você ligar.
- **Manual** — o idioma em que este manual aparece: English ou Português (Brasil).
- **Back up…** — seu workspace inteiro, todos os perfis e todas as execuções, num arquivo.
- **Restore…** — substitui tudo por um backup e reinicia o Deskstart. O que existe agora se perde, a não ser que você faça backup antes. Um backup de uma versão mais nova é recusado.

**Diagnostics** mostra a versão, o schema, onde está o arquivo do workspace e cada programa que um passo pode chamar — encontrado, com o caminho, ou não encontrado.

<a id="troubleshooting"></a>

## Solução de problemas

- **“The program was not found at …”** — o caminho está errado nesta máquina. Edite o passo; a linha mostra o caminho absoluto que ele resolve.
- **“… is not installed where this product looks for it”** — o navegador, terminal, editor ou hypervisor não está instalado aqui, ou não no lugar de costume. O Diagnostics lista onde cada um é procurado.
- **“The program did not show a window of its own in time”** — o programa entregou a janela a outro processo (o Bloco de Notas no Windows 11, um navegador que já estava aberto). Adicione uma **regra de janela** em Where.
- **“No new window answering the rule appeared in time”** — nenhuma janela nova bateu com a regra. Confira o título ou a classe; uma janela que já estava aberta nunca é usada.
- **Um atalho não faz nada** — confira o cartão Triggers: outro programa pode estar usando a combinação. O Deskstart precisa estar rodando, na bandeja ou aberto.
- **O SmartScreen do Windows avisa na instalação** — os instaladores não são assinados. Escolha “Mais informações” e depois “Executar assim mesmo”, se você confia em onde o obteve.

O log de cada execução está em **Runs**. Quando algo deu errado, a linha daquele passo diz o que o Windows ou o programa respondeu.

<a id="privacy"></a>

## Privacidade e segurança

- **Sem rede.** Sem conta, sincronização, telemetria, relatórios de erro ou verificação de atualização. O único contato com a rede é o que um passo que você escreveu pede a um navegador para abrir.
- **Sem shell.** Programas são iniciados a partir de uma lista de argumentos, nunca por texto de `cmd` ou PowerShell que você escreveu.
- **Sem elevação silenciosa.** Um programa que precisa de direitos de administrador falha com esse motivo; nada os pede pelas suas costas.
- **O Stop só toca no que a execução abriu.**
- **Nenhum segredo guardado.** A senha de uma máquina criptografada é pedida a cada execução e nunca gravada. Enquanto o `vmrun` roda, ela está na linha de comando dele — visível a programas rodando como você, a programas elevados e a softwares de segurança, e registrada onde a auditoria de linha de comando estiver ligada.
- **Perfis importados são revisados** antes de poderem rodar ou ser disparados.
- **A captura não guarda títulos.**

O modelo de ameaças completo é o `SECURITY.md` no repositório do código, github.com/alexjustino/deskstart.
