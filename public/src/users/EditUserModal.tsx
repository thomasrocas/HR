import React, { FormEvent, useEffect, useState } from 'react';
import { ORGANIZATION_OPTIONS } from '../../shared/field-options.js';
import { User } from '../rbac';
import UserModal from './UserModal';

export interface EditUserModalProps {
  open: boolean;
  user: Pick<User, 'name' | 'email' | 'organization' | 'hireDate'> | null;
  onClose: () => void;
  onSave: (values: {
    name: string;
    email: string;
    organization: string;
    hireDate: string | null;
  }) => Promise<void>;
}

export default function EditUserModal({ open, user, onClose, onSave }: EditUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [hireDate, setHireDate] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const isValidDate = (value: string) => {
    if (!value) return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) return false;
    const date = new Date(Date.UTC(year, month - 1, day));
    return (
      date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
    );
  };

  const trimmedHireDate = hireDate.trim();
  const isHireDateValid = isValidDate(trimmedHireDate);

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setEmail(user.email);
      setOrganization(user.organization ?? '');
      setHireDate(user.hireDate ?? '');
    }
    if (!open) {
      setName('');
      setEmail('');
      setOrganization('');
      setHireDate('');
      setError('');
      setSubmitting(false);
    }
  }, [open, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    if (!isHireDateValid) {
      setError('Hire date must be a valid date (YYYY-MM-DD).');
      return;
    }
    try {
      setSubmitting(true);
      setError('');
      await onSave({
        name: name.trim(),
        email: email.trim(),
        organization: organization.trim(),
        hireDate: trimmedHireDate ? trimmedHireDate : null,
      });
      onClose();
    } catch (_err) {
      setError('Unable to update the profile. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserModal
      open={open}
      onClose={onClose}
      title={user ? `Edit ${user.name}` : 'Edit user'}
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
            form="edit-user-form"
            className="px-4 py-2 text-sm font-medium rounded-md bg-[var(--brand-primary)] text-white disabled:opacity-60"
            disabled={!name.trim() || !email.trim() || !isHireDateValid || submitting}
          >
            {submitting ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      }
    >
      <form id="edit-user-form" className="space-y-4" onSubmit={handleSubmit}>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Full name
          </label>
          <input
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            value={name}
            onChange={event => setName(event.target.value)}
            placeholder="Jane Doe"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Organization
          </label>
          <select
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            value={organization}
            onChange={event => setOrganization(event.target.value)}
          >
            <option value="">Select an organization</option>
            {ORGANIZATION_OPTIONS.map(option => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Hire date
          </label>
          <input
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            type="date"
            value={hireDate}
            onChange={event => {
              const nextValue = event.target.value;
              setHireDate(nextValue);
              const trimmed = nextValue.trim();
              if (trimmed && !isValidDate(trimmed)) {
                setError('Hire date must be a valid date (YYYY-MM-DD).');
              } else if (error) {
                setError('');
              }
            }}
            placeholder="YYYY-MM-DD"
          />
        </div>
        <div className="space-y-1">
          <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
            Email address
          </label>
          <input
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            type="email"
            value={email}
            onChange={event => setEmail(event.target.value)}
            placeholder="name@example.com"
          />
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </UserModal>
  );
}