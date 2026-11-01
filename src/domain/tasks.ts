import type { Task } from './model.ts'

export type TaskFilter = 'Hoje' | 'Próximas' | 'Atrasadas' | 'Todas'
export function filterTasks(tasks: Task[], filter: TaskFilter, today: string) {
  return tasks.filter(task => filter === 'Todas' ||
    (filter === 'Hoje' && task.date === today) ||
    (filter === 'Próximas' && task.date > today && !task.done) ||
    (filter === 'Atrasadas' && task.date < today && !task.done))
    .sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time))
}
