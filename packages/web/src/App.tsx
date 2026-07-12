import { Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Monitors from './pages/Monitors';
import Tests from './pages/Tests';
import AIConsole from './pages/AIConsole';
import Notifications from './pages/Notifications';

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Dashboard />} />
        <Route path="/monitors" element={<Monitors />} />
        <Route path="/tests" element={<Tests />} />
        <Route path="/ai" element={<AIConsole />} />
        <Route path="/alerts" element={<Notifications />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
