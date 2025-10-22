import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import { User } from '../rbac';
import UserModal from './UserModal';

type UserLifecycleAction = 'deactivate' | 'reactivate' | 'archive';

export interface ConfirmUserActionModalProps {
  open: boolean;
  user: User | null;
  action: UserLifecycleAction;
  onClose: () => void;
  onConfirm: (reason?: string) => Promise<void>;
}

const ACTION_COPY: Record<UserLifecycleAction, { title: string; description: string; confirmLabel: string }> = {
  deactivate: {
    title: 'Deactivate user',
    description:
      'The user will immediately lose access to the platform. You can reactivate their access at any time.',
    confirmLabel: 'Deactivate user',
  },
  reactivate: {
    title: 'Reactivate user',
    description:
      'The user will regain access to the platform and receive an email letting them know their account is active.',
    confirmLabel: 'Reactivate user',
  },
  archive: {
    title: 'Archive user',
    description:
      'Archiving removes the user from active rosters but retains their history for compliance reporting.',
    confirmLabel: 'Archive user',
  },
};

export default function ConfirmUserActionModal({
  open,
  user,
  action,
  onClose,
  onConfirm,
}: ConfirmUserActionModalProps) {
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const copy = ACTION_COPY[action];

  const confirmButtonClass = useMemo(() => {
    const base = 'px-4 py-2 text-sm font-medium rounded-md text-white disabled:opacity-60';
    if (action === 'reactivate') {
      return `${base} bg-[var(--brand-primary)]`;
    }
    return `${base} bg-red-600`;
  }, [action]);

  useEffect(() => {
    if (open) {
      setReason('');
      setError('');
      setSubmitting(false);
    }
  }, [open, action, user]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    try {
      setSubmitting(true);
      setError('');
      await onConfirm(action === 'deactivate' ? reason.trim() : undefined);
      onClose();
    } catch (_err) {
      setError('Unable to complete the request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <UserModal
      open={open}
      onClose={onClose}
      title={user ? `${copy.title} – ${user.name}` : copy.title}
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
            form="confirm-user-action"
            className={confirmButtonClass}
            disabled={submitting || (action === 'deactivate' && !reason.trim())}
          >
            {submitting ? 'Working…' : copy.confirmLabel}
          </button>
        </div>
      }
    >
      <form id="confirm-user-action" className="space-y-4" onSubmit={handleSubmit}>
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-alt)] px-4 py-3 text-sm">
          <p>
            <span className="font-medium">{user?.name}</span> will be {action === 'reactivate' ? 'restored' : action}.
          </p>
          <p className="mt-1 text-[var(--text-muted)]">
            Organization: {user?.organization ? user.organization : '—'}
          </p>
          <p className="mt-2 text-[var(--text-muted)]">{copy.description}</p>
        </div>
        {action === 'deactivate' && (
          <div className="space-y-1">
            <label className="block text-xs font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Reason for deactivation
            </label>
            <textarea
              className="w-full h-24 border border-[var(--border)] rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--focus-ring)]"
              value={reason}
              onChange={event => setReason(event.target.value)}
              placeholder="Share why the account is being deactivated"
            />
          </div>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
      </form>
    </UserModal>
  );
}