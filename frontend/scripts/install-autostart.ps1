$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
$projectDirectory = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$hash = [Security.Cryptography.SHA256]::Create()
try { $identity = ([BitConverter]::ToString($hash.ComputeHash([Text.Encoding]::UTF8.GetBytes($projectDirectory)))).Replace('-', '').Substring(0, 10) } finally { $hash.Dispose() }
$taskName = "AEVORIO-$identity"
$script = Join-Path $PSScriptRoot 'start-site.ps1'
$node = (Get-Command node.exe -ErrorAction Stop).Source
$powershell = (Get-Command powershell.exe -ErrorAction Stop).Source
$action = New-ScheduledTaskAction -Execute $powershell -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`" -NodeExecutable `"$node`"" -WorkingDirectory $projectDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$trigger.Delay = 'PT30S'
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval ([TimeSpan]::FromMinutes(1))
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description '启动本项目的无窗口服务守护进程，读取项目实际配置。' -Force -ErrorAction Stop | Out-Null
@{ taskName=$taskName; verifiedAt=[DateTime]::UtcNow.ToString('o'); state=(Get-ScheduledTask -TaskName $taskName -ErrorAction Stop).State.ToString() } | ConvertTo-Json | Set-Content -LiteralPath (Join-Path (Split-Path -Parent $PSScriptRoot) 'reports\autostart-task.json') -Encoding UTF8
Write-Output "已注册设备启动任务 $taskName，机器启动后延迟三十秒运行项目服务。"
