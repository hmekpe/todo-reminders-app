# Apply the logo (todo-app)

1. Copy all 6 files from `assets/` into `todo-app\assets\` and choose Replace.
2. In `todo-app\app.json`:
   - change `"name": "todo-app"` to `"name": "Tasks"` (this is the label under the icon; keep `slug` unchanged)
   - set `android.adaptiveIcon.backgroundColor` to `"#0A0908"`
3. Commit and rebuild:
   git add .
   git commit -m "Add app logo"
   npx eas-cli build -p android --profile preview
4. Install the new APK. The icon only changes with a new build.
