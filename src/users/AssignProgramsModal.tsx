import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import type { Program } from '../api';
import { User } from '../rbac';
import UserModal from './UserModal';

export interface AssignProgramsModalProps {
  open: boolean;
  user: User | null;
  programs: Program[];
  onClose: () => void;
  onAssign: (
    values: { programId: string; startDate: string; dueDate: string; notes?: string },
  ) => Promise<void>;
}

const today = () => new Date().toISOString().slice(0, 10);

export default function AssignProgramsModal({
  open,
  user,
  programs,
  onClose,
  onAssign,
}: AssignProgramsModalProps) {
  const [programId, setProgramId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const hasPrograms = useMemo(() => programs && programs.length > 0, [programs]);

  useEffect(() => {
    if (open) {
      setProgramId(programs[0]?.id ?? '');
      const defaultStart = today();
      setStartDate(defaultStart);
      setDueDate(defaultStart);
      setNotes('');
      setError('');
      setSubmitting(false);
    }
  }, [open, programs]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user || !programId || !startDate || !dueDate) return;
    try {
      setSubmitting(true);
      setError('');
      await onAssign({
        programId,
        startDate,
        dueDate,
        notes: notes.trim() ? notes.trim() : undefined,
      });
      onClose();
    } catch (_err) {
      setError('Unable to assign the program. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserModal
      open={open}
      onClose={onClose}
      title={user ? `Assign program to ${user.name}` : 'Assign program'}
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="px-3 py-2 text-sm rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            onClick={onClose}
            disabled={submitting}
          >
            Cancel
          </button>
          <button
            type="submit"
            form="assign-program-form"
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-60"
            disabled={!hasPrograms || !programId || !startDate || !dueDate || submitting}
          >
            {submitting ? 'Assigning…' : 'Assign program'}
          </button>
        </div>
      }
    >
      <form id="assign-program-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Program
          </label>
          <select
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            value={programId}
            onChange={event => setProgramId(event.target.value)}
            disabled={!hasPrograms}
          >
            {!hasPrograms && <option value="">No programs available</option>}
            {programs.map(program => (
              <option key={program.id} value={program.id}>
                {program.name} · v{program.version}
              </option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Start date
            </label>
            <input
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              type="date"
              value={startDate}
              onChange={event => setStartDate(event.target.value)}
            />
          </div>
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Due date
            </label>
            <input
              className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              type="date"
              value={dueDate}
              min={startDate}
              onChange={event => setDueDate(event.target.value)}
            />
          </div>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Notes (optional)
          </label>
          <textarea
            className="w-full h-24 border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            value={notes}
            onChange={event => setNotes(event.target.value)}
            placeholder="Add context for the assignee"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </UserModal>
  );
}
