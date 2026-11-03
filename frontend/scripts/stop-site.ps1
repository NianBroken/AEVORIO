$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$recordFile = Join-Path $frontendDirectory 'reports\runtime-services.json'

# PID 和启动时间同时吻合才接受停止，避免进程号重用影响其他程序。
if (-not (Test-Path -LiteralPath $recordFile)) { throw '没有本项目的运行进程记录，未操作任何进程。' }
$record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
if ($record.supervisor) {
    $supervisor = Get-Process -Id $record.supervisor.processId -ErrorAction SilentlyContinue
    $supervisorTime = if ($record.supervisor.startedAt -is [DateTime]) { $record.supervisor.startedAt.ToUniversalTime() } else { [DateTimeOffset]::Parse($record.supervisor.startedAt).UtcDateTime }
    if ($supervisor -and $supervisor.ProcessName -eq 'node') {
        if ($supervisor.StartTime -and [Math]::Abs(($supervisor.StartTime.ToUniversalTime() - $supervisorTime).TotalSeconds) -gt 1) { throw '守护进程启动时间不匹配，停止操作未执行。' }
        @{ token = $record.supervisor.token } | ConvertTo-Json | Set-Content -Encoding UTF8 -LiteralPath (Join-Path $frontendDirectory 'reports\runtime-stop.json')
        for ($attempt = 0; $attempt -lt 60; $attempt++) {
            $ack = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
            if ($ack.supervisor.token -eq $record.supervisor.token -and $ack.status -eq 'stopped' -and -not (Get-Process -Id $record.supervisor.processId -ErrorAction SilentlyContinue)) { Write-Output '本项目守护进程已验证操作标识，两个服务均已停止。'; return }
            Start-Sleep -Milliseconds 250
        }
        throw '守护进程未确认停止请求，请使用管理员终端核对当前服务，未终止来源不明的进程。'
    }
    $record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
}
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
