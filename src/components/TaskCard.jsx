import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Plus, BellRing, CheckSquare, Clock, GripVertical, Minimize2, Repeat2, Folder, FolderPlus, ListFilter, ListTodo, ListPlus, X, MoreHorizontal, ChevronRight, ChevronDown } from 'lucide-react';
import SelectDropdown from './SelectDropdown';
import { storageManager } from '../utils/localStorage';
import '../styles/TaskCard.css';

const PRIORITIES = {
  high: { label: 'High', marker: '🔴', rank: 0 },
  medium: { label: 'Medium', marker: '🟠', rank: 1 },
  low: { label: 'Low', marker: '🟢', rank: 2 },
};

const FOLDER_COLORS = ['#a5b4fc', '#67e8f9', '#86efac', '#f9a8d4', '#fcd34d', '#c4b5fd'];
const TODAY_VIEW = '__today__';
const ALL_TASKS_VIEW = '__all__';

function makeReminderDate(hour, minute) {
  const date = new Date();
  date.setHours(Number(hour), Number(minute), 0, 0);
  return date.toISOString();
}

function getReminderTime(value) {
  const date = new Date(value);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
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

  const updateTime = (event) => {
    const [hour, minute] = event.target.value.split(':');
    if (hour !== undefined && minute !== undefined) onChange(makeReminderDate(hour, minute));
  };

  return (
    <div className="task-time-picker" role="group" aria-label={`${label} controls`}>
      <Clock size={13} className="time-icon" />
      <input
        type="time"
        className="task-time-input"
        aria-label={label}
        value={getReminderTime(value)}
        onChange={updateTime}
      />
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

function getNextDailyReminder(value, now = new Date()) {
  const reminder = new Date(value);
  const next = new Date(now);
  next.setHours(reminder.getHours(), reminder.getMinutes(), 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  return next.toISOString();
}

function isSameLocalDay(left, right) {
  return left.getFullYear() === right.getFullYear()
    && left.getMonth() === right.getMonth()
    && left.getDate() === right.getDate();
}

function taskIsRelevantToday(task, today = new Date()) {
  if (!task.reminder) return (task.category || 'Inbox') === 'Inbox';
  const reminder = new Date(task.reminder);
  return !Number.isNaN(reminder.getTime()) && isSameLocalDay(reminder, today);
}

function TaskCategoryPicker({ value, categories, label, onChange }) {
  return (
    <SelectDropdown
      label={label}
      value={value}
      options={(categories.includes(value) ? categories : [value, ...categories]).map((category) => ({ value: category, label: category }))}
      onChange={onChange}
      icon={Folder}
      className="ui-select--folder"
    />
  );
}

function TaskActionsMenu({ task, onToggleRepeat, onEdit, onDelete }) {
  const [isOpen, setIsOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return undefined;
    const handlePointerDown = (event) => {
      if (!menuRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) setIsOpen(false);
    };
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen) {
      setMenuPosition(null);
      return undefined;
    }

    const updatePosition = () => {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;

      const triggerBounds = trigger.getBoundingClientRect();
      const menuBounds = menu.getBoundingClientRect();
      const margin = 8;
      const gap = 5;
      const left = Math.max(margin, Math.min(
        triggerBounds.right - menuBounds.width,
        window.innerWidth - menuBounds.width - margin,
      ));
      const below = triggerBounds.bottom + gap;
      const top = below + menuBounds.height <= window.innerHeight - margin
        ? below
        : Math.max(margin, triggerBounds.top - menuBounds.height - gap);
      setMenuPosition({ left, top });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [isOpen]);

  const runAction = (action) => {
    action();
    setIsOpen(false);
  };

  return (
    <div className="task-actions-menu" onMouseDown={(event) => event.stopPropagation()}>
      <button
        type="button"
        ref={triggerRef}
        className="task-actions-trigger"
        aria-label={`More options for ${task.title}`}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        title="More options"
        onClick={() => setIsOpen((open) => !open)}
      >
        <MoreHorizontal size={17} />
      </button>
      {isOpen && createPortal(
        <div
          className="task-actions-popover"
          ref={menuRef}
          role="menu"
          aria-label={`Actions for ${task.title}`}
          style={menuPosition ? { left: `${menuPosition.left}px`, top: `${menuPosition.top}px` } : { visibility: 'hidden' }}
          onMouseDown={(event) => event.stopPropagation()}
        >
          <button type="button" role="menuitem" onClick={() => runAction(onToggleRepeat)}>
            <Repeat2 size={14} />
            <span>{task.repeatDaily ? 'Stop daily repeat' : 'Repeat daily'}</span>
            {task.repeatDaily && <CheckSquare size={13} className="task-action-selected" />}
          </button>
          <button type="button" role="menuitem" onClick={() => runAction(onEdit)}>
            <ListFilter size={14} />
            <span>{task.editing ? 'Close task options' : 'Edit task'}</span>
          </button>
          <div className="task-actions-divider" />
          <button type="button" role="menuitem" className="is-danger" onClick={() => runAction(onDelete)}>
            <Trash2 size={14} />
            <span>Delete task</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function TaskCard({ minimized = false, onToggleMinimize }) {
  const [tasks, setTasks] = useState(() => storageManager.getTasks() || []);
  const [categories, setCategories] = useState(() => storageManager.getTaskCategories());
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskReminder, setNewTaskReminder] = useState(null);
  const [newTaskPriority, setNewTaskPriority] = useState('medium');
  const [newTaskCategory, setNewTaskCategory] = useState('Inbox');
  const [selectedCategory, setSelectedCategory] = useState(TODAY_VIEW);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [isFolderListOpen, setIsFolderListOpen] = useState(false);
  const [isTaskToolsOpen, setIsTaskToolsOpen] = useState(false);
  const [taskDisplayLimit, setTaskDisplayLimit] = useState('all');
  const [visibleControlTooltip, setVisibleControlTooltip] = useState('');
  const [isAddingTask, setIsAddingTask] = useState(false);
  const [sortOrder, setSortOrder] = useState('newest');
  const [draggedTaskId, setDraggedTaskId] = useState(null);
  const [editingTaskId, setEditingTaskId] = useState(null);
  const [completedTasksOpen, setCompletedTasksOpen] = useState(false);
  const [completingTaskIds, setCompletingTaskIds] = useState([]);
  const completionTimersRef = useRef(new Map());
  const notificationAudioContextRef = useRef(null);
  const tooltipTimerRef = useRef(null);
  const tooltipHideTimerRef = useRef(null);
  const swipeStartRef = useRef(null);

  useEffect(() => () => {
    completionTimersRef.current.forEach((timer) => clearTimeout(timer));
    completionTimersRef.current.clear();
    clearTimeout(tooltipTimerRef.current);
    clearTimeout(tooltipHideTimerRef.current);
  }, []);

  const showControlTooltip = (label) => ({
    'data-tooltip': label,
    onPointerDown: (event) => {
      if (event.pointerType !== 'touch') return;
      clearTimeout(tooltipTimerRef.current);
      clearTimeout(tooltipHideTimerRef.current);
      tooltipTimerRef.current = setTimeout(() => setVisibleControlTooltip(label), 450);
    },
    onPointerUp: () => {
      clearTimeout(tooltipTimerRef.current);
      if (visibleControlTooltip === label) {
        tooltipHideTimerRef.current = setTimeout(() => setVisibleControlTooltip(''), 1500);
      }
    },
    onPointerCancel: () => {
      clearTimeout(tooltipTimerRef.current);
      setVisibleControlTooltip('');
    },
  });

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
    let reminderTimer;
    let disposed = false;

    const scheduleNextCheck = (updatedTasks, now) => {
      const deadlines = [];

      updatedTasks.forEach((task) => {
        if (task.repeatDaily && task.completed && task.completedAt) {
          const completedDate = new Date(task.completedAt);
          if (!Number.isNaN(completedDate.getTime())) {
            const resetDate = new Date(completedDate);
            resetDate.setDate(resetDate.getDate() + 1);
            resetDate.setHours(0, 0, 0, 0);
            deadlines.push(Math.max(now.getTime(), resetDate.getTime()));
          }
        }

        if (!task.completed && task.reminder && (task.repeatDaily || !task.notified)) {
          const reminderTime = Date.parse(task.reminder);
          if (Number.isFinite(reminderTime)) deadlines.push(Math.max(now.getTime(), reminderTime));
        }
      });

      if (deadlines.length === 0) return;
      const nextDeadline = Math.min(...deadlines);
      const delay = Math.min(Math.max(0, nextDeadline - Date.now()), 2_147_483_647);
      reminderTimer = window.setTimeout(checkReminders, delay);
    };

    const checkReminders = () => {
      if (disposed) return;
      const now = new Date();
      const dueTasks = [];
      let changed = false;
      const updatedTasks = tasks.map((task) => {
        let updated = task;
        if (task.repeatDaily && task.completed && task.completedAt) {
          const completedDate = new Date(task.completedAt);
          if (!Number.isNaN(completedDate.getTime()) && !isSameLocalDay(completedDate, now)) {
            updated = { ...updated, completed: false, completedAt: null };
            changed = true;
          }
        }

        const reminderDate = updated.reminder ? new Date(updated.reminder) : null;
        const reminderIsDue = reminderDate && !Number.isNaN(reminderDate.getTime()) && now >= reminderDate;
        if (!updated.completed && reminderIsDue && (updated.repeatDaily || !updated.notified)) {
          dueTasks.push(updated);
          updated = updated.repeatDaily
            ? { ...updated, reminder: getNextDailyReminder(updated.reminder, now), notified: false }
            : { ...updated, notified: true };
          changed = true;
        }
        return updated;
      });

      if (dueTasks.length > 0) {
        dueTasks.forEach(() => { void playNotificationSound(); });
        window.dispatchEvent(new CustomEvent('task-reminder-due', {
          detail: { tasks: dueTasks.map((task) => ({ id: task.id, title: task.title })) },
        }));
      }
      if (changed) {
        setTasks(updatedTasks);
        storageManager.saveTasks(updatedTasks);
      }

      scheduleNextCheck(updatedTasks, now);
    };

    checkReminders();
    const checkOnReturn = () => {
      if (document.hidden) return;
      clearTimeout(reminderTimer);
      checkReminders();
    };
    document.addEventListener('visibilitychange', checkOnReturn);
    window.addEventListener('focus', checkOnReturn);

    return () => {
      disposed = true;
      clearTimeout(reminderTimer);
      document.removeEventListener('visibilitychange', checkOnReturn);
      window.removeEventListener('focus', checkOnReturn);
    };
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
      category: newTaskCategory,
      createdAt: new Date().toISOString(),
    };

    const updated = [...tasks, newTask];
    setTasks(updated);
    storageManager.addTask(newTask);
    storageManager.recordAnalyticsEvent({ type: 'task_created' });
    setNewTaskTitle('');
    setNewTaskReminder(null);
    setNewTaskPriority('medium');
    setNewTaskCategory(categories.includes(selectedCategory) ? selectedCategory : 'Inbox');
    setIsAddingTask(false);
  };

  const handleDeleteTask = (id) => {
    const updated = tasks.filter((task) => task.id !== id);
    setTasks(updated);
    storageManager.deleteTask(id);
  };

  const handleToggleTask = (e, id) => {
    e.stopPropagation();
    const task = tasks.find((item) => item.id === id);
    if (!task) return;
    const nextState = !task.completed;
    const updates = { completed: nextState, completedAt: nextState ? new Date().toISOString() : null };
    const updated = tasks.map((item) => item.id === id ? { ...item, ...updates } : item);
    storageManager.updateTask(id, updates);
    if (nextState) {
      setCompletingTaskIds((current) => [...new Set([...current, id])]);
      const existingTimer = completionTimersRef.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      completionTimersRef.current.set(id, setTimeout(() => {
        setCompletingTaskIds((current) => current.filter((taskId) => taskId !== id));
        completionTimersRef.current.delete(id);
      }, 420));
      storageManager.recordAnalyticsEvent({ type: 'task_completed' });
      window.dispatchEvent(new CustomEvent('task-completed', { detail: { title: task.title } }));
    } else {
      const existingTimer = completionTimersRef.current.get(id);
      if (existingTimer) clearTimeout(existingTimer);
      completionTimersRef.current.delete(id);
      setCompletingTaskIds((current) => current.filter((taskId) => taskId !== id));
    }
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

  const handleTaskCategoryChange = (taskId, category) => {
    const updated = tasks.map((task) => task.id === taskId ? { ...task, category } : task);
    setTasks(updated);
    storageManager.updateTask(taskId, { category });
  };

  const handleToggleDailyRepeat = (task) => {
    const repeatDaily = !task.repeatDaily;
    const updates = {
      repeatDaily,
      reminder: repeatDaily ? (task.reminder || getNextReminderDate()) : task.reminder,
      notified: false,
    };
    const updated = tasks.map((current) => current.id === task.id ? { ...current, ...updates } : current);
    setTasks(updated);
    storageManager.updateTask(task.id, updates);
  };

  const handleAddCategory = () => {
    const category = newCategoryName.trim();
    if (!category || categories.some((existing) => existing.toLocaleLowerCase() === category.toLocaleLowerCase())) return;
    const updated = [...categories, category];
    setCategories(updated);
    storageManager.saveTaskCategories(updated);
    setNewCategoryName('');
    setSelectedCategory(category);
    setNewTaskCategory(category);
    setIsAddingCategory(false);
  };

  const handleDeleteCategory = (category) => {
    if (!window.confirm(`Delete the "${category}" folder? Tasks in it will be moved to Inbox.`)) return;
    const updatedCategories = categories.filter((existing) => existing !== category);
    const updatedTasks = tasks.map((task) => (task.category || 'Inbox') === category
      ? { ...task, category: 'Inbox' }
      : task);
    setCategories(updatedCategories);
    setTasks(updatedTasks);
    storageManager.saveTaskCategories(updatedCategories);
    storageManager.saveTasks(updatedTasks);
    if (selectedCategory === category) setSelectedCategory(TODAY_VIEW);
    if (newTaskCategory === category) setNewTaskCategory('Inbox');
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

  const categoryTasks = tasks.filter((task) => {
    if (selectedCategory === ALL_TASKS_VIEW) return true;
    if (selectedCategory === TODAY_VIEW) return taskIsRelevantToday(task);
    return (task.category || 'Inbox') === selectedCategory;
  });
  const activeTasks = sortTaskGroup(categoryTasks.filter((task) => !task.completed || completingTaskIds.includes(task.id)));
  const displayedActiveTasks = taskDisplayLimit === 'all'
    ? activeTasks
    : activeTasks.slice(0, Number(taskDisplayLimit));
  const completedTasks = sortTaskGroup(categoryTasks.filter((task) => task.completed && !completingTaskIds.includes(task.id)));
  const hasVisibleTasks = activeTasks.length > 0 || completedTasks.length > 0;
  const activeTaskCount = categoryTasks.filter((task) => !task.completed).length;
  const selectedFolderLabel = selectedCategory === TODAY_VIEW
    ? "Today's Tasks"
    : selectedCategory === ALL_TASKS_VIEW
      ? 'All Tasks'
      : selectedCategory;

  const handleTaskListTouchStart = (event) => {
    const target = event.target;
    if (target.closest('button, textarea, select, input[type="checkbox"], [role="option"], [role="listbox"]')) {
      swipeStartRef.current = null;
      return;
    }
    const touch = event.touches[0];
    swipeStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };

  const handleTaskListTouchEnd = (event) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    const touch = event.changedTouches[0];
    if (!start || !touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 60 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return;

    if (deltaX < 0) {
      setSelectedCategory(TODAY_VIEW);
      setIsFolderListOpen(false);
      return;
    }

    const userFolders = categories.filter((category) => category !== 'Inbox');
    if (userFolders.length === 0) return;
    setSelectedCategory((current) => {
      const currentIndex = userFolders.indexOf(current);
      if (currentIndex < 0) return userFolders[0];
      return userFolders[Math.min(currentIndex + 1, userFolders.length - 1)];
    });
    setIsFolderListOpen(false);
  };

  const renderTask = (task, isCompleted = false) => (
    <div
      key={task.id}
      className={`task-item ${isCompleted ? 'is-completed' : ''} ${completingTaskIds.includes(task.id) ? 'is-completing' : ''} ${sortOrder === 'custom' ? 'is-arrangeable' : ''} ${draggedTaskId === task.id ? 'is-dragging' : ''}`}
      draggable={sortOrder === 'custom' && !isCompleted}
      onMouseDown={(event) => event.stopPropagation()}
      onDragStart={() => setDraggedTaskId(task.id)}
      onDragOver={(event) => { if (sortOrder === 'custom' && !isCompleted) event.preventDefault(); }}
      onDrop={(event) => { event.preventDefault(); if (!isCompleted) reorderTasks(task.id); }}
      onDragEnd={() => setDraggedTaskId(null)}
    >
      {sortOrder === 'custom' && !isCompleted && <GripVertical className="task-drag-handle" size={14} />}
      <input
        type="checkbox"
        checked={task.completed}
        onChange={(event) => handleToggleTask(event, task.id)}
        className="task-checkbox"
        aria-label={`${task.completed ? 'Mark incomplete' : 'Complete'} ${task.title}`}
      />

      <div className="task-item-main">
        <div className="task-item-primary">
          <input
            className={`task-item-title-input ${task.completed ? 'completed' : ''}`}
            value={task.title}
            onChange={(event) => handleTaskTitleChange(task.id, event.target.value)}
            placeholder="Task title..."
          />
          <span className={`task-priority-summary priority-${task.priority || 'medium'}`} title={`${PRIORITIES[task.priority]?.label || 'Medium'} priority`} aria-label={`${PRIORITIES[task.priority]?.label || 'Medium'} priority`}>
            {PRIORITIES[task.priority]?.marker || PRIORITIES.medium.marker}
          </span>
          <span className={`task-reminder-summary ${task.notified ? 'is-notified' : ''}`} title={formatReminderTime(task.reminder)}>
            {task.reminder && task.notified ? <BellRing size={13} /> : <Clock size={13} />}
            {task.reminder && <span>{formatReminderTime(task.reminder)}</span>}
          </span>
          <TaskActionsMenu
            task={{ ...task, editing: editingTaskId === task.id }}
            onToggleRepeat={() => handleToggleDailyRepeat(task)}
            onEdit={() => setEditingTaskId((currentId) => currentId === task.id ? null : task.id)}
            onDelete={() => handleDeleteTask(task.id)}
          />
        </div>
        {editingTaskId === task.id && (
          <div className="task-item-edit-panel">
            <label className={`task-priority-tag priority-${task.priority || 'medium'}`}>
              <span>{PRIORITIES[task.priority]?.marker || PRIORITIES.medium.marker}</span>
              <SelectDropdown
                label={`Priority for ${task.title}`}
                value={task.priority || 'medium'}
                options={Object.entries(PRIORITIES).map(([value, priority]) => ({ value, label: priority.label }))}
                onChange={(priority) => handleTaskPriorityChange(task.id, priority)}
                className="ui-select--compact ui-select--priority"
                portal
              />
            </label>
            <TaskCategoryPicker
              label={`Category for ${task.title}`}
              value={task.category || 'Inbox'}
              categories={categories}
              onChange={(category) => handleTaskCategoryChange(task.id, category)}
            />
            <div className="task-time-badge">
              {task.reminder && <BellRing size={12} className={task.notified ? 'bell-ringing' : ''} />}
              <TaskReminderPicker value={task.reminder} onChange={(value) => handleTaskTimeChange(task.id, value)} label={`Reminder for ${task.title}`} />
            </div>
            <button
              type="button"
              className="task-edit-done-btn"
              aria-label={`Done editing ${task.title}`}
              onClick={() => setEditingTaskId(null)}
            >
              <X size={14} />
              <span>Done</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );

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
          <h2>{selectedFolderLabel}</h2>
          <span className="task-badge" aria-label={`${activeTaskCount} active tasks`}>
            <span className="task-badge-count">{activeTaskCount}</span>
          </span>
        </div>
        <div className="task-header-actions">
          <button
            type="button"
            className={`task-header-minimize task-control-tooltip ${visibleControlTooltip === 'Minimize tasks' ? 'is-tooltip-visible' : ''}`}
            onClick={onToggleMinimize}
            aria-label="Minimize tasks"
            title="Minimize tasks"
            {...showControlTooltip('Minimize tasks')}
          >
            <Minimize2 size={15} />
          </button>
          <button
            type="button"
            className={`task-tools-toggle task-control-tooltip ${isTaskToolsOpen ? 'is-open' : ''} ${visibleControlTooltip === (isTaskToolsOpen ? 'Hide task options' : 'More task options') ? 'is-tooltip-visible' : ''}`}
            aria-label={isTaskToolsOpen ? 'Hide task options' : 'Show task options'}
            aria-expanded={isTaskToolsOpen}
            title={isTaskToolsOpen ? 'Hide task options' : 'More task options'}
            {...showControlTooltip(isTaskToolsOpen ? 'Hide task options' : 'More task options')}
            onClick={() => setIsTaskToolsOpen((open) => !open)}
          >
            <MoreHorizontal size={18} />
          </button>
        </div>
      </header>

      {isTaskToolsOpen && (
        <div className="task-tools-panel">
          <div className="task-tools-actions">
            <button
              type="button"
              className={`task-tools-action task-control-tooltip ${visibleControlTooltip === (isAddingTask ? 'Close new task' : 'Add new task') ? 'is-tooltip-visible' : ''}`}
              onClick={() => {
                setNewTaskCategory(categories.includes(selectedCategory) ? selectedCategory : 'Inbox');
                setIsAddingTask((adding) => !adding);
              }}
              aria-label={isAddingTask ? 'Close new task' : 'Add new task'}
              title={isAddingTask ? 'Close new task' : 'Add new task'}
              {...showControlTooltip(isAddingTask ? 'Close new task' : 'Add new task')}
            >
              {isAddingTask ? <X size={15} /> : <ListPlus size={16} />}
              <span>{isAddingTask ? 'Cancel task' : 'New task'}</span>
            </button>
            <button
              type="button"
              className={`task-tools-action task-control-tooltip ${visibleControlTooltip === (isAddingCategory ? 'Close new folder' : 'New folder') ? 'is-tooltip-visible' : ''}`}
              onClick={() => setIsAddingCategory((adding) => !adding)}
              aria-expanded={isAddingCategory}
              aria-label={isAddingCategory ? 'Close new folder' : 'New folder'}
              title={isAddingCategory ? 'Close new folder' : 'New folder'}
              {...showControlTooltip(isAddingCategory ? 'Close new folder' : 'New folder')}
            >
              {isAddingCategory ? <X size={15} /> : <FolderPlus size={16} />}
              <span>{isAddingCategory ? 'Cancel folder' : 'New folder'}</span>
            </button>
          </div>
          <div className="task-tools-row">
            <button
              type="button"
              className={`task-folder-toggle task-control-tooltip ${visibleControlTooltip === 'Choose task folder' ? 'is-tooltip-visible' : ''}`}
              aria-expanded={isFolderListOpen}
              onClick={() => setIsFolderListOpen((open) => !open)}
              aria-label="Choose task folder"
              title="Choose task folder"
              {...showControlTooltip('Choose task folder')}
            >
              {selectedCategory === TODAY_VIEW ? <ListTodo size={14} /> : <Folder size={14} />}
              <span>{selectedFolderLabel}</span>
              <ChevronDown size={13} className={isFolderListOpen ? 'is-open' : ''} />
            </button>
            <SelectDropdown
              label="Number of tasks to show"
              value={taskDisplayLimit}
              options={[
                { value: '5', label: '5 tasks' },
                { value: '10', label: '10 tasks' },
                { value: 'all', label: 'Max' },
              ]}
              onChange={setTaskDisplayLimit}
              className="ui-select--toolbar task-limit-select"
              portal
            />
            <span
              className={`task-control-tooltip ${visibleControlTooltip === 'Sort tasks' ? 'is-tooltip-visible' : ''}`}
              {...showControlTooltip('Sort tasks')}
            >
              <SelectDropdown
                label="Sort tasks"
                value={sortOrder}
                options={[
                  { value: 'newest', label: 'Newest first' },
                  { value: 'priority', label: 'Priority' },
                  { value: 'alphabetical', label: 'Alphabetical' },
                  { value: 'custom', label: 'Custom order' },
                ]}
                onChange={setSortOrder}
                icon={ListFilter}
                iconOnly
                className="ui-select--icon"
                portal
              />
            </span>
          </div>
          {isFolderListOpen && (
            <div className="task-folder-choices is-open" aria-label="Task folders">
              {selectedCategory !== TODAY_VIEW && (
                <button type="button" className="task-folder-chip" onClick={() => { setSelectedCategory(TODAY_VIEW); setIsFolderListOpen(false); }}>
                  <ListTodo size={13} />
                  <span>Today's Tasks</span>
                  <span className="task-folder-count">{tasks.filter(taskIsRelevantToday).length}</span>
                </button>
              )}
              {selectedCategory !== ALL_TASKS_VIEW && (
                <button type="button" className="task-folder-chip" onClick={() => { setSelectedCategory(ALL_TASKS_VIEW); setIsFolderListOpen(false); }}>
                  <ListTodo size={13} />
                  <span>All Tasks</span>
                  <span className="task-folder-count">{tasks.length}</span>
                </button>
              )}
              {categories.filter((category) => category !== selectedCategory).map((category) => {
                const folderIndex = categories.indexOf(category);
                return (
                  <div key={category} className="task-folder-item">
                    <button type="button" className="task-folder-chip" onClick={() => { setSelectedCategory(category); setIsFolderListOpen(false); }}>
                      <Folder size={13} style={{ color: FOLDER_COLORS[Math.max(0, folderIndex) % FOLDER_COLORS.length] }} />
                      <span>{category}</span>
                      <span className="task-folder-count">{tasks.filter((task) => (task.category || 'Inbox') === category).length}</span>
                    </button>
                    {category !== 'Inbox' && (
                      <button
                        type="button"
                        className="task-folder-delete"
                        aria-label={`Delete ${category} folder`}
                        title={`Delete ${category} folder`}
                        onClick={() => handleDeleteCategory(category)}
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          {isAddingCategory && (
            <form className="task-add-folder" onSubmit={(event) => { event.preventDefault(); handleAddCategory(); }}>
              <FolderPlus size={14} aria-hidden="true" />
              <input
                aria-label="New category name"
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Folder name"
                maxLength={32}
                autoFocus
              />
              <button type="submit" aria-label="Create category" title="Create category"><Plus size={15} /></button>
            </form>
          )}
        </div>
      )}

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
                <SelectDropdown
                  label="New task priority"
                  value={newTaskPriority}
                  options={Object.entries(PRIORITIES).map(([value, priority]) => ({ value, label: priority.label }))}
                  onChange={setNewTaskPriority}
                  className="ui-select--compact ui-select--priority"
                  portal
                />
              </label>
              <TaskReminderPicker value={newTaskReminder} onChange={setNewTaskReminder} label="New task reminder" />
              <TaskCategoryPicker
                label="New task category"
                value={newTaskCategory}
                categories={categories}
                onChange={setNewTaskCategory}
              />
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

      <div className="task-list" onTouchStart={handleTaskListTouchStart} onTouchEnd={handleTaskListTouchEnd}>
        {!hasVisibleTasks ? (
          <div className="task-empty">
            <CheckSquare size={32} className="task-empty-icon" />
            <p>{tasks.length === 0 ? 'All caught up for today!' : selectedCategory === TODAY_VIEW ? 'Nothing scheduled for today.' : `No tasks in ${selectedFolderLabel}.`}</p>
            <span>{selectedCategory === TODAY_VIEW ? "Today's reminders and Inbox tasks without a reminder appear here." : 'Add a task or choose another folder.'}</span>
          </div>
        ) : (
          <>
            {sortOrder === 'custom' && activeTasks.length > 0 && <span className="task-arrange-hint">Drag to arrange</span>}
            {displayedActiveTasks.map((task) => renderTask(task))}
            {completedTasks.length > 0 && (
              <section className={`task-completed-section ${completedTasksOpen ? 'is-open' : ''}`}>
                <button
                  type="button"
                  className="task-completed-toggle"
                  aria-expanded={completedTasksOpen}
                  onClick={() => setCompletedTasksOpen((open) => !open)}
                >
                  {completedTasksOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                  <span>Completed</span>
                  <span className="task-completed-count">{completedTasks.length}</span>
                </button>
                {completedTasksOpen && (
                  <div className="task-completed-list">
                    {completedTasks.map((task) => renderTask(task, true))}
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}