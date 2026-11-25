import type { Manual } from './types';

/** The user manual, in English — the language of the interface. */
export const MANUAL_EN: Manual = {
  language: 'en',
  title: 'Deskstart manual',
  intro:
    'Deskstart opens your working day with one button. A **profile** is a list of **steps** — programs, folders, files, web pages, bookmark folders, a terminal, VS Code, virtual machines — that run in order, with timing, and put their windows where you want them. Every run is written to a log first and shown on screen second. Everything happens on your machine: there is no account, no cloud, no telemetry and no update check.',
  sections: [
    {
      id: 'start',
      title: 'Getting started',
      summary: 'Your first profile, in a minute.',
      blocks: [
        {
          kind: 'steps',
          items: [
            'In **Profiles**, type a name in **New profile** — say “Morning” — and press **Add profile** (the `+`).',
            'Under **Add a step**, keep the kind **Application** and type the program’s path, for example `%SYSTEMROOT%\\System32\\charmap.exe`. Press **Add step**.',
            'Press **Dry run**. The log shows what would happen — “Would start charmap.exe” — and nothing opens.',
            'Press **Run**. The program opens, and the log says when, and with which process id.',
          ],
        },
        {
          kind: 'note',
          text: 'Arranged your windows already? **Capture this desktop** makes a profile of what is open now — see “Capture this desktop”.',
        },
        { kind: 'h', text: 'The screens' },
        {
          kind: 'list',
          items: [
            '**Home** — where Deskstart opens: your profiles, each one click from Run.',
            '**Profiles** — your profiles, their steps, Run, the latest run’s log and the triggers.',
            '**Runs** — every run of every profile, newest first, each with its full log.',
            '**Diagnostics** — the version, where your workspace is, and which programs a step can call on this machine.',
            '**Settings** — theme, start with Windows, backup and restore, the manual’s language, and About.',
            '**Help** — this manual. A `?` on a card opens it at that card’s section.',
          ],
        },
      ],
    },
    {
      id: 'guide',
      title: 'Home and the guided tour',
      summary: 'Where Deskstart opens, and a tour of the real interface.',
      blocks: [
        {
          kind: 'p',
          text: 'Deskstart opens on **Home**, every time — the first entry on the rail. With no profile yet, Home is the welcome: what Deskstart does, and the ways in — **Create your first profile**, **Capture this desktop**, **Import a profile**, **Take the tour**. With profiles, Home lists them, each with its number of steps, when it last ran and how, **Run** — one click — and **Open**.',
        },
        {
          kind: 'p',
          text: 'The **tour** lights one part of the real interface at a time — Home, the rail, a new profile, capture, import, the steps, Where, Run, triggers, the log and this manual — and says what it is for. **Next** and **Back** move through it; **Skip the tour** or Escape leaves it. A part that is not on screen yet, like the step editor before there is a profile, is skipped, and the last card says so.',
        },
        {
          kind: 'p',
          text: '**Read more** on a tour card opens this manual at that subject, and **Show me in the app** on a manual section starts the tour right at it. Start the whole tour again any time with **Take the tour** in Help.',
        },
        {
          kind: 'p',
          text: 'Press **F1** on any screen to open this manual at the section about that screen. Many sections open with a short scene of Deskstart doing what the section explains; it plays once when it comes into view, and **Replay** plays it again.',
        },
        {
          kind: 'note',
          text: 'Home, the tour and the scenes speak the manual’s language. When Windows is set to reduce motion, the light jumps instead of gliding, each scene is shown finished, and the window opens without its short opening.',
        },
      ],
    },
    {
      id: 'profiles',
      title: 'Profiles and steps',
      summary: 'Add, edit, reorder and remove steps; paths with %NAMES%.',
      blocks: [
        {
          kind: 'p',
          text: 'A profile runs its steps **top to bottom**. Each step row shows what it is, the path as written and — when a `%NAME%` changed it — the absolute path it became. Use the arrows to move a step, the pencil to edit it and the bin to remove it.',
        },
        {
          kind: 'p',
          text: 'Paths may use six names, and only these: `%USERPROFILE%`, `%APPDATA%`, `%LOCALAPPDATA%`, `%PROGRAMFILES%`, `%PROGRAMFILES(X86)%` and `%SYSTEMROOT%`. A path is always resolved to an absolute one before it runs; a relative path is refused.',
        },
        {
          kind: 'p',
          text: 'An application’s **arguments** are a list, one per line, added one at a time. They are handed to the program exactly as written — never through a shell — so a space, a quote or a `&` is just part of an argument.',
        },
        {
          kind: 'note',
          text: 'A step that cannot run on this machine — a path that does not resolve, a waiting rule that points at nothing — is marked on its row, and **Run** stays disabled until it is fixed.',
        },
      ],
    },
    {
      id: 'kinds',
      title: 'Kinds of step',
      summary:
        'Application, folder, file, web page, bookmark folder, terminal, VS Code, virtual machine.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Application** — a program, started directly with its arguments and working directory.',
            '**Folder** — opened in Windows Explorer.',
            '**File** — opened with whatever Windows opens that kind of file with.',
            '**Web page** — an `http` or `https` address, opened in your default browser.',
            '**Bookmark folder** — every page in a Chrome, Edge or Firefox bookmark folder, opened as one browser window. Name the folder as the browser shows it: `Work`, or a path like `Bookmarks bar/Work`. Pages in its subfolders are not opened, and at most 50 pages are.',
            '**Terminal** — Windows Terminal, on a named profile, in a directory (both optional).',
            '**VS Code** — a folder or a `.code-workspace` opened in VS Code.',
            '**Virtual machine** — a Hyper-V, VirtualBox or VMware Workstation machine, started with its console. See “Virtual machines”.',
          ],
        },
        {
          kind: 'p',
          text: 'Browsers, Windows Terminal, VS Code and the hypervisors are found where they install — never on `PATH`. If one is not installed, the editor says so; the step can still be saved, because a profile is often written on one computer and run on another.',
        },
        {
          kind: 'note',
          text: 'Firefox’s bookmarks are read from a **copy** of its database, which is deleted right after: Firefox is never locked or written, and only the bookmark rows are read.',
        },
      ],
    },
    {
      id: 'run',
      title: 'Run, Dry run, Stop and the log',
      summary: 'What each button does, and how to read a run.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Run** starts the steps for real.',
            '**Dry run** writes the whole run to the log — every start, wait, hold and placement — on a virtual clock, at once, and starts **nothing**.',
            '**Stop** ends the run in progress. It closes what **this run** opened — politely first, by force after a few seconds — and nothing else. A program you opened yourself is never touched.',
          ],
        },
        {
          kind: 'p',
          text: 'The log is **append-only**: each line is written to the workspace before it reaches the screen, and nothing in the product can change or delete it. A step that could not start is a line with its reason — “Could not start … : the program was not found at …” — and the run carries on with the next step.',
        },
        {
          kind: 'p',
          text: 'A run ends **completed**, **completed with failures**, **failed** (every step failed) or **stopped**. A skipped step — one whose password was not given, or whose wait timed out — does not count as a failure; the log says why it was skipped.',
        },
      ],
    },
    {
      id: 'time',
      title: 'Time: pause, hold and cycles',
      summary: 'Wait between steps; keep a program open for a while; open it again and again.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Wait after this step** — seconds to pause before the next step starts.',
            '**Keep it open for, then close** — an application only: after this many seconds its windows are asked to close, and it is ended if it does not. Empty leaves it open.',
            '**Open it this many times in all** and **Closed for, between openings** — a cycle: open, hold, close, wait, open again. **Again and again** repeats until the run is stopped.',
          ],
        },
        {
          kind: 'p',
          text: 'Holds never block the profile: the next step starts while a held program is still open. Only applications can be held, because only their process belongs to the run.',
        },
      ],
    },
    {
      id: 'waiting',
      title: 'Waiting for another step',
      summary: 'Start a step only once an earlier one is responding.',
      blocks: [
        {
          kind: 'p',
          text: 'In **Waits for**, pick an earlier step. This step then starts only once that one is **responding**: it has a window of its own, or a **port** you name answers on this machine (for a local server). Set how long to wait.',
        },
        {
          kind: 'p',
          text: 'If the time runs out, the step is **skipped with the reason** and the profile carries on. A step that waits for one that never started is skipped at once.',
        },
      ],
    },
    {
      id: 'where',
      title: 'Where a window goes',
      summary: 'Screen, position, size, maximised; window rules; screens that come and go.',
      blocks: [
        {
          kind: 'p',
          text: 'In **Where**, choose **Normal**, **Maximised** or **Minimised**, a **screen** (1 is the primary, the rest left to right) and, optionally, a **position and size** on that screen — all four numbers, or none. Coordinates are that screen’s own: `0, 0` is its top-left corner.',
        },
        { kind: 'h', text: 'Window rules' },
        {
          kind: 'p',
          text: 'An application’s window is found by the program the run started. Everything else — a folder’s Explorer window, a browser, Windows Terminal, VS Code, a machine’s console, or a program that hands its window to another process, like Notepad on Windows 11 — needs a **window rule**: a piece of the window’s **title**, its **class**, or both.',
        },
        {
          kind: 'note',
          text: 'A rule only ever picks a window that **appeared after the step started**. Windows already open when the step began are never moved, whatever the rule matches.',
        },
        { kind: 'h', text: 'Screens that come and go' },
        {
          kind: 'p',
          text: 'Deskstart watches your screens. Plug one in or out and the list in the editor follows. If a profile places a window on a screen that is not connected now, it says so before you press Run; that window then opens on the primary screen, and the log says so.',
        },
      ],
    },
    {
      id: 'machines',
      title: 'Virtual machines',
      summary: 'Pick machines from each hypervisor; encrypted VMware machines.',
      blocks: [
        {
          kind: 'p',
          text: 'Choose **Virtual machine**, then **Hyper-V**, **VirtualBox** or **VMware**. The editor lists the machines that hypervisor already has on this computer, with the running ones marked. When adding, tick several — each becomes its own step, in the order listed. You can still type a machine name (or, for VMware, the `.vmx` path).',
        },
        {
          kind: 'p',
          text: 'The machine is started and its console opened. The hypervisor is waited for, up to a minute, and what it answers — a machine that is not there, a missing permission — is in the log. Nothing is ever elevated on your behalf.',
        },
        { kind: 'h', text: 'Encrypted VMware machines' },
        {
          kind: 'p',
          text: 'Tick **This machine is encrypted** on a VMware step. When you press **Run**, Deskstart asks for the password of each encrypted machine **before anything starts**. The password is used for that run and **stored nowhere** — not in the profile, not on disk, not in the log, not in an export. Leave a field empty to skip that machine.',
        },
        {
          kind: 'note',
          text: '`vmrun` only takes a password on its command line, so for the seconds it runs, other programs running as you — and security software that records command lines — can see it. Read “Privacy and security”.',
        },
      ],
    },
    {
      id: 'triggers',
      title: 'Triggers: schedule, shortcut, command line',
      summary: 'Start a profile without pressing Run.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Schedule** — a time of day (24-hour), every day or only on weekdays. It is handed to the Windows Task Scheduler, so Deskstart need not be open; the card says whether Windows has it registered.',
            '**Shortcut** — a key combination with Ctrl, Alt or Win and one letter, digit or function key, pressed in any program. A combination another program already holds is refused.',
            '**Command line** — `deskstart.exe --run <profile id>` starts a profile from a script or another tool.',
          ],
        },
        {
          kind: 'p',
          text: 'Closing the window keeps Deskstart in the **tray**, so a schedule or a shortcut has somewhere to arrive. **Quit** is in the tray icon’s menu. A run started by a trigger says so on its heading.',
        },
        {
          kind: 'note',
          text: 'A profile imported from a file cannot be scheduled or given a shortcut until it has been reviewed. A trigger has nobody to ask for a password, so its encrypted machines are skipped.',
        },
      ],
    },
    {
      id: 'capture',
      title: 'Capture this desktop',
      summary: 'Make a profile of the windows open now.',
      blocks: [
        {
          kind: 'steps',
          items: [
            'Arrange your windows the way you want your day to start.',
            'In **Profiles**, press **Capture this desktop**.',
            'Untick the windows that do not belong, give the profile a name, and press **Make a profile**.',
          ],
        },
        {
          kind: 'p',
          text: 'Each window ticked becomes a step that opens it again and puts it back where it is — screen, position, size, maximised or minimised. A program becomes an **Application** step for its program; a Store app, like Calculator, a step that starts it the way the Start menu does; an Explorer window, a **Folder** step for its folder. A window that cannot be a step says why — a program Windows would not name, for one.',
        },
        {
          kind: 'note',
          text: 'Window titles are shown to help you choose and are **not kept**. A program’s arguments are not captured either — add them in the editor if it needs them.',
        },
      ],
    },
    {
      id: 'sharing',
      title: 'Export, import and review',
      summary: 'A profile as a file; nothing imported runs until you have read it.',
      blocks: [
        {
          kind: 'p',
          text: '**Export** writes a profile as a JSON file: its steps, time, waiting and placement — and nothing about this machine. **Import a profile** reads one, from a file or pasted in.',
        },
        {
          kind: 'p',
          text: 'An imported profile **runs nothing** until every step has been **reviewed**: each is shown with its path resolved to an absolute one and each argument on its own line. Read it, then **Accept** it (or **Accept all**). Treat a profile file like a program: it starts programs on your machine.',
        },
      ],
    },
    {
      id: 'settings',
      title: 'Settings, backup and restore',
      summary: 'Theme, start with Windows, the manual’s language, backup.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**Appearance** — Light, Dark, or whatever Windows is set to.',
            '**Start with Windows** — off until you turn it on.',
            '**Manual** — the language this manual is shown in: English or Português (Brasil).',
            '**Back up…** — your whole workspace, every profile and every run, in one file.',
            '**Restore…** — replaces everything with a backup and restarts Deskstart. What is there now is gone unless you back it up first. A backup from a newer version is refused.',
          ],
        },
        {
          kind: 'p',
          text: '**Diagnostics** shows the version, the schema, where the workspace file is, and every program a step can call — found, with its path, or not found.',
        },
      ],
    },
    {
      id: 'troubleshooting',
      title: 'Troubleshooting',
      summary: 'When something did not open, did not move, or did not start.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**“The program was not found at …”** — the path is wrong on this machine. Edit the step; the row shows the absolute path it resolves to.',
            '**“… is not installed where this product looks for it”** — the browser, terminal, editor or hypervisor is not installed here, or not in its usual place. Diagnostics lists where each is looked for.',
            '**“The program did not show a window of its own in time”** — the program handed its window to another process (Notepad on Windows 11, a browser that was already open). Add a **window rule** in Where.',
            '**“No new window answering the rule appeared in time”** — no new window matched. Check the title or class; a window that was already open is never used.',
            '**A shortcut does nothing** — check the Triggers card: another program may hold the combination. Deskstart must be running, in the tray or open.',
            '**Windows SmartScreen warns on install** — the installers are not code-signed. Choose “More info”, then “Run anyway”, if you trust where you got it.',
          ],
        },
        {
          kind: 'p',
          text: 'Every run’s log is in **Runs**. When something went wrong, the line for that step says what Windows or the program answered.',
        },
      ],
    },
    {
      id: 'privacy',
      title: 'Privacy and security',
      summary: 'What Deskstart does, and does not do, on your machine.',
      blocks: [
        {
          kind: 'list',
          items: [
            '**No network.** No account, no sync, no telemetry, no crash reports, no update check. The only network contact is what a step you wrote asks a browser to open.',
            '**No shell.** Programs are started from an argument list, never through `cmd` or PowerShell text you wrote.',
            '**No silent elevation.** A program that needs administrator rights fails with that reason; nothing asks for them behind your back.',
            '**Stop touches only what the run opened.**',
            '**No secrets at rest.** An encrypted machine’s password is asked at each run and never written. While `vmrun` runs, it is on its command line — visible to programs running as you, to elevated programs and to security software, and recorded where command-line auditing is turned on.',
            '**Imported profiles are reviewed** before they can run or be triggered.',
            '**Capture keeps no titles.**',
          ],
        },
        {
          kind: 'p',
          text: 'The full threat model is `SECURITY.md` in the source repository, github.com/alexjustino/deskstart.',
        },
      ],
    },
  ],
};
