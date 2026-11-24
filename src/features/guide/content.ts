/**
 * What the welcome and the tour say, in the manual's two languages (1.2).
 *
 * The interface is English; the welcome and the tour speak the language the
 * person chose for the manual, because they are the manual's first page and
 * its moving version (ADR-032). Names on the screen stay as the screen shows
 * them, in bold, so a person finds what they read.
 */

import type { ManualLanguage } from '@/domain/settings';

export interface StepText {
  title: string;
  body: string;
}

export interface GuideText {
  welcome: {
    eyebrow: string;
    title: string;
    lead: string;
    points: { title: string; body: string }[];
    tour: string;
    capture: string;
    empty: string;
    privacy: string;
  };
  steps: Record<string, StepText>;
  next: string;
  back: string;
  skip: string;
  done: string;
  more: string;
  /** "Step 3 of 9" */
  progress: (at: number, of: number) => string;
  end: { title: string; body: string; skipped: string };
}

export const GUIDE_TEXT: Record<ManualLanguage, GuideText> = {
  en: {
    welcome: {
      eyebrow: 'Welcome to Deskstart',
      title: 'Your working day, one button away',
      lead: 'Put the programs, folders, pages and machines you open every morning into a profile. Press Run, and they open in order, on time, where you want them — and every run is written down.',
      points: [
        {
          title: 'One button',
          body: 'A profile runs its steps in order, waits when you ask, and stops only what it opened.',
        },
        {
          title: 'Where it lands',
          body: 'Each window on its screen, at its size — or capture the desktop you already arranged.',
        },
        {
          title: 'On your machine',
          body: 'No account, no cloud, no telemetry. Nothing leaves this computer.',
        },
      ],
      tour: 'Take the tour',
      capture: 'Capture this desktop',
      empty: 'Start from an empty profile',
      privacy: 'You can see this again from Help.',
    },
    steps: {
      rail: {
        title: 'Everything is one click away',
        body: '**Profiles** is where you work. **Runs** keeps every run. **Diagnostics** shows what this machine has. **Settings** and **Help** are at the bottom.',
      },
      'new-profile': {
        title: 'Name a profile',
        body: 'A profile is a morning, a meeting, a project. Type a name and press **Add profile**.',
      },
      capture: {
        title: 'Or capture what is open',
        body: 'Arranged your windows already? **Capture this desktop** turns them into a profile that puts each one back where it is.',
      },
      import: {
        title: 'Or bring one in',
        body: 'A profile someone shared opens for review first: nothing in it runs until you have read and accepted every step.',
      },
      steps: {
        title: 'The steps, in order',
        body: 'Each row is one thing to open. Move it with the arrows, edit it with the pencil. A path that will not work here is marked before you run.',
      },
      'add-step': {
        title: 'Add what you open',
        body: 'An application, a folder, a page, a bookmark folder, a terminal, VS Code or a virtual machine. Time and waiting are set below it.',
      },
      where: {
        title: 'Where the window goes',
        body: 'Pick a screen, a size, maximised. For a folder or a browser, a **window rule** says which new window — never one already open.',
      },
      run: {
        title: 'Run — or try it first',
        body: '**Dry run** writes what would happen and opens nothing. **Run** does it. **Stop** closes what the run opened, and only that.',
      },
      triggers: {
        title: 'Start it without the button',
        body: 'At a time of day, with a key combination from any program, or from the command line.',
      },
      runs: {
        title: 'Every run, written down',
        body: 'Each line is written to the log before you see it, and nothing can change it afterwards.',
      },
      help: {
        title: 'The manual is here',
        body: 'Search it, read it in English or Portuguese, and press **?** on any card to open it at that card.',
      },
    },
    next: 'Next',
    back: 'Back',
    skip: 'Skip the tour',
    done: 'Done',
    more: 'Read more',
    progress: (at, of) => `Step ${at} of ${of}`,
    end: {
      title: 'That is the tour',
      body: 'Start it again any time from Help.',
      skipped:
        'Some steps were left out because there is nothing to show yet — add a profile and take the tour again to see the editor.',
    },
  },
  'pt-BR': {
    welcome: {
      eyebrow: 'Boas-vindas ao Deskstart',
      title: 'Seu dia de trabalho, a um botão',
      lead: 'Coloque num perfil os programas, pastas, páginas e máquinas que você abre toda manhã. Pressione Run e eles abrem em ordem, na hora, onde você quer — e cada execução fica registrada.',
      points: [
        {
          title: 'Um botão',
          body: 'Um perfil roda seus passos em ordem, espera quando você pede e só fecha o que ele abriu.',
        },
        {
          title: 'Onde cada coisa fica',
          body: 'Cada janela na sua tela, no seu tamanho — ou capture a área de trabalho que você já arrumou.',
        },
        {
          title: 'Na sua máquina',
          body: 'Sem conta, sem nuvem, sem telemetria. Nada sai deste computador.',
        },
      ],
      tour: 'Fazer o tour',
      capture: 'Capturar esta área de trabalho',
      empty: 'Começar com um perfil vazio',
      privacy: 'Você pode ver isto de novo pelo Help.',
    },
    steps: {
      rail: {
        title: 'Tudo a um clique',
        body: '**Profiles** é onde você trabalha. **Runs** guarda cada execução. **Diagnostics** mostra o que esta máquina tem. **Settings** e **Help** ficam embaixo.',
      },
      'new-profile': {
        title: 'Dê nome a um perfil',
        body: 'Um perfil é uma manhã, uma reunião, um projeto. Digite um nome e pressione **Add profile**.',
      },
      capture: {
        title: 'Ou capture o que está aberto',
        body: 'Já arrumou suas janelas? **Capture this desktop** transforma tudo num perfil que põe cada janela de volta onde está.',
      },
      import: {
        title: 'Ou traga um pronto',
        body: 'Um perfil que alguém compartilhou abre em revisão: nada roda até você ler e aceitar cada passo.',
      },
      steps: {
        title: 'Os passos, em ordem',
        body: 'Cada linha é uma coisa a abrir. Mova com as setas, edite com o lápis. Um caminho que não vai funcionar aqui aparece marcado antes de rodar.',
      },
      'add-step': {
        title: 'Adicione o que você abre',
        body: 'Um aplicativo, uma pasta, uma página, uma pasta de favoritos, um terminal, o VS Code ou uma máquina virtual. Tempo e espera ficam logo abaixo.',
      },
      where: {
        title: 'Onde a janela fica',
        body: 'Escolha a tela, o tamanho, maximizada. Para uma pasta ou um navegador, uma **regra de janela** diz qual janela nova — nunca uma que já estava aberta.',
      },
      run: {
        title: 'Run — ou teste antes',
        body: '**Dry run** escreve o que aconteceria e não abre nada. **Run** faz. **Stop** fecha o que a execução abriu, e só isso.',
      },
      triggers: {
        title: 'Comece sem o botão',
        body: 'Num horário, com uma combinação de teclas em qualquer programa, ou pela linha de comando.',
      },
      runs: {
        title: 'Cada execução, registrada',
        body: 'Cada linha é gravada no log antes de você vê-la, e nada pode alterá-la depois.',
      },
      help: {
        title: 'O manual está aqui',
        body: 'Busque, leia em inglês ou português, e pressione **?** em qualquer cartão para abrir o manual naquele assunto.',
      },
    },
    next: 'Próximo',
    back: 'Voltar',
    skip: 'Pular o tour',
    done: 'Concluir',
    more: 'Ler mais',
    progress: (at, of) => `Passo ${at} de ${of}`,
    end: {
      title: 'Esse foi o tour',
      body: 'Recomece quando quiser pelo Help.',
      skipped:
        'Alguns passos ficaram de fora porque ainda não há o que mostrar — crie um perfil e faça o tour de novo para ver o editor.',
    },
  },
};
