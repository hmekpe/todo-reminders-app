import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet, Platform, Alert } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { StatusBar } from 'expo-status-bar';

// expo-notifications crashes on load inside Expo Go (Android), so load it defensively.
// In Expo Go the app still works; reminders switch on in a development or standalone build.
let Notifications = null;
try {
  Notifications = require('expo-notifications');
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
      shouldPlaySound: true, shouldSetBadge: false,
    }),
  });
} catch (e) {
  Notifications = null;
}

const KEY = 'todo.tasks.v1';
const THEME_KEY = 'todo.theme.v1';

const THEMES = {
  dark: {
    bg: '#0A0908', card: '#2A2420', cardBorder: '#3D3530', input: '#1E1916', inputBorder: '#4A413B',
    text: '#F6F1ED', muted: '#A89D95', accent: '#FF8A1F', onAccent: '#1A0E00', link: '#FF9F45',
    pill: '#1A1512', danger: '#FF7A6B', track: '#3D3530',
  },
  light: {
    bg: '#F6F3F0', card: '#FFFFFF', cardBorder: '#E4DCD5', input: '#FAF7F4', inputBorder: '#D8CEC6',
    text: '#1B1613', muted: '#6F655E', accent: '#F57C00', onAccent: '#1A0E00', link: '#B45309',
    pill: '#F1E9E2', danger: '#C0392B', track: '#E4DCD5',
  },
};

const fmt = (ts) =>
  new Date(ts).toLocaleString([], { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

const tomorrowNine = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(9, 0, 0, 0);
  return d;
};

async function scheduleReminder(title, date) {
  if (!Notifications) return null;
  try {
    // On Android 13+ the channel must exist before the permission prompt can appear.
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('reminders', {
        name: 'Reminders', importance: Notifications.AndroidImportance.HIGH,
      });
    }
    const { status } = await Notifications.requestPermissionsAsync();
    if (status !== 'granted') return null;
    return await Notifications.scheduleNotificationAsync({
      content: { title: 'Task reminder', body: title },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date, channelId: 'reminders' },
    });
  } catch (e) {
    return null;
  }
}

async function cancelReminder(id) {
  if (!Notifications || !id) return;
  try { await Notifications.cancelScheduledNotificationAsync(id); } catch (e) {}
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Main />
    </SafeAreaProvider>
  );
}

function Main() {
  const [tasks, setTasks] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [themeName, setThemeName] = useState('dark');
  const [filter, setFilter] = useState('all');
  const [text, setText] = useState('');
  const [when, setWhen] = useState(null);
  const [chip, setChip] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [showIOSPicker, setShowIOSPicker] = useState(false);
  const [undo, setUndo] = useState(null);
  const timer = useRef(null);

  const t = THEMES[themeName];
  const st = useMemo(() => makeStyles(t), [themeName]);
  const isDark = themeName === 'dark';

  useEffect(() => {
    Promise.all([AsyncStorage.getItem(KEY), AsyncStorage.getItem(THEME_KEY)])
      .then(([raw, th]) => {
        if (raw) setTasks(JSON.parse(raw));
        if (th === 'light' || th === 'dark') setThemeName(th);
      })
      .finally(() => setLoaded(true));
    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(KEY, JSON.stringify(tasks));
  }, [tasks, loaded]);

  useEffect(() => {
    if (loaded) AsyncStorage.setItem(THEME_KEY, themeName);
  }, [themeName, loaded]);

  const resetForm = () => { setText(''); setWhen(null); setChip(null); setEditingId(null); setShowIOSPicker(false); };
  const setReminder = (date, key) => { setWhen(date); setChip(key); setShowIOSPicker(false); };
  const clearReminder = () => { setWhen(null); setChip(null); setShowIOSPicker(false); };

  const pickTime = () => {
    const start = when || new Date(Date.now() + 60 * 60 * 1000);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: start, mode: 'date', minimumDate: new Date(),
        onChange: (e, d) => {
          if (e.type !== 'set') return;
          DateTimePickerAndroid.open({
            value: d, mode: 'time',
            onChange: (e2, picked) => e2.type === 'set' && setReminder(picked, 'custom'),
          });
        },
      });
    } else {
      setWhen(start);
      setChip('custom');
      setShowIOSPicker(true);
    }
  };

  const save = async () => {
    const title = text.trim();
    if (!title) return;
    if (when && when.getTime() <= Date.now()) {
      Alert.alert('Choose a future time', 'The reminder time has already passed.');
      return;
    }
    const existing = tasks.find((x) => x.id === editingId);
    await cancelReminder(existing?.notifId);
    let notifId = null;
    if (when) {
      notifId = await scheduleReminder(title, when);
      if (!notifId) {
        Alert.alert(
          Notifications ? 'Notifications are off' : 'Reminders need the full app',
          Notifications
            ? 'Allow notifications in your phone settings to get reminders.'
            : 'Reminders are not available in Expo Go. Your task was saved without a reminder; they work in the installed app build.'
        );
      }
    }
    const item = {
      id: editingId ?? Date.now().toString(),
      title, done: existing?.done ?? false,
      remindAt: when ? when.getTime() : null, notifId,
    };
    setTasks((prev) => (editingId ? prev.map((x) => (x.id === editingId ? item : x)) : [item, ...prev]));
    if (filter === 'done') setFilter('all');
    resetForm();
  };

  const toggle = async (task) => {
    if (!task.done) await cancelReminder(task.notifId);
    setTasks((prev) => prev.map((x) => (x.id === task.id ? { ...x, done: !x.done, notifId: null } : x)));
  };

  const startEdit = (task) => {
    setEditingId(task.id);
    setText(task.title);
    const future = task.remindAt && task.remindAt > Date.now();
    setWhen(future ? new Date(task.remindAt) : null);
    setChip(future ? 'custom' : null);
  };

  const remove = async (task) => {
    const index = tasks.findIndex((x) => x.id === task.id);
    await cancelReminder(task.notifId);
    if (editingId === task.id) resetForm();
    setTasks((prev) => prev.filter((x) => x.id !== task.id));
    setUndo({ task, index });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setUndo(null), 5000);
  };

  const undoDelete = async () => {
    if (!undo) return;
    clearTimeout(timer.current);
    const { task, index } = undo;
    setUndo(null);
    let notifId = null;
    if (!task.done && task.remindAt && task.remindAt > Date.now()) {
      notifId = await scheduleReminder(task.title, new Date(task.remindAt));
    }
    const restored = { ...task, notifId };
    setTasks((prev) => {
      const next = [...prev];
      next.splice(Math.min(index, next.length), 0, restored);
      return next;
    });
  };

  const total = tasks.length;
  const doneCount = tasks.filter((x) => x.done).length;
  const activeCount = total - doneCount;
  const pct = total ? Math.round((doneCount / total) * 100) : 0;
  const visible = tasks.filter((x) => (filter === 'all' ? true : filter === 'active' ? !x.done : x.done));
  const dateLabel = new Date().toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }).toUpperCase();

  const empty = {
    all: ['No tasks yet', 'Type a task above and tap Add task.'],
    active: ['All caught up', 'There is nothing left to do.'],
    done: ['Nothing completed yet', 'Finished tasks will show up here.'],
  }[filter];

  const renderTask = ({ item }) => {
    const overdue = item.remindAt && item.remindAt < Date.now() && !item.done;
    return (
      <View style={st.task}>
        <View style={st.taskTop}>
          <TouchableOpacity
            onPress={() => toggle(item)} hitSlop={8} style={[st.check, item.done && st.checkOn]}
            accessibilityRole="checkbox" accessibilityState={{ checked: item.done }}
            accessibilityLabel={`Mark ${item.title} as ${item.done ? 'not done' : 'done'}`}>
            {item.done && <Text style={st.tick}>✓</Text>}
          </TouchableOpacity>
          <View style={st.taskBody}>
            <Text style={[st.taskTitle, item.done && st.taskDone]}>{item.title}</Text>
            {item.remindAt && !item.done ? (
              <View style={st.pill}>
                <Text style={[st.pillText, overdue && { color: t.danger }]}>
                  {overdue ? 'Overdue: ' : 'Reminder: '}{fmt(item.remindAt)}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
        <View style={st.taskBottom}>
          <TouchableOpacity onPress={() => startEdit(item)} style={st.ghostBtn} accessibilityRole="button" accessibilityLabel={`Edit ${item.title}`}>
            <Text style={st.ghostText}>Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => remove(item)} style={st.ghostBtn} accessibilityRole="button" accessibilityLabel={`Delete ${item.title}`}>
            <Text style={[st.ghostText, { color: t.danger }]}>Delete</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  const chips = [
    ['hour', 'In 1 hour', () => setReminder(new Date(Date.now() + 60 * 60 * 1000), 'hour')],
    ['tomorrow', 'Tomorrow 9 AM', () => setReminder(tomorrowNine(), 'tomorrow')],
    ['custom', 'Pick time', pickTime],
  ];

  return (
    <SafeAreaView style={st.safe}>
      <StatusBar style={isDark ? 'light' : 'dark'} />

      <View style={st.page}>
        <View style={st.header}>
          <View style={{ flex: 1 }}>
            <Text style={st.eyebrow}>{dateLabel}</Text>
            <Text style={st.h1}>Tasks</Text>
          </View>
          <TouchableOpacity
            style={st.themeBtn} onPress={() => setThemeName(isDark ? 'light' : 'dark')}
            accessibilityRole="button" accessibilityLabel={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
            <Text style={st.themeText}>{isDark ? 'Light mode' : 'Dark mode'}</Text>
          </TouchableOpacity>
        </View>

        <View style={st.progress}>
          <View style={st.progressRow}>
            <Text style={st.progressText}>{total === 0 ? 'Nothing planned yet' : `${doneCount} of ${total} done`}</Text>
            <Text style={st.progressPct}>{pct}%</Text>
          </View>
          <View style={st.track}><View style={[st.fill, { width: `${pct}%` }]} /></View>
        </View>

        <View style={st.card}>
          {editingId ? (
            <View style={st.editRow}>
              <Text style={st.editLabel}>Editing task</Text>
              <TouchableOpacity onPress={resetForm} hitSlop={10}><Text style={st.link}>Cancel</Text></TouchableOpacity>
            </View>
          ) : null}
          <TextInput
            value={text} onChangeText={setText} onSubmitEditing={save} returnKeyType="done"
            placeholder="What needs doing?" placeholderTextColor={t.muted} style={st.input}
            accessibilityLabel="Task title"
          />
          <Text style={st.label}>Remind me</Text>
          <View style={st.chips}>
            {chips.map(([key, label, onPress]) => {
              const on = chip === key;
              return (
                <TouchableOpacity key={key} onPress={onPress} style={[st.chip, on && st.chipOn]} accessibilityRole="button">
                  <Text style={[st.chipText, on && { color: t.onAccent, fontWeight: '700' }]}>{label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {when ? (
            <View style={st.remRow}>
              <Text style={st.remText}>Reminder set: {fmt(when)}</Text>
              <TouchableOpacity onPress={clearReminder} hitSlop={10}><Text style={st.link}>Remove</Text></TouchableOpacity>
            </View>
          ) : null}
          {showIOSPicker && Platform.OS === 'ios' ? (
            <View>
              <DateTimePicker
                value={when || new Date()} mode="datetime" display="spinner" themeVariant={themeName}
                minimumDate={new Date()} onChange={(_, d) => d && setWhen(d)}
              />
              <TouchableOpacity onPress={() => setShowIOSPicker(false)} style={{ alignSelf: 'flex-end' }}>
                <Text style={st.link}>Done</Text>
              </TouchableOpacity>
            </View>
          ) : null}
          <TouchableOpacity
            style={[st.primary, !text.trim() && st.primaryOff]} onPress={save} disabled={!text.trim()}
            accessibilityRole="button">
            <Text style={st.primaryText}>{editingId ? 'Save changes' : 'Add task'}</Text>
          </TouchableOpacity>
        </View>

        <View style={st.segment}>
          {[['all', 'All', total], ['active', 'Active', activeCount], ['done', 'Done', doneCount]].map(([k, label, n]) => (
            <TouchableOpacity key={k} onPress={() => setFilter(k)} style={[st.segBtn, filter === k && st.segOn]} accessibilityRole="button">
              <Text style={[st.segText, filter === k && { color: t.onAccent, fontWeight: '700' }]}>{`${label} ${n}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <FlatList
        style={{ flex: 1 }}
        data={visible}
        keyExtractor={(x) => x.id}
        renderItem={renderTask}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={st.list}
        ListEmptyComponent={
          <View style={st.empty}>
            <Text style={st.emptyTitle}>{empty[0]}</Text>
            <Text style={st.emptyBody}>{empty[1]}</Text>
          </View>
        }
      />

      {undo ? (
        <View style={st.snack}>
          <Text style={st.snackText}>Task deleted</Text>
          <TouchableOpacity onPress={undoDelete} style={st.snackBtn} accessibilityRole="button">
            <Text style={st.snackAction}>Undo</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const makeStyles = (t) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: t.bg },
  page: { paddingHorizontal: 20 },
  header: { flexDirection: 'row', alignItems: 'center', marginTop: 12 },
  eyebrow: { fontSize: 12, fontWeight: '700', letterSpacing: 1.4, color: t.muted },
  h1: { fontSize: 34, fontWeight: '800', color: t.text, marginTop: 2 },
  themeBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 16, borderRadius: 999, borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.card },
  themeText: { fontSize: 14, fontWeight: '600', color: t.text },
  progress: { marginTop: 16, marginBottom: 16 },
  progressRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressText: { fontSize: 15, color: t.muted },
  progressPct: { fontSize: 15, fontWeight: '700', color: t.link },
  track: { height: 6, borderRadius: 3, backgroundColor: t.track, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: t.accent },
  card: { backgroundColor: t.card, borderRadius: 18, borderWidth: 1, borderColor: t.cardBorder, padding: 16, marginBottom: 16 },
  editRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  editLabel: { fontSize: 13, fontWeight: '700', letterSpacing: 0.6, color: t.link },
  input: { backgroundColor: t.input, borderWidth: 1, borderColor: t.inputBorder, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 17, color: t.text },
  label: { fontSize: 13, fontWeight: '600', color: t.muted, marginTop: 16, marginBottom: 8 },
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  chip: { minHeight: 44, justifyContent: 'center', borderWidth: 1, borderColor: t.inputBorder, backgroundColor: t.input, borderRadius: 999, paddingHorizontal: 16, marginRight: 8, marginBottom: 8 },
  chipOn: { backgroundColor: t.accent, borderColor: t.accent },
  chipText: { fontSize: 15, color: t.text },
  remRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 4, marginBottom: 4 },
  remText: { fontSize: 14, color: t.link, flex: 1, marginRight: 12 },
  link: { fontSize: 15, fontWeight: '600', color: t.link },
  primary: { minHeight: 52, justifyContent: 'center', alignItems: 'center', borderRadius: 14, backgroundColor: t.accent, marginTop: 12 },
  primaryOff: { opacity: 0.4 },
  primaryText: { fontSize: 17, fontWeight: '700', color: t.onAccent },
  segment: { flexDirection: 'row', backgroundColor: t.card, borderRadius: 14, borderWidth: 1, borderColor: t.cardBorder, padding: 4, marginBottom: 4 },
  segBtn: { flex: 1, minHeight: 44, justifyContent: 'center', alignItems: 'center', borderRadius: 10 },
  segOn: { backgroundColor: t.accent },
  segText: { fontSize: 15, color: t.muted, fontWeight: '600' },
  list: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 110 },
  task: { backgroundColor: t.card, borderRadius: 16, borderWidth: 1, borderColor: t.cardBorder, padding: 16, marginBottom: 12 },
  taskTop: { flexDirection: 'row', alignItems: 'flex-start' },
  check: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: t.inputBorder, alignItems: 'center', justifyContent: 'center', marginRight: 14, marginTop: 1 },
  checkOn: { backgroundColor: t.accent, borderColor: t.accent },
  tick: { color: t.onAccent, fontSize: 15, fontWeight: '800' },
  taskBody: { flex: 1 },
  taskTitle: { fontSize: 17, lineHeight: 24, color: t.text },
  taskDone: { color: t.muted, textDecorationLine: 'line-through' },
  taskBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', marginTop: 6 },
  pill: { alignSelf: 'flex-start', marginTop: 8, backgroundColor: t.pill, borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: t.cardBorder },
  pillText: { fontSize: 13, fontWeight: '600', color: t.link },
  ghostBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  ghostText: { fontSize: 15, fontWeight: '600', color: t.muted },
  empty: { alignItems: 'center', paddingTop: 32, paddingHorizontal: 24 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: t.text, marginBottom: 6 },
  emptyBody: { fontSize: 15, color: t.muted, textAlign: 'center' },
  snack: { position: 'absolute', left: 20, right: 20, bottom: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: t.card, borderWidth: 1, borderColor: t.accent, borderRadius: 14, paddingLeft: 18, paddingRight: 6, elevation: 8 },
  snackText: { fontSize: 16, color: t.text, fontWeight: '600' },
  snackBtn: { minHeight: 52, justifyContent: 'center', paddingHorizontal: 16 },
  snackAction: { fontSize: 16, fontWeight: '800', color: t.link },
});
