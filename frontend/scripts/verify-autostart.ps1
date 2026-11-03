$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $frontendDirectory 'reports\runtime-services.json'
$registration = Get-Content -LiteralPath (Join-Path $frontendDirectory 'reports\autostart-task.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$task = Get-ScheduledTask -TaskName $registration.taskName -ErrorAction Stop
$before = [DateTime]::UtcNow
Start-ScheduledTask -TaskName $registration.taskName -ErrorAction Stop
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    Start-Sleep -Milliseconds 500
    $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $created = if ($record.supervisor.startedAt -is [DateTime]) { $record.supervisor.startedAt.ToUniversalTime() } else { [DateTimeOffset]::Parse($record.supervisor.startedAt).UtcDateTime }
    if ($record.status -eq 'running' -and $created -ge $before.AddSeconds(-1)) {
        $checks = @()
        foreach ($url in @(($record.frontend.url + '/'), ($record.frontend.url + '/products'), ($record.frontend.url + '/about'), ($record.backend.url + '/admin/'))) {
            $response = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 8
            if ($response.StatusCode -ne 200) { throw '开机任务启动后的实际页面访问失败。' }
            $checks += @{ url = $url; status = $response.StatusCode }
        }
        @{ passed = $true; verifiedAt = [DateTime]::UtcNow.ToString('o'); taskName = $task.TaskName; principal = $task.Principal.UserId; trigger = 'BootTrigger'; processId = $record.supervisor.processId; pages = $checks } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $frontendDirectory 'reports\autostart-verification.json') -Encoding UTF8
        Write-Output '设备启动任务已实际启动守护进程，三个公开页面和后台均返回成功。'
        return
    }
}
throw '开机任务未通过实际启动检查，请检查任务计划和项目运行日志。'
