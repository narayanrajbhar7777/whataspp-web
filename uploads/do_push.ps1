$dir = "C:\Users\r_aje\Downloads\whataspp-web-main"
Set-Location $dir
$log = @()

$log += "=== Git Remote ==="
git remote remove origin 2>&1 | Out-Null
$r = git remote add origin https://github.com/narayanrajbhar7777/whataspp-web.git 2>&1
$log += $r

$log += "=== Git Add ==="
$r = git add . 2>&1
$log += $r

$log += "=== Git Commit ==="
$r = git commit -m "feat: auto-link WhatsApp after login, fix logout and navigation bug" 2>&1
$log += $r

$log += "=== Git Branch ==="
$r = git branch -M main 2>&1
$log += $r

$log += "=== Git Push ==="
$r = git push -u origin main 2>&1
$log += $r

$log | Out-File "$dir\git_result.txt" -Encoding UTF8
Write-Host "Done. Check git_result.txt"

