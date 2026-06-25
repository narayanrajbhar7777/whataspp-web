@echo off
cd /d "C:\Users\r_aje\Downloads\whataspp-web-main"

echo.
echo ============================================
echo  WhatsApp Scheduler - Git Push to GitHub
echo ============================================
echo.

echo [1/4] Staging all files...
git add .

echo [2/4] Committing...
git commit -m "feat: auto-link WhatsApp after login, fix logout and navigation bug"

echo [3/4] Renaming branch to main...
git branch -M main

echo [4/4] Pushing to GitHub...
git push -u origin main

echo.
echo ============================================
echo  Done! Check above for any errors.
echo ============================================
echo.
pause
