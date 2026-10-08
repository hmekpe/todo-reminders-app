# To-Do with Reminders

A simple, polished to-do app with local reminders, built with React Native and Expo. Add tasks, set a reminder time, and get a notification when it's due. Everything is stored on the device and works offline.

**Demo build (Android APK):** https://expo.dev/accounts/hope_musike/projects/todo-app/builds/2c102520-ee4b-46e5-b8b1-4852d27817fc

## Features

**Required**
- Add, edit and delete tasks
- Mark tasks complete (tap the circle) and unmark them
- Local notification at a set time, with quick options (in 1 hour, tomorrow 9 AM) or a custom date and time picker

**Extras**
- Progress bar showing how many tasks are done, with a percentage
- Filters for All, Active and Done, each with a live count
- Overdue tasks are flagged so they stand out
- Undo after deleting a task, which also restores its reminder
- Dark and light themes, remembered between launches
- Tasks and settings are saved on the device with AsyncStorage
- Friendly empty states and a clear message if notification permission is off
- Large touch targets and accessibility labels on controls

## Tech stack

- React Native with Expo
- AsyncStorage for local storage
- expo-notifications for scheduled local reminders
- @react-native-community/datetimepicker for custom reminder times

## Run locally

```bash
npm install
npx expo start
```

Scan the QR code with Expo Go. Tasks work fully in Expo Go, but reminders only fire in the installed app build, because Expo Go does not support notifications on Android. The app shows a message instead of crashing when notifications are unavailable.

## Build the Android APK

```bash
npm install -g eas-cli
eas login
eas build -p android --profile preview
```

## Project structure

```
App.js          The whole app: UI, task logic, storage, reminders
app.json        Expo configuration, icons, plugins
eas.json        EAS build profiles
assets/         App icon, adaptive icon, splash image
```

## Author

Ekpe Hope Mawutor, [github.com/hmekpe](https://github.com/hmekpe)