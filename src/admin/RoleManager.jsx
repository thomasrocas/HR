import React, { useEffect, useState } from 'react';

// Roles available in the system
const ALL_ROLES = ['admin', 'manager', 'trainee'];

export default function RoleManager(){
  const [me, setMe] = useState(null);
  const [users, setUsers] = useState([]);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    (async () => {
      const meRes = await fetch('/me');
      const meData = await meRes.json();
      setMe(meData);
      if(!meData.roles?.includes('admin')) return;
      const res = await fetch('/rbac/users');
      if(res.ok){
        const data = await res.json();
        setUsers(data);
      }
    })();
  }, []);

  if(!me) return <div>Loading…</div>;
  if(!me.roles?.includes('admin')) return <div className="card p-6">Access denied</div>;

  const toggleRole = (userId, role) => {
    setUsers(prev => prev.map(u => u.id === userId ? {
      ...u,
      roles: u.roles.includes(role) ? u.roles.filter(r => r !== role) : [...u.roles, role]
    } : u));
  };

  const handleSave = async () => {
    setMsg('');
    setErr('');
    try {
      for(const u of users){
        const resp = await fetch(`/rbac/users/${u.id}/roles`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: u.roles })
        });
        if(!resp.ok) throw new Error('Save failed');
      }
      setMsg('Saved');
    } catch (_e){
      setErr('Save failed');
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <h1 className="text-2xl font-bold">Role Manager</h1>
      <div className="text-sm text-slate-600">
        Admin: full access. Manager: manage orientation programs and tasks. Trainee: view their own tasks.
      </div>
      <table className="w-full border mt-4">
        <thead>
          <tr className="text-left border-b">
            <th className="p-2">Name</th>
            <th className="p-2">Username</th>
            {ALL_ROLES.map(r => (
              <th key={r} className="p-2">{r}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id} className="border-b">
              <td className="p-2">{u.full_name || ''}</td>
              <td className="p-2">{u.username || ''}</td>
              {ALL_ROLES.map(r => (
                <td key={r} className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={u.roles.includes(r)}
                    onChange={() => toggleRole(u.id, r)}
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {msg && <div className="text-sm text-green-600">{msg}</div>}
      {err && <div className="text-sm text-red-600">{err}</div>}
      <button className="btn btn-primary" onClick={handleSave}>Save</button>
    </div>
  );
}

// Mount automatically when loaded directly
if (typeof document !== 'undefined') {
  const rootEl = document.getElementById('root');
  if (rootEl) {
    const root = ReactDOM.createRoot(rootEl);
    root.render(<RoleManager/>);
  }
}
