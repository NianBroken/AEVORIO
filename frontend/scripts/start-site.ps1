param([string]$NodeExecutable = '')
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$backendDirectory = Join-Path (Split-Path -Parent $frontendDirectory) 'backend'
$recordFile = Join-Path $frontendDirectory 'reports\runtime-services.json'
$ports = Get-Content -LiteralPath (Join-Path $backendDirectory '../shared/ports.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$configuration = @{}
foreach ($line in Get-Content -LiteralPath (Join-Path $backendDirectory '.env') -Encoding UTF8) {
    if ($line -match '^\s*([A-Z_]+)\s*=\s*(.*?)\s*$') { $configuration[$Matches[1]] = $Matches[2].Trim('"', "'") }
}
foreach ($key in @('BACKEND_HOST', 'BACKEND_PORT', 'FRONTEND_ORIGIN')) {
    $override = [Environment]::GetEnvironmentVariable($key)
    if ($override) { $configuration[$key] = $override }
}
if (-not $NodeExecutable) { $NodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source }
if ([int]$configuration.BACKEND_PORT -ne $ports.backend -or ([Uri]$configuration.FRONTEND_ORIGIN).Port -ne $ports.frontend) { throw '端口配置必须为前端 24681、后端 24682。' }
$backendHost = $configuration.BACKEND_HOST
if ($backendHost -in @('0.0.0.0', '::')) { $backendHost = '127.0.0.1' }
$backendUrl = "http://${backendHost}:$($configuration.BACKEND_PORT)"
$frontendUrl = $configuration.FRONTEND_ORIGIN
$supervisorFile = Join-Path $backendDirectory 'dist\backend\src\runtime\supervisor.js'
foreach ($file in @($supervisorFile, (Join-Path $frontendDirectory '.next\BUILD_ID'))) {
    if (-not (Test-Path -LiteralPath $file)) { throw '发布产物不完整，请完成前后端正式构建。' }
}
# 停止旧守护进程，防止端口释放后被旧实例再次占用。
if (Test-Path -LiteralPath $recordFile) {
    $previous = Get-Content -Raw -Encoding UTF8 -LiteralPath $recordFile | ConvertFrom-Json
    if ($previous.status -in @('starting', 'running', 'recovering')) { & (Join-Path $PSScriptRoot 'stop-site.ps1') }
}
foreach ($port in @([int]$configuration.BACKEND_PORT, ([Uri]$frontendUrl).Port)) {
    $listeners = @(Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
    foreach ($ownerId in @($listeners.OwningProcess | Select-Object -Unique)) {
        $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$ownerId"
        if ($owner) {
            Write-Output "释放端口 $port，进程 $ownerId，程序 $($owner.ExecutablePath)，命令 $($owner.CommandLine)"
            Stop-Process -Id $ownerId -Force -ErrorAction Stop
            Wait-Process -Id $ownerId -Timeout 10 -ErrorAction SilentlyContinue
        }
    }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) { throw "端口 $port 未释放，启动已终止。" }
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
            $admin = Invoke-WebRequest -Uri "$frontendUrl/admin/" -TimeoutSec 8 -UseBasicParsing
            if ($public.StatusCode -eq 200 -and $admin.StatusCode -eq 200 -and $admin.Content.Contains("AEVORIO 后台管理")) {
                Write-Output "前台、后台和数据库读取均已通过实际健康检查。前台 $frontendUrl，后台 $frontendUrl/admin/。"
                Write-Output "守护进程 $($supervisor.Id) 在后台运行，服务异常退出后自动恢复。"
                return
            }
        }
    }
    Start-Sleep -Milliseconds 250
}
throw '服务启动超时，请检查运行日志并使用 stop-site.ps1 回收本项目进程。'
