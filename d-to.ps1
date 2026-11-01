param (
    [Parameter(Mandatory=$false)]
    [string]$Server = "root@129.121.133.172",
    [string]$RemotePath = "/var/www/wacrm"
)

Write-Host "Deploying to ${Server}:${RemotePath} without GitHub..." -ForegroundColor Cyan

# 1. Package and stream files directly to the server via SSH (excludes heavy build dirs and env secrets)
Write-Host "Packaging and transferring project files..." -ForegroundColor Yellow
$tarCmd = "tar --exclude=node_modules --exclude=.next --exclude=.git --exclude=.env* --exclude=*.log -czf - ."
$remoteExtract = "mkdir -p $RemotePath ; cd $RemotePath ; tar -xzf -"

cmd /c "$tarCmd | ssh $Server `"$remoteExtract`""

if ($LASTEXITCODE -ne 0) {
    Write-Host "File transfer failed. Please check your SSH connection." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Trigger the deploy script on the VPS
Write-Host "Building and restarting PM2 on VPS..." -ForegroundColor Yellow
ssh $Server "bash -c 'cd $RemotePath && bash deploy.sh --no-pull'"

if ($LASTEXITCODE -eq 0) {
    Write-Host "Deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "Deployment failed on VPS." -ForegroundColor Red
    exit $LASTEXITCODE
}
