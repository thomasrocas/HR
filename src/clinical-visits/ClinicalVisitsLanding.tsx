import React, { useEffect, useMemo, useState } from 'react';
import { ClinicalVisit, ClinicalVisitStatus, getClinicalVisits } from '../api';
import { ORGANIZATION_OPTIONS } from '../../shared/field-options.js';
import { User } from '../rbac';

const STATUS_OPTIONS: { value: ClinicalVisitStatus; label: string }[] = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
];

const statusLabel = (status: string): string => {
  const option = STATUS_OPTIONS.find(item => item.value === status);
  if (option) return option.label;
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const formatDate = (value: string): string => {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

const formatLocation = (value: string | null): string => {
  if (!value) return '—';
  return value;
};

export default function ClinicalVisitsLanding({ currentUser }: { currentUser: User }): JSX.Element {
  const [visits, setVisits] = useState<ClinicalVisit[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [organizationFilter, setOrganizationFilter] = useState('');
  const [subUnitFilter, setSubUnitFilter] = useState('');

  const normalizedSearch = searchQuery.trim();
  const normalizedSubUnit = subUnitFilter.trim();

  useEffect(() => {
    let ignore = false;
    setLoading(true);
    getClinicalVisits({
      query: normalizedSearch || undefined,
      status: statusFilter || undefined,
      organization: organizationFilter || undefined,
      subUnit: normalizedSubUnit || undefined,
    })
      .then(response => {
        if (ignore) return;
        setVisits(response.data);
        setError(null);
      })
      .catch(err => {
        if (ignore) return;
        setVisits([]);
        setError(err instanceof Error ? err.message : 'Unable to load clinical visits.');
      })
      .finally(() => {
        if (!ignore) {
          setLoading(false);
        }
      });

    return () => {
      ignore = true;
    };
  }, [normalizedSearch, statusFilter, organizationFilter, normalizedSubUnit]);

  const hasActiveFilters = useMemo(
    () => Boolean(normalizedSearch || statusFilter || organizationFilter || normalizedSubUnit),
    [normalizedSearch, statusFilter, organizationFilter, normalizedSubUnit],
  );

  const clearFilters = () => {
    setSearchQuery('');
    setStatusFilter('');
    setOrganizationFilter('');
    setSubUnitFilter('');
  };

  return (
    <main className="p-6 space-y-6">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--ink,#0f172a)]">Clinical Visits</h1>
          <p className="text-sm text-[var(--text-muted,#64748b)]">
            Track scheduled and completed field visits across organizations and sub-units.
          </p>
        </div>
        <div className="text-sm text-[var(--text-muted,#64748b)]">
          {visits.length} visit{visits.length === 1 ? '' : 's'} match the current filters.
        </div>
      </header>

      <section className="panel space-y-3 p-4">
        <div className="grid gap-3 md:grid-cols-4">
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="visit-search" className="text-[var(--text-muted,#64748b)]">
              Search
            </label>
            <input
              id="visit-search"
              className="form-field"
              placeholder="Search patient or clinician"
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              onBlur={event => setSearchQuery(event.target.value.trim())}
            />
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="visit-status" className="text-[var(--text-muted,#64748b)]">
              Status
            </label>
            <select
              id="visit-status"
              className="form-field"
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {STATUS_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="visit-organization" className="text-[var(--text-muted,#64748b)]">
              Organization
            </label>
            <select
              id="visit-organization"
              className="form-field"
              value={organizationFilter}
              onChange={event => setOrganizationFilter(event.target.value)}
            >
              <option value="">All organizations</option>
              {ORGANIZATION_OPTIONS.map(option => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1 text-sm">
            <label htmlFor="visit-sub-unit" className="text-[var(--text-muted,#64748b)]">
              Sub-unit
            </label>
            <input
              id="visit-sub-unit"
              className="form-field"
              placeholder="Type to filter sub-units"
              value={subUnitFilter}
              onChange={event => setSubUnitFilter(event.target.value)}
              onBlur={event => setSubUnitFilter(event.target.value.trim())}
            />
          </div>
        </div>
        {hasActiveFilters && (
          <div className="flex justify-end">
            <button type="button" className="btn btn-ghost text-sm" onClick={clearFilters}>
              Clear filters
            </button>
          </div>
        )}
      </section>

      <section className="panel overflow-hidden">
        {loading && (
          <div className="p-4 text-sm text-[var(--text-muted,#64748b)]">Loading clinical visits…</div>
        )}
        {!loading && error && (
          <div className="p-4 text-sm text-red-600" role="alert">
            {error}
          </div>
        )}
        {!loading && !error && visits.length === 0 && (
          <div className="p-4 text-sm text-[var(--text-muted,#64748b)]">
            No visits match the selected filters.
          </div>
        )}
        {!loading && !error && visits.length > 0 && (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[var(--surface-alt,#f8fafc)] text-[var(--text-muted,#64748b)]">
                <tr>
                  <th scope="col" className="px-4 py-3 font-semibold">Date</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Patient</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Clinician</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Status</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Organization</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Sub-unit</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Visit type</th>
                  <th scope="col" className="px-4 py-3 font-semibold">Location</th>
                </tr>
              </thead>
              <tbody>
                {visits.map(visit => (
                  <tr key={visit.id} className="odd:bg-[var(--surface-alt,#f8fafc)]">
                    <td className="px-4 py-3 align-top">{formatDate(visit.visitDate)}</td>
                    <td className="px-4 py-3 align-top font-medium">{visit.patientName}</td>
                    <td className="px-4 py-3 align-top">{visit.clinicianName || '—'}</td>
                    <td className="px-4 py-3 align-top">
                      <span className="inline-flex items-center rounded-full bg-[var(--surface-alt,#eef2ff)] px-2 py-0.5 text-xs font-semibold uppercase tracking-wide text-[var(--text-muted,#64748b)]">
                        {statusLabel(visit.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3 align-top">{visit.organization ?? '—'}</td>
                    <td className="px-4 py-3 align-top">{visit.subUnit ?? '—'}</td>
                    <td className="px-4 py-3 align-top">{visit.visitType ?? '—'}</td>
                    <td className="px-4 py-3 align-top">{formatLocation(visit.location ?? null)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
