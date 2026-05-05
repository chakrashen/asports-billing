@echo off
echo ============================================
echo   ASPORTS ZONE - Publish Update
echo ============================================
echo.

:: Check if version bump type was provided
set BUMP=%1
if "%BUMP%"=="" set BUMP=patch

:: Bump version in package.json
echo [1/3] Bumping version (%BUMP%)...
call npm version %BUMP% --no-git-tag-version
if errorlevel 1 (
    echo ERROR: Failed to bump version
    pause
    exit /b 1
)

:: Read new version
for /f "tokens=2 delims=:, " %%a in ('findstr /i "\"version\"" package.json') do set NEW_VERSION=%%~a
echo       New version: %NEW_VERSION%
echo.

:: Build and publish to GitHub Releases
echo [2/3] Building and publishing to GitHub...
echo       This may take a few minutes...
call npx electron-builder --win --publish always
if errorlevel 1 (
    echo ERROR: Build/publish failed
    pause
    exit /b 1
)

echo.
echo [3/3] Committing version bump...
git add package.json package-lock.json
git commit -m "release: v%NEW_VERSION%"
git tag v%NEW_VERSION%
git push origin main --tags

echo.
echo ============================================
echo   SUCCESS! v%NEW_VERSION% published!
echo   All users will get the update automatically.
echo ============================================
pause
