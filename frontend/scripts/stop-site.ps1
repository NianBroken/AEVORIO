$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$recordFile = Join-Path $frontendDirectory 'reports\runtime-services.json'

# PID 和启动时间同时吻合才接受停止，避免进程号重用影响其他程序。
if (-not (Test-Path -LiteralPath $recordFile)) { throw '没有本项目的运行进程记录，未操作任何进程。' }
$record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($service in @($record.frontend, $record.backend)) {
    $process = Get-Process -Id $service.processId -ErrorAction SilentlyContinue
    if (-not $process) { Write-Output "记录中的进程 $($service.processId) 已经结束。"; continue }
    $expectedTime = if ($service.startedAt -is [DateTime]) {
        $service.startedAt.ToUniversalTime()
    } else {
        [DateTimeOffset]::Parse($service.startedAt).UtcDateTime
    }
    if ($process.ProcessName -ne 'node' -or [Math]::Abs(($process.StartTime.ToUniversalTime() - $expectedTime).TotalSeconds) -gt 1) {
        throw "进程 $($service.processId) 与本项目启动记录不符，未停止该进程。"
    }
    Stop-Process -Id $process.Id -ErrorAction Stop
    Write-Output "已停止本项目服务进程 $($process.Id)。"
}
