import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';

export function NavBar() {
  const { user, logout } = useAuth();

  return (
    <header className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="brand">
          <span className="brand-mark" />
          MC Host Panel
        </Link>
        {user && (
          <div className="row">
            <span className="nav-user">{user.email}</span>
            <button className="btn btn-ghost btn-sm" onClick={logout} style={{ color: 'var(--bone)' }}>
              Log out
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
