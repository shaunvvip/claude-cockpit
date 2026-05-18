import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { TodosPanel } from './TodosPanel.js'
import type { TodoItem } from '@claude-cockpit/shared'

describe('TodosPanel', () => {
  it('shows dash placeholder when no todos', () => {
    render(<TodosPanel todos={[]} />)
    expect(screen.getByText('—')).toBeInTheDocument()
  })

  it('renders pending todo with checkbox', () => {
    const todos: TodoItem[] = [{ text: 'Write tests', completed: false }]
    render(<TodosPanel todos={todos} />)
    expect(screen.getByText('Write tests')).toBeInTheDocument()
    expect(screen.getByText('☐')).toBeInTheDocument()
  })

  it('renders completed todo with checked box and strikethrough class', () => {
    const todos: TodoItem[] = [{ text: 'Done task', completed: true }]
    render(<TodosPanel todos={todos} />)
    expect(screen.getByText('Done task')).toBeInTheDocument()
    expect(screen.getByText('☑')).toBeInTheDocument()
    expect(screen.getByText('Done task').className).toContain('line-through')
  })

  it('renders multiple mixed todos', () => {
    const todos: TodoItem[] = [
      { text: 'First', completed: false },
      { text: 'Second', completed: true },
    ]
    render(<TodosPanel todos={todos} />)
    expect(screen.getByText('First')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
  })
})
