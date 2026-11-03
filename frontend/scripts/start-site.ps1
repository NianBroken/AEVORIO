param(
    [ValidateRange(1, 65535)]
    [int]$FrontendPort = $(if ($env:PORT) { [int]$env:PORT } else { 3000 })
)

$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)

# 所有位置从脚本自身推导，后台进程使用已构建产物且不打开额外终端窗口。
$frontendDirectory = Split-Path -Parent $PSScriptRoot
$projectDirectory = Split-Path -Parent $frontendDirectory
$backendDirectory = Join-Path $projectDirectory 'backend'
$recordFile = Join-Path $frontendDirectory 'reports\runtime-services.json'
$nodeExecutable = (Get-Command node.exe -ErrorAction Stop).Source
$backendPort = 3101
$backendHost = '127.0.0.1'
$configurationFile = Join-Path $backendDirectory '.env'
$newProcesses = [System.Collections.Generic.List[System.Diagnostics.Process]]::new()

if (-not (Test-Path -LiteralPath $configurationFile)) {
    throw '没有 backend/.env，请先按照后端说明填写数据库配置。'
}

# 仅读取服务端口和监听地址，不把数据库凭据放入进程记录或控制台。
foreach ($line in Get-Content -LiteralPath $configurationFile -Encoding UTF8) {
    if ($line -match '^\s*BACKEND_PORT\s*=\s*(\d+)\s*$') { $backendPort = [int]$Matches[1] }
    if ($line -match '^\s*BACKEND_HOST\s*=\s*([^#\s]+)\s*$') { $backendHost = $Matches[1].Trim('"', "'") }
}
if ($env:BACKEND_PORT) { $backendPort = [int]$env:BACKEND_PORT }
if ($env:BACKEND_HOST) { $backendHost = $env:BACKEND_HOST }
if ($backendPort -lt 1 -or $backendPort -gt 65535 -or $backendPort -eq $FrontendPort) {
    throw '前后端端口须为不同的有效端口。'
}
$browserBackendHost = if ($backendHost -in @('0.0.0.0', '::')) { '127.0.0.1' } else { $backendHost }
$backendUrl = "http://${browserBackendHost}:$backendPort"
$frontendUrl = "http://127.0.0.1:$FrontendPort"

function Wait-ForWebsite {
    param([string]$Url, [bool]$IsBackend)
    for ($attempt = 0; $attempt -lt 60; $attempt++) {
        try {
            $response = Invoke-WebRequest -Uri $Url -TimeoutSec 2
            if ($response.StatusCode -eq 200) {
                if (-not $IsBackend) { return }
                $payload = $response.Content | ConvertFrom-Json
                if ($payload.Code -eq 0 -and $payload.Data.page.sections.Count -eq 12) { return }
            }
        } catch {
            # 新进程完成初始化前的连接拒绝由下次有界重试继续确认。
        }
        Start-Sleep -Milliseconds 250
    }
    throw "服务未能通过实际 HTTP 验证，请查看对应 reports 目录中的运行日志：$Url"
}

foreach ($file in @(
    (Join-Path $backendDirectory 'dist\src\server.js'),
    (Join-Path $frontendDirectory '.next\BUILD_ID')
)) {
    if (-not (Test-Path -LiteralPath $file)) { throw '缺少发布产物，请先分别执行前后端的 npm run build。' }
}
foreach ($port in @($backendPort, $FrontendPort)) {
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        throw "端口 $port 已被占用。请先核对当前进程并使用 stop-site.ps1 停止本项目记录的服务，未覆盖现有服务。"
    }
}

try {
    $backendProcess = Start-Process -FilePath $nodeExecutable -ArgumentList @('dist/src/server.js') `
        -WorkingDirectory $backendDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $backendDirectory 'reports\runtime-output.log') `
        -RedirectStandardError (Join-Path $backendDirectory 'reports\runtime-error.log')
    $newProcesses.Add($backendProcess)
    Wait-ForWebsite -Url "$backendUrl/api/v1/site?page=home" -IsBackend $true

    $frontendProcess = Start-Process -FilePath $nodeExecutable `
        -ArgumentList @('node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', $FrontendPort) `
        -WorkingDirectory $frontendDirectory -WindowStyle Hidden -PassThru `
        -RedirectStandardOutput (Join-Path $frontendDirectory 'reports\runtime-output.log') `
        -RedirectStandardError (Join-Path $frontendDirectory 'reports\runtime-error.log')
    $newProcesses.Add($frontendProcess)
    Wait-ForWebsite -Url $frontendUrl -IsBackend $false

    [ordered]@{
        generatedAt = [DateTime]::UtcNow.ToString('o')
        backend = @{ processId = $backendProcess.Id; startedAt = $backendProcess.StartTime.ToUniversalTime().ToString('o'); url = $backendUrl }
        frontend = @{ processId = $frontendProcess.Id; startedAt = $frontendProcess.StartTime.ToUniversalTime().ToString('o'); url = $frontendUrl }
    } | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $recordFile -Encoding UTF8

    Write-Output "后端已通过数据库与 HTTP 核验，进程 $($backendProcess.Id)，地址 $backendUrl"
    Write-Output "前端已通过 HTTP 核验，进程 $($frontendProcess.Id)，网站 $frontendUrl"
    Write-Output '两个进程在后台持续运行。进程记录位于 frontend/reports/runtime-services.json。'
} catch {
    # 仅回收当前脚本创建的进程，不终止端口上原有或来源不明的服务。
    foreach ($process in $newProcesses) {
        if (-not $process.HasExited) { $process.Kill(); $process.WaitForExit() }
    }
    throw
}
