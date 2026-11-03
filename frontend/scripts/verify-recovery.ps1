$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$recordPath = Join-Path $frontendDirectory 'reports\runtime-services.json'
$checks = @()
# 仅终止记录身份一致的项目子进程，实际观察守护进程恢复与 HTTP 成功。
foreach ($name in @('backend', 'frontend')) {
    $record = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $service = $record.$name
    $child = Get-Process -Id $service.processId -ErrorAction Stop
    $expected = if ($service.startedAt -is [DateTime]) { $service.startedAt.ToUniversalTime() } else { [DateTimeOffset]::Parse($service.startedAt).UtcDateTime }
    if ($child.ProcessName -ne 'node' -or -not $child.StartTime -or [Math]::Abs(($child.StartTime.ToUniversalTime() - $expected).TotalSeconds) -gt 1) { throw '故障验证的进程身份不一致，未执行停止。' }
    Stop-Process -Id $child.Id -ErrorAction Stop
    $recovered = $false
    for ($attempt = 0; $attempt -lt 120; $attempt++) {
        Start-Sleep -Milliseconds 250
        $current = Get-Content -LiteralPath $recordPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($current.$name.processId -ne $service.processId -and $current.$name.restarts -gt $service.restarts) {
            $url = if ($name -eq 'backend') { $current.backend.url + '/api/v1/site?page=home' } else { $current.frontend.url + '/' }
            try { $response = Invoke-WebRequest -Uri $url -TimeoutSec 2 -UseBasicParsing } catch { continue }
            if ($response.StatusCode -eq 200) { $checks += @{ service = $name; previousPid = $service.processId; recoveredPid = $current.$name.processId; restarts = $current.$name.restarts; httpStatus = $response.StatusCode }; $recovered = $true; break }
        }
    }
    if (-not $recovered) { throw '守护进程未完成自动恢复，请检查实际运行日志。' }
}
@{ passed = $true; verifiedAt = [DateTime]::UtcNow.ToString('o'); checks = $checks } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $frontendDirectory 'reports\recovery-verification.json') -Encoding UTF8
Write-Output '前后端异常退出均已由守护进程恢复，并通过实际 HTTP 验证。'
