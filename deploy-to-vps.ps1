param (
    [Parameter(Mandatory=$true, HelpMessage="VPS SSH host, e.g. root@your-vps-ip")]
    [string]$Server,
    [string]$RemotePath = "/var/www/wacrm"
)

Write-Host "🚀 Deploying to $Server:$RemotePath without GitHub..." -ForegroundColor Cyan

# 1. Package and stream files directly to the server via SSH (excludes heavy build dirs)
Write-Host "📦 Packaging and transferring project files..." -ForegroundColor Yellow
tar --exclude="node_modules" --exclude=".next" --exclude=".git" --exclude="*.log" -czf - . | ssh $Server "mkdir -p $RemotePath && tar -xzf - -C $RemotePath"

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ File transfer failed. Please check your SSH connection and credentials." -ForegroundColor Red
    exit $LASTEXITCODE
}

# 2. Trigger the deploy script on the VPS
Write-Host "🏗️ Building and restarting PM2 on VPS..." -ForegroundColor Yellow
ssh $Server "cd $RemotePath && bash deploy.sh --no-pull"

if ($LASTEXITCODE -eq 0) {
    Write-Host "🎉 Deployment completed successfully!" -ForegroundColor Green
} else {
    Write-Host "❌ Deployment failed on VPS." -ForegroundColor Red
}
