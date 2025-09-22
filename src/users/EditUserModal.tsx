import React, { FormEvent, useEffect, useState } from 'react';
import { User } from '../rbac';
import UserModal from './UserModal';

export interface EditUserModalProps {
  open: boolean;
  user: Pick<User, 'name' | 'email' | 'organization'> | null;
  onClose: () => void;
  onSave: (values: { name: string; email: string; organization: string }) => Promise<void>;
}

export default function EditUserModal({ open, user, onClose, onSave }: EditUserModalProps) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [organization, setOrganization] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && user) {
      setName(user.name);
      setEmail(user.email);
      setOrganization(user.organization ?? '');
    }
    if (!open) {
      setName('');
      setEmail('');
      setOrganization('');
      setError('');
      setSubmitting(false);
    }
  }, [open, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError('');
      await onSave({ name: name.trim(), email: email.trim(), organization: organization.trim() });
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
            disabled={!name.trim() || !email.trim() || submitting}
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
          <input
            className="w-full border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
            value={organization}
            onChange={event => setOrganization(event.target.value)}
            placeholder="Acme Corp"
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
