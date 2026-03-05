# Dot-source this script in PowerShell:
# . .\libs\tools\capture\command_logger.ps1

if ($global:AICLLoggerActive) { return }
$global:AICLLoggerActive = $true

if (-not $env:AICL_LOG_DIR) {
    $env:AICL_LOG_DIR = Join-Path (Get-Location) "data/projects/_logs"
}
New-Item -ItemType Directory -Path $env:AICL_LOG_DIR -Force | Out-Null

if (-not $env:AICL_LOG_FILE) {
    $env:AICL_LOG_FILE = Join-Path $env:AICL_LOG_DIR ("terminal_{0}.log" -f (Get-Date -Format "yyyy-MM-dd"))
}

$previousPrompt = $function:prompt
function global:prompt {
    $last = Get-History -Count 1
    if ($last) {
        $line = "[{0}] cwd={1} cmd={2}" -f (Get-Date -Format o), (Get-Location), $last.CommandLine
        Add-Content -Path $env:AICL_LOG_FILE -Value $line
    }
    & $previousPrompt
}

Write-Output "AICL logger active -> $env:AICL_LOG_FILE"
