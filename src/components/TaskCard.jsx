import { useState, useEffect, useRef } from 'react';
import { Trash2, Plus, BellRing, CheckSquare, ChevronDown, ChevronUp, Clock, GripVertical, Minimize2, SlidersHorizontal } from 'lucide-react';
import { storageManager } from '../utils/localStorage';
import '../styles/TaskCard.css';

const PRIORITIES = {
  high: { label: 'High', marker: '🔴', rank: 0 },
  medium: { label: 'Medium', marker: '🟠', rank: 1 },
  low: { label: 'Low', marker: '🟢', rank: 2 },
};

function makeReminderDate(hour, minute, period) {
  const date = new Date();
  const hour24 = (Number(hour) % 12) + (period === 'PM' ? 12 : 0);
  date.setHours(hour24, Number(minute), 0, 0);
  return date.toISOString();
}

function getReminderParts(value) {
  const date = value ? new Date(value) : new Date();
  const hour24 = date.getHours();
  return {
    hour: String(hour24 % 12 || 12),
    minute: String(date.getMinutes()).padStart(2, '0'),
    period: hour24 >= 12 ? 'PM' : 'AM',
  };
}

function getNextReminderDate() {
  const date = new Date();
  date.setSeconds(0, 0);
  date.setMinutes(Math.ceil((date.getMinutes() + 1) / 5) * 5);
  return date.toISOString();
}

function TaskReminderPicker({ value, onChange, label = 'Reminder time' }) {
  if (!value) {
    return (
      <button type="button" className="task-set-reminder" onClick={() => onChange(getNextReminderDate())}>
        <BellRing size={12} /> Set reminder
      </button>
    );
  }

  const parts = getReminderParts(value);
  const updatePart = (key, nextValue) => {
    onChange(makeReminderDate(key === 'hour' ? nextValue : parts.hour, key === 'minute' ? nextValue : parts.minute, key === 'period' ? nextValue : parts.period));
  };

  return (
    <div className="task-time-picker" aria-label={label}>
      <Clock size={13} className="time-icon" />
      <select aria-label={`${label} hour`} value={parts.hour} onChange={(event) => updatePart('hour', event.target.value)}>
        {Array.from({ length: 12 }, (_, index) => String(index + 1)).map((hour) => <option key={hour} value={hour}>{hour}</option>)}
      </select>
      <span>:</span>
      <select aria-label={`${label} minute`} value={parts.minute} onChange={(event) => updatePart('minute', event.target.value)}>
        {Array.from({ length: 60 }, (_, minute) => String(minute).padStart(2, '0')).map((minute) => <option key={minute} value={minute}>{minute}</option>)}
      </select>
      <select aria-label={`${label} AM or PM`} value={parts.period} onChange={(event) => updatePart('period', event.target.value)}>
        <option value="AM">AM</option>
        <option value="PM">PM</option>
      </select>
      <button type="button" className="task-clear-reminder" aria-label="Clear reminder" title="Clear reminder" onClick={() => onChange(null)}>×</button>
    </div>
  );
}

function getTaskDate(task) {
  const date = Date.parse(task.createdAt || '');
  return Number.isFinite(date) ? date : Number(task.id) || 0;
}

function formatReminderTime(value) {
  if (!value) return 'No reminder';
  return new Date(value).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

export default function TaskCard({ minimized = false, onToggleMinimize }) {
  const [tasks, setTasks] = useState(() => storageManager.getTasks() || []);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReminder, setNewTaskReminder] = useState(null);
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const notificationAudioContextRef = useRef(null);

  const getNotificationAudioContext = () => {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;

    if (!notificationAudioContextRef.current) {
      notificationAudioContextRef.current = new AudioContextClass();
    }

    return notificationAudioContextRef.current;
  };

  const unlockNotificationAudio = () => {
    try {
      const audioContext = getNotificationAudioContext();
      if (audioContext?.state === 'suspended') {
        audioContext.resume().catch((err) => {
          console.warn('Task reminder audio could not be resumed', err);
        });
      }
    } catch (err) {
      console.warn('Task reminder audio could not be initialized', err);
    }
  };

  const playNotificationSound = async () => {
    try {
      const audioContext = getNotificationAudioContext();
      if (!audioContext) return;
      if (audioContext.state === 'suspended') await audioContext.resume();
      if (audioContext.state !== 'running') return;

      const playChime = (frequency, startTime) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(frequency, startTime);
        gain.gain.setValueAtTime(0.15, startTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.4);
        oscillator.connect(gain);
        gain.connect(audioContext.destination);
        oscillator.start(startTime);
        oscillator.stop(startTime + 0.4);
      };

      const now = audioContext.currentTime;
      playChime(587.33, now);
      playChime(880, now + 0.15);
    } catch (err) {
      console.warn('Task reminder sound could not be played', err);
    }
  };

  useEffect(() => {
    const checkReminders = () => {
      const now = new Date();

      const dueTasks = tasks.filter((task) =>
        !task.completed && task.reminder && !task.notified && now >= new Date(task.reminder)
      );
      if (dueTasks.length === 0) return;

      dueTasks.forEach(() => { void playNotificationSound(); });
      window.dispatchEvent(new CustomEvent('task-reminder-due', {
        detail: { tasks: dueTasks.map((task) => ({ id: task.id, title: task.title })) },
      }));
      const dueTaskIds = new Set(dueTasks.map((task) => task.id));
      const updatedTasks = tasks.map((task) =>
        dueTaskIds.has(task.id) ? { ...task, notified: true } : task
      );
      setTasks(updatedTasks);
      storageManager.saveTasks(updatedTasks);
    };

    checkReminders();
    const interval = setInterval(checkReminders, 1000);

    return () => clearInterval(interval);
  }, [tasks]);

  const handleAddTask = () => {
    if (!newTaskTitle.trim()) return;

    const newTask = {
      id: Date.now(),
      title: newTaskTitle.trim(),
      reminder: newTaskReminder,
      completed: false,
      notified: false,
      priority: newTaskPriority,
      createdAt: new Date().toISOString(),
    };

    const updated = [...tasks, newTask];
    setTasks(updated);
    storageManager.addTask(newTask);
    storageManager.recordAnalyticsEvent({ type: 'task_created' });
    setNewTaskTitle('');
    setNewTaskReminder(null);
    setNewTaskPriority('medium');
    setIsAddingTask(false);
  };

  const handleDeleteTask = (e, id) => {
    e.stopPropagation();
    const updated = tasks.filter((task) => task.id !== id);
    setTasks(updated);
    storageManager.deleteTask(id);
  };

  const handleToggleTask = (e, id) => {
    e.stopPropagation();
    const updated = tasks.map((t) => {
      if (t.id === id) {
        const nextState = !t.completed;
        const updates = { completed: nextState };
        storageManager.updateTask(id, updates);
        if (nextState) {
          storageManager.recordAnalyticsEvent({ type: 'task_completed' });
          window.dispatchEvent(new CustomEvent('task-completed', { detail: { title: t.title } }));
        }
        return { ...t, completed: nextState };
      }
      return t;
    });
    setTasks(updated);
  };

  const handleTaskTitleChange = (taskId, value) => {
    const updated = tasks.map((task) => (task.id === taskId ? { ...task, title: value } : task));
    setTasks(updated);
    storageManager.updateTask(taskId, { title: value });
  };

  const handleTaskTimeChange = (taskId, isoTime) => {
    const updated = tasks.map((task) => 
      task.id === taskId ? { ...task, reminder: isoTime, notified: false } : task
    );
    setTasks(updated);
    storageManager.updateTask(taskId, { reminder: isoTime, notified: false });
  };

  const handleTaskPriorityChange = (taskId, priority) => {
    const updated = tasks.map((task) => task.id === taskId ? { ...task, priority } : task);
    setTasks(updated);
    storageManager.updateTask(taskId, { priority });
  };

  const reorderTasks = (targetId) => {
    if (draggedTaskId === null || draggedTaskId === targetId) return;
    const reordered = [...tasks];
    const sourceIndex = reordered.findIndex((task) => task.id === draggedTaskId);
    const targetIndex = reordered.findIndex((task) => task.id === targetId);
    if (sourceIndex < 0 || targetIndex < 0) return;
    const [movedTask] = reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, movedTask);
    setTasks(reordered);
    storageManager.saveTasks(reordered);
    setDraggedTaskId(null);
  };

  const sortTaskGroup = (group) => {
    if (sortOrder === 'custom') return group;
    return [...group].sort((left, right) => {
      if (sortOrder === 'priority') return (PRIORITIES[left.priority]?.rank ?? 1) - (PRIORITIES[right.priority]?.rank ?? 1);
      if (sortOrder === 'alphabetical') return left.title.localeCompare(right.title);
      return getTaskDate(right) - getTaskDate(left);
    });
  };

  const sortedTasks = [
    ...sortTaskGroup(tasks.filter((task) => !task.completed)),
    ...sortTaskGroup(tasks.filter((task) => task.completed)),
  ];

  if (minimized) {
    return (
      <button
        type="button"
        className="task-minimized-button"
        onClick={onToggleMinimize}
        aria-label="Restore tasks"
        title="Restore tasks"
      >
        <CheckSquare size={24} />
      </button>
    );
  }

  return (
    <div className="task-card" onPointerDown={unlockNotificationAudio}>
      <header className="task-header">
        <div className="task-header-title">
          <h2>Today's Tasks</h2>
          <span className="task-badge">{tasks.filter((t) => !t.completed).length} active</span>
        </div>
        <button
          onClick={() => setIsAddingTask(!isAddingTask)}
          className={`task-add-btn ${isAddingTask ? 'active' : ''}`}
          aria-label="Add new task"
        >
          <Plus size={16} />
          <span>New Task</span>
        </button>
        <button
          type="button"
          onClick={onToggleMinimize}
          className="task-minimize-btn"
          title="Minimize tasks"
          aria-label="Minimize tasks"
        >
          <Minimize2 size={15} />
        </button>
      </header>

      {isAddingTask && (
        <div className="task-add-form">
          <input
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleAddTask()}
            placeholder="What needs to be done today?"
            className="task-input"
            autoFocus
          />
          <div className="task-add-row">
            <div className="task-add-options">
              <label className={`task-priority-tag priority-${newTaskPriority}`}>
                <span>{PRIORITIES[newTaskPriority].marker}</span>
                <select aria-label="New task priority" value={newTaskPriority} onChange={(event) => setNewTaskPriority(event.target.value)}>
                  {Object.entries(PRIORITIES).map(([value, priority]) => <option key={value} value={value}>{priority.label}</option>)}
                </select>
              </label>
              <TaskReminderPicker value={newTaskReminder} onChange={setNewTaskReminder} label="New task reminder" />
            </div>
            <div className="task-add-actions">
              <button onClick={handleAddTask} className="task-submit-btn">
                Add Task
              </button>
              <button onClick={() => setIsAddingTask(false)} className="task-cancel-btn">
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="task-list">
        {tasks.length === 0 ? (
          <div className="task-empty">
            <CheckSquare size={32} className="task-empty-icon" />
            <p>All caught up for today!</p>
            <span>Add a task with an optional time reminder.</span>
          </div>
        ) : (
          <>
            <div className="task-list-toolbar">
              <label className="task-sort-control">
                <span>Sort</span>
                <select aria-label="Sort tasks" value={sortOrder} onChange={(event) => setSortOrder(event.target.value)}>
                  <option value="newest">Newest first</option>
                  <option value="priority">Priority</option>
                  <option value="alphabetical">Alphabetical</option>
                  <option value="custom">Custom order</option>
                </select>
              </label>
              {sortOrder === 'custom' && <span className="task-arrange-hint">Drag to arrange</span>}
            </div>
            {sortedTasks.map((task) => (
            <div
              key={task.id}
              className={`task-item ${task.completed ? 'is-completed' : ''} ${sortOrder === 'custom' ? 'is-arrangeable' : ''} ${draggedTaskId === task.id ? 'is-dragging' : ''}`}
              draggable={sortOrder === 'custom'}
              onMouseDown={(event) => event.stopPropagation()}
              onDragStart={() => setDraggedTaskId(task.id)}
              onDragOver={(event) => { if (sortOrder === 'custom') event.preventDefault(); }}
              onDrop={(event) => { event.preventDefault(); reorderTasks(task.id); }}
              onDragEnd={() => setDraggedTaskId(null)}
            >
              {sortOrder === 'custom' && <GripVertical className="task-drag-handle" size={14} />}
              <input
                type="checkbox"
                checked={task.completed}
                onChange={(e) => handleToggleTask(e, task.id)}
                className="task-checkbox"
              />

              <div className="task-item-main">
                <div className="task-item-primary">
                  <input
                    className={`task-item-title-input ${task.completed ? 'completed' : ''}`}
                    value={task.title}
                    onChange={(e) => handleTaskTitleChange(task.id, e.target.value)}
                    placeholder="Task title..."
                  />
                  <span className={`task-priority-summary priority-${task.priority || 'medium'}`} title={`${PRIORITIES[task.priority]?.label || 'Medium'} priority`} aria-label={`${PRIORITIES[task.priority]?.label || 'Medium'} priority`}>
                    {PRIORITIES[task.priority]?.marker || PRIORITIES.medium.marker}
                  </span>
                  <span className={`task-reminder-summary ${task.notified ? 'is-notified' : ''}`} title={formatReminderTime(task.reminder)}>
                    {task.reminder && task.notified ? <BellRing size={13} /> : <Clock size={13} />}
                    {task.reminder && <span>{formatReminderTime(task.reminder)}</span>}
                  </span>
                  <button
                    type="button"
                    className="task-edit-toggle"
                    aria-label={`${editingTaskId === task.id ? 'Close' : 'Edit'} options for ${task.title}`}
                    aria-expanded={editingTaskId === task.id}
                    title="Edit priority and reminder"
                    onClick={() => setEditingTaskId((currentId) => currentId === task.id ? null : task.id)}
                  >
                    <SlidersHorizontal size={14} />
                    {editingTaskId === task.id ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                </div>
                {editingTaskId === task.id && (
                  <div className="task-item-edit-panel">
                    <label className={`task-priority-tag priority-${task.priority || 'medium'}`}>
                      <span>{PRIORITIES[task.priority]?.marker || PRIORITIES.medium.marker}</span>
                      <select aria-label={`Priority for ${task.title}`} value={task.priority || 'medium'} onChange={(event) => handleTaskPriorityChange(task.id, event.target.value)}>
                        {Object.entries(PRIORITIES).map(([value, priority]) => <option key={value} value={value}>{priority.label}</option>)}
                      </select>
                    </label>
                    <div className="task-time-badge">
                      {task.reminder && <BellRing size={12} className={task.notified ? 'bell-ringing' : ''} />}
                      <TaskReminderPicker value={task.reminder} onChange={(value) => handleTaskTimeChange(task.id, value)} label={`Reminder for ${task.title}`} />
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={(e) => handleDeleteTask(e, task.id)}
                className="task-item-delete"
                title="Delete task"
              >
                <Trash2 size={14} />
              </button>
            </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}