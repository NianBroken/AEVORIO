param([int]$FrontendPort = 0, [string]$NodeExecutable = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path (Split-Path -Parent $frontendDirectory) 'backend'
$recordFile = Join-Path $frontendDirectory 'reports\runtime-services.json'
$configuration = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $backendDirectory '.env') -Encoding UTF8) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $configuration[$Matches[1]] = $Matches[2].Trim('"', "'") }
}
foreach ($key in @('BACKEND_HOST', 'BACKEND_PORT', 'FRONTEND_ORIGIN')) {
    $override = [Environment]::GetEnvironmentVariable($key)
    if ($override) { $configuration[$key] = $override }
}
if ($FrontendPort -gt 0) { $builder = [UriBuilder]::new($configuration.FRONTEND_ORIGIN); $builder.Port = $FrontendPort; $configuration.FRONTEND_ORIGIN = $builder.Uri.GetLeftPart([UriPartial]::Authority) }
if (-not $NodeExecutable) { $NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source }
$backendHost = $configuration.BACKEND_HOST
if ($backendHost -in @('0.0.0.0', '::')) { $backendHost = '127.0.0.1' }
$backendUrl = "http://${backendHost}:$($configuration.BACKEND_PORT)"
$frontendUrl = $configuration.FRONTEND_ORIGIN
$supervisorFile = Join-Path $backendDirectory 'dist\src\runtime\supervisor.js'
foreach ($file in @($supervisorFile, (Join-Path $backendDirectory 'admin-ui\dist\index.html'), (Join-Path $frontendDirectory '.next\BUILD_ID'))) {
    if (-not (Test-Path -LiteralPath $file)) { throw '发布产物不完整，请完成后端、后台和前台三个正式构建。' }
}
if (Test-Path -LiteralPath $recordFile) {
    $previous = Get-Content -Raw -Encoding UTF8 -LiteralPath $recordFile | ConvertFrom-Json
    if ($previous.supervisor -and $previous.status -in @('starting', 'running', 'recovering')) {
        $existing = Get-Process -Id $previous.supervisor.processId -ErrorAction SilentlyContinue
        $expectedTime = if ($previous.supervisor.startedAt -is [DateTime]) { $previous.supervisor.startedAt.ToUniversalTime() } else { [DateTimeOffset]::Parse($previous.supervisor.startedAt).UtcDateTime }
        if ($existing -and $existing.ProcessName -eq 'node' -and (-not $existing.StartTime -or [Math]::Abs(($existing.StartTime.ToUniversalTime() - $expectedTime).TotalSeconds) -lt 1)) { throw '本项目守护进程已运行，请先使用 stop-site.ps1 停止后再启动。' }
    }
}
foreach ($port in @([int]$configuration.BACKEND_PORT, ([Uri]$frontendUrl).Port)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "端口 $port 已被占用，未操作来源不明的服务。" }
}
# 只传递服务访问配置，数据库凭据由子进程从后端私有配置读取。
$env:BACKEND_HOST = $configuration.BACKEND_HOST
$env:BACKEND_PORT = $configuration.BACKEND_PORT
$env:FRONTEND_ORIGIN = $frontendUrl
$logStamp = [DateTime]::UtcNow.ToString('yyyyMMdd-HHmmss-fff')
foreach ($directory in @($frontendDirectory, $backendDirectory)) {
    $archive = Join-Path $directory "reports\runtime-history\$logStamp"
    New-Item -ItemType Directory -Path $archive -Force | Out-Null
    foreach ($name in @('runtime-output.log', 'runtime-error.log', 'supervisor-output.log', 'supervisor-error.log')) {
        $source = Join-Path $directory "reports\$name"
        if (Test-Path -LiteralPath $source) { Move-Item -LiteralPath $source -Destination (Join-Path $archive $name) }
    }
}
$supervisor = Start-Process -FilePath $NodeExecutable -ArgumentList @('"' + $supervisorFile + '"') -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $backendDirectory 'reports\supervisor-output.log') -RedirectStandardError (Join-Path $backendDirectory 'reports\supervisor-error.log')
for ($attempt = 0; $attempt -lt 120; $attempt++) {
    $supervisor.Refresh()
    if ($supervisor.HasExited) { throw '守护进程启动失败，请检查 backend/reports/supervisor-error.log。' }
    if (Test-Path -LiteralPath $recordFile) {
        $record = Get-Content -LiteralPath $recordFile -Raw -Encoding UTF8 | ConvertFrom-Json
        if ($record.supervisor.processId -eq $supervisor.Id -and $record.status -eq 'running') {
            $public = Invoke-WebRequest -Uri $frontendUrl -TimeoutSec 8 -UseBasicParsing
            $admin = Invoke-WebRequest -Uri "$backendUrl/admin/" -TimeoutSec 8 -UseBasicParsing
            if ($public.StatusCode -eq 200 -and $admin.StatusCode -eq 200) {
                Write-Output "前台、后台和数据库读取均已通过实际健康检查。前台 $frontendUrl，后台 $backendUrl/admin/。"
                Write-Output "守护进程 $($supervisor.Id) 在后台运行，服务异常退出后自动恢复。"
                return
            }
        }
    }
    Start-Sleep -Milliseconds 250
}
throw '服务启动超时，请检查运行日志并使用 stop-site.ps1 回收本项目进程。'
