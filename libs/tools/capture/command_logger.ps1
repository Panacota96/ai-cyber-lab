# Dot-source this script in PowerShell:
# . .\libs\tools\capture\command_logger.ps1
#
# Helpers:
# Start-AICLSession [-Project default] [-Operator you]
# Stop-AICLSession [-Summary "..."]
# Invoke-AICL <command> [args...]

if ($global:AICLLoggerActive) { return }
$global:AICLLoggerActive = $true

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..\..")).Path
if ($env:PYTHONPATH) {
    $env:PYTHONPATH = "$repoRoot;$env:PYTHONPATH"
} else {
    $env:PYTHONPATH = "$repoRoot"
}

if (-not $env:AICL_PROJECT) {
    $env:AICL_PROJECT = "default"
}
if (-not $env:AICL_LOG_DIR) {
    $env:AICL_LOG_DIR = Join-Path (Get-Location) "data/projects/_logs"
}
if (-not $env:AICL_SESSION_LOG_COMPRESS_AFTER_DAYS) {
    $env:AICL_SESSION_LOG_COMPRESS_AFTER_DAYS = "1"
}
if (-not $env:AICL_SESSION_LOG_RETENTION_DAYS) {
    $env:AICL_SESSION_LOG_RETENTION_DAYS = "30"
}
New-Item -ItemType Directory -Path $env:AICL_LOG_DIR -Force | Out-Null

if (-not $env:AICL_LOG_FILE) {
    $env:AICL_LOG_FILE = Join-Path $env:AICL_LOG_DIR ("terminal_{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
}

function Write-AICLEvent {
    param(
        [string]$Event,
        [string]$Details = ""
    )

    $session = if ($env:AICL_SESSION_ID) { $env:AICL_SESSION_ID } else { "none" }
    $line = "[{0}] event={1} session={2} project={3} {4}" -f (Get-Date -Format o), $Event, $session, $env:AICL_PROJECT, $Details
    Add-Content -Path $env:AICL_LOG_FILE -Value $line
}

function Invoke-AICLLogMaintenance {
    try {
        python -m libs.tools.capture.sessionctl maintain `
          --log-dir $env:AICL_LOG_DIR `
          --compress-after-days $env:AICL_SESSION_LOG_COMPRESS_AFTER_DAYS `
          --retention-days $env:AICL_SESSION_LOG_RETENTION_DAYS *> $null
    } catch { }
}

function Start-AICLSession {
    param(
        [string]$Project = $env:AICL_PROJECT,
        [string]$Operator = $env:USERNAME
    )

    $env:AICL_PROJECT = $Project
    try {
        $json = python -m libs.tools.capture.sessionctl start --project $Project --operator $Operator 2>$null
        if ($json) {
            $obj = $json | ConvertFrom-Json
            $env:AICL_SESSION_ID = $obj.session_id
        }
    } catch { }

    if (-not $env:AICL_SESSION_ID) {
        $env:AICL_SESSION_ID = "{0}-{1}" -f (Get-Date -Format "yyyyMMdd-HHmmss"), (Get-Random)
    }

    Write-AICLEvent -Event "session_start" -Details ("operator={0}" -f $Operator)
    Write-Output "AICL session started: project=$env:AICL_PROJECT session=$env:AICL_SESSION_ID"
}

function Stop-AICLSession {
    param([string]$Summary = "")

    if ($env:AICL_SESSION_ID) {
        try {
            python -m libs.tools.capture.sessionctl end --project $env:AICL_PROJECT --session-id $env:AICL_SESSION_ID --summary $Summary *> $null
        } catch { }
    }

    Write-AICLEvent -Event "session_end" -Details ("summary={0}" -f $Summary)
    Invoke-AICLLogMaintenance
    Write-Output "AICL session ended: project=$env:AICL_PROJECT session=$env:AICL_SESSION_ID"
    Remove-Item Env:\AICL_SESSION_ID -ErrorAction SilentlyContinue
}

function Invoke-AICL {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Args)

    if (-not $Args -or $Args.Count -eq 0) {
        throw "Usage: Invoke-AICL <command> [args...]"
    }

    $tmp = [System.IO.Path]::GetTempFileName()
    try {
        & $Args[0] $Args[1..($Args.Count-1)] 2>&1 | Tee-Object -FilePath $tmp
        $rc = $LASTEXITCODE
        $hash = (Get-FileHash -Path $tmp -Algorithm SHA256).Hash.ToLower()
        $preview = (Get-Content -Path $tmp -Tail 5) -join " "
        Write-AICLEvent -Event "command_output" -Details ("exit={0} digest={1} output_preview={2} cmd={3}" -f $rc, $hash, $preview, ($Args -join ' '))
        return $rc
    } finally {
        Remove-Item -Path $tmp -ErrorAction SilentlyContinue
    }
}

$previousPrompt = $function:prompt
function global:prompt {
    $last = Get-History -Count 1
    if ($last) {
        Write-AICLEvent -Event "command" -Details ("cwd={0} cmd={1}" -f (Get-Location), $last.CommandLine)
    }
    & $previousPrompt
}

Invoke-AICLLogMaintenance
Write-Output "AICL logger active -> $env:AICL_LOG_FILE"
Write-Output "Use: Start-AICLSession / Stop-AICLSession / Invoke-AICL / Invoke-AICLLogMaintenance"
