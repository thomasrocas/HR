import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';

import AdminLanding from './src/AdminLanding';
import { User } from './src/rbac';
import { seed } from './src/api';

const fallbackUser: User = {
  id: 'fallback-admin',
  name: 'Orientation Admin',
  email: 'admin@example.com',
  roles: ['admin'],
  status: 'active',
};

const loggedInUser: User =
  seed.users.find(user => user.roles.includes('admin')) ??
  seed.users[0] ??
  fallbackUser;

export default function App(): JSX.Element {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/admin" element={<AdminLanding currentUser={loggedInUser} />} />
        <Route path="/admin/users" element={<Navigate to="/admin?tab=users" replace />} />
        <Route path="/programs" element={<Navigate to="/admin?tab=programs" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
