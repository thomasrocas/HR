import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';

import UsersLanding from './src/users/UsersLanding';
import ProgramsLanding from './src/programs/ProgramsLanding';
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
        <Route path="/admin/users" element={<UsersLanding currentUser={loggedInUser} />} />
        <Route path="/programs" element={<ProgramsLanding currentUser={loggedInUser} />} />
      </Routes>
    </BrowserRouter>
  );
}