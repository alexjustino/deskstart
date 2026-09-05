#requires -Version 7
<#
.SYNOPSIS
    The validation battery. Nothing merges with a red gate.

.DESCRIPTION
    One script, run identically on a developer machine and in CI, so the two can
    never disagree about what "green" means.

    Every gate runs even after an earlier one fails: a single run should report
    everything that is wrong, not just the first thing. The script exits non-zero
    if any gate failed.

.NOTES
    The lint gate is not cosmetic. A React hook placed after an early return
    type-checks cleanly and crashes the screen at runtime; `react-hooks/rules-of-hooks`
    is configured as an error precisely to catch that class of bug, which `tsc`
    cannot see.
#>

$ErrorActionPreference = 'Continue'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

$results = [System.Collections.Generic.List[object]]::new()

function Invoke-Gate {
    param(
        [Parameter(Mandatory)] [string] $Name,
        [Parameter(Mandatory)] [scriptblock] $Command,
        [string] $WorkingDirectory = $root
    )

    Write-Host ''
    Write-Host "── $Name " -NoNewline -ForegroundColor Cyan
    Write-Host ('─' * [Math]::Max(0, 60 - $Name.Length)) -ForegroundColor DarkGray

    Push-Location $WorkingDirectory
    $started = Get-Date
    try {
        & $Command
        $ok = ($LASTEXITCODE -eq 0)
    }
    catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        $ok = $false
    }
    finally {
        Pop-Location
    }

    $results.Add([pscustomobject]@{
        Name    = $Name
        Passed  = $ok
        Seconds = [Math]::Round(((Get-Date) - $started).TotalSeconds, 1)
    })
}

$tauri = Join-Path $root 'src-tauri'

Invoke-Gate 'version'      { node scripts/check-version.mjs }
Invoke-Gate 'cargo fmt'    { cargo fmt --all -- --check } $tauri
Invoke-Gate 'cargo clippy' { cargo clippy --all-targets -- -D warnings } $tauri
Invoke-Gate 'cargo test'   { cargo test } $tauri
Invoke-Gate 'tsc'          { npm run --silent typecheck }
Invoke-Gate 'eslint'       { npm run --silent lint }
Invoke-Gate 'prettier'     { npm run --silent format:check }
Invoke-Gate 'vitest'       { npm run --silent test }

Write-Host ''
Write-Host '── summary ───────────────────────────────────────────────────────' -ForegroundColor DarkGray
foreach ($result in $results) {
    $mark  = if ($result.Passed) { 'PASS' } else { 'FAIL' }
    $color = if ($result.Passed) { 'Green' } else { 'Red' }
    Write-Host ('  {0,-6} {1,-16} {2,6}s' -f $mark, $result.Name, $result.Seconds) -ForegroundColor $color
}

$failed = @($results | Where-Object { -not $_.Passed })
Write-Host ''
if ($failed.Count -gt 0) {
    Write-Host "$($failed.Count) gate(s) failed: $($failed.Name -join ', ')" -ForegroundColor Red
    exit 1
}

Write-Host 'All gates green.' -ForegroundColor Green
exit 0
