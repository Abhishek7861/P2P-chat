import { useAuth } from './hooks/useAuth';
import Person from './components/Person';
import LoginPage from './pages/LoginPage';
import ContactsPage from './pages/ContactsPage';
import './App.css';

export default function App() {
  const { user, ready, logout } = useAuth();

  if (!ready) return null;
  if (!user) return <LoginPage />;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-brand">P2P Messenger</span>
        <div className="app-user">
          <Person user={user} />
          <button className="btn" onClick={logout}>
            Log out
          </button>
        </div>
      </header>
      <ContactsPage />
    </div>
  );
}
