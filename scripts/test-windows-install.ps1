param(
    [Parameter(Mandatory = $true)]
    [string]$InstallerPath
)

$ErrorActionPreference = "Stop"
$serviceName = "sing-box-daemon-nekolsd"
$installationDirectory = Join-Path $env:ProgramFiles "sing-box-nekolsd"
$applicationPath = Join-Path $installationDirectory "sing-box-nekolsd.exe"
$uninstallerPath = Join-Path $installationDirectory "Uninstall sing-box-nekolsd.exe"
$registryPath = "HKLM:\SOFTWARE\nekolsd\sing-box-nekolsd"

$daemonDataDirectory = Join-Path $env:ProgramData "sing-box-daemon-nekolsd"
$daemonPath = Join-Path $installationDirectory "resources\daemon\sing-box-daemon.exe"
$repositoryRoot = Split-Path -Parent $PSScriptRoot

function Write-Signature([string]$Path) {
    if (-not (Test-Path $Path)) {
        Write-Host "  (missing) $Path"
        return
    }
    $signature = Get-AuthenticodeSignature -FilePath $Path
    $certificate = $signature.SignerCertificate
    Write-Host "  $Path"
    Write-Host "    status=$($signature.Status) $($signature.StatusMessage)"
    if ($null -ne $certificate) {
        Write-Host "    subject=$($certificate.Subject)"
        Write-Host "    issuer=$($certificate.Issuer)"
        Write-Host "    valid=$($certificate.NotBefore) .. $($certificate.NotAfter)"
        $usages = @($certificate.Extensions | Where-Object { $_.Oid.Value -eq "2.5.29.37" } | ForEach-Object { $_.Format($false) })
        Write-Host "    eku=$($usages -join '; ')"
    }
}

function Invoke-Diagnostic([string]$Title, [scriptblock]$Block) {
    Write-Host "--- $Title"
    try {
        & $Block
    } catch {
        Write-Host "  diagnostic failed: $_"
    }
}

# Silent NSIS installs report only an exit code, so on failure run the
# installer's own building blocks again to surface their diagnostics.
function Write-InstallerDiagnostics() {
    Invoke-Diagnostic "Installation state" {
        Write-Host "  installation directory exists: $(Test-Path $installationDirectory)"
        Write-Host "  application exists: $(Test-Path $applicationPath)"
        Write-Host "  daemon exists: $(Test-Path $daemonPath)"
        Write-Host "  daemon data directory exists: $(Test-Path $daemonDataDirectory)"
        Write-Host "  layout registry exists: $(Test-Path $registryPath)"
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        Write-Host "  service: $(if ($null -eq $service) { 'absent' } else { $service.Status })"
    }
    Invoke-Diagnostic "Signatures" {
        Write-Signature $InstallerPath
        Write-Signature $applicationPath
        Write-Signature $daemonPath
    }
    Invoke-Diagnostic "Preflight" {
        $preflight = Join-Path $repositoryRoot "build\installer-preflight.ps1"
        $applicationDataDirectory = Join-Path $env:ProgramData "sing-box-nekolsd"
        $installationID = [Guid]::NewGuid().ToString("B").ToUpperInvariant()
        $output = & "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -File $preflight -InstallationDirectory $installationDirectory -ApplicationDataDirectory $applicationDataDirectory -DaemonWorkingDirectory $daemonDataDirectory -InstallationID $installationID 2>&1
        Write-Host "  exit code: $LASTEXITCODE"
        $output | ForEach-Object { Write-Host "  $_" }
    }
    # A failed service registration makes the installer roll back and remove
    # everything it copied, so unpack the application package into the real
    # installation directory and register the service by hand to see why.
    Invoke-Diagnostic "Daemon service install from the unpacked installer" {
        $extractDirectory = Join-Path $env:RUNNER_TEMP "installer-extract"
        & 7z x -y "-o$extractDirectory" $InstallerPath | Out-Null
        $package = Get-ChildItem $extractDirectory -Recurse -Filter "app-*.7z" | Select-Object -First 1
        if ($null -eq $package) {
            throw "application package not found in the installer"
        }
        & 7z x -y "-o$installationDirectory" $package.FullName | Out-Null
        try {
            Write-Signature $applicationPath
            Write-Signature $daemonPath
            $output = & $daemonPath service install "--working-directory=$daemonDataDirectory" 2>&1
            Write-Host "  install exit code: $LASTEXITCODE"
            $output | ForEach-Object { Write-Host "  $_" }
            $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
            Write-Host "  service after install: $(if ($null -eq $service) { 'absent' } else { $service.Status })"
        } finally {
            & $daemonPath service uninstall 2>&1 | ForEach-Object { Write-Host "  uninstall: $_" }
            Remove-Item -Recurse -Force $installationDirectory -ErrorAction SilentlyContinue
            Remove-Item -Recurse -Force $daemonDataDirectory -ErrorAction SilentlyContinue
        }
    }
    Invoke-Diagnostic "Recent application event log errors" {
        Get-WinEvent -FilterHashtable @{ LogName = "Application"; Level = 1, 2, 3; StartTime = (Get-Date).AddMinutes(-10) } -MaxEvents 20 -ErrorAction SilentlyContinue |
            ForEach-Object { Write-Host "  [$($_.ProviderName)] $($_.Message -replace "`r?`n", ' ')" }
    }
}

function Invoke-Installer([string]$Path) {
    # Silent installations write their progress to this log.
    $installerLog = Join-Path $env:TEMP "sing-box-nekolsd-installer.log"
    Remove-Item $installerLog -ErrorAction SilentlyContinue
    $process = Start-Process -FilePath $Path -ArgumentList "/allusers", "/S" -PassThru
    if (-not $process.WaitForExit(180000)) {
        $process.Kill($true)
        throw "Installer timed out: $Path"
    }
    if ($process.ExitCode -ne 0) {
        Invoke-Diagnostic "Installer log" {
            if (Test-Path $installerLog) {
                Get-Content $installerLog | ForEach-Object { Write-Host "  $_" }
            } else {
                Write-Host "  no installer log was written"
            }
        }
        Write-InstallerDiagnostics
        throw "Installer failed with exit code $($process.ExitCode): $Path"
    }
}

# This test runs only on disposable Windows CI runners.
if ((Test-Path $installationDirectory) -or
    (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
    throw "Installation test requires a clean runner"
}

try {
    Invoke-Installer (Resolve-Path $InstallerPath).Path
    if (-not (Test-Path $applicationPath)) {
        throw "The installer did not install the expected application: $applicationPath"
    }
    $layout = Get-ItemProperty $registryPath
    if ($layout.LayoutVersion -ne 2) {
        throw "The installer did not record the expected installation layout"
    }
    $service = Get-Service -Name $serviceName
    $service.WaitForStatus([System.ServiceProcess.ServiceControllerStatus]::Running, [TimeSpan]::FromSeconds(30))
    $pipe = [System.IO.Pipes.NamedPipeClientStream]::new(
        ".", "ProtectedPrefix\Administrators\sing-box-nekolsd", [System.IO.Pipes.PipeDirection]::InOut
    )
    try {
        $pipe.Connect(30000)
    } finally {
        $pipe.Dispose()
    }
    Write-Host "Application files, installation registry, service startup and daemon pipe verified."
} finally {
    if (Test-Path $uninstallerPath) {
        Invoke-Installer $uninstallerPath
    }
}

$deadline = [DateTime]::UtcNow.AddSeconds(30)
while ((Test-Path $applicationPath) -or (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
    if ([DateTime]::UtcNow -ge $deadline) {
        throw "Uninstaller left the application or service installed"
    }
    Start-Sleep -Milliseconds 500
}
Write-Host "Uninstallation verified."
