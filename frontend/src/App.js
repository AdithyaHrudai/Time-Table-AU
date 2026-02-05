import { useEffect, useState, useRef } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Pages
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import Dashboard from "@/pages/Dashboard";
import SessionSetup from "@/pages/SessionSetup";
import FacultyManagement from "@/pages/FacultyManagement";
import RoomsManagement from "@/pages/RoomsManagement";
import SectionsManagement from "@/pages/SectionsManagement";
import SubjectsManagement from "@/pages/SubjectsManagement";
import PriorityAllocation from "@/pages/PriorityAllocation";
import TimetableView from "@/pages/TimetableView";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;

// Configure axios defaults
axios.defaults.baseURL = BACKEND_URL;
axios.defaults.withCredentials = true;

// Auth Context
export const AuthContext = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(localStorage.getItem("token"));

  useEffect(() => {
    const checkAuth = async () => {
      const savedToken = localStorage.getItem("token");
      if (savedToken) {
        try {
          const response = await axios.get("/api/auth/me", {
            headers: { Authorization: `Bearer ${savedToken}` }
          });
          setUser(response.data);
          setToken(savedToken);
        } catch (error) {
          localStorage.removeItem("token");
          setToken(null);
        }
      }
      setLoading(false);
    };
    checkAuth();
  }, []);

  const login = (userData, accessToken) => {
    setUser(userData);
    setToken(accessToken);
    localStorage.setItem("token", accessToken);
  };

  const logout = async () => {
    try {
      await axios.post("/api/auth/logout");
    } catch (e) {
      console.error("Logout error:", e);
    }
    setUser(null);
    setToken(null);
    localStorage.removeItem("token");
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full spinner mx-auto mb-4"></div>
          <p className="text-slate-600">Loading...</p>
        </div>
      </div>
    );
  }

  return children({ user, token, login, logout, loading });
};

// Protected Route
const ProtectedRoute = ({ children, user, token }) => {
  const location = useLocation();
  
  if (!user || !token) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }
  
  return children;
};

// Auth Callback for Google OAuth
const AuthCallback = ({ login }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const hasProcessed = useRef(false);

  useEffect(() => {
    // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
    if (hasProcessed.current) return;
    hasProcessed.current = true;

    const processSession = async () => {
      const hash = location.hash;
      const sessionIdMatch = hash.match(/session_id=([^&]+)/);
      
      if (sessionIdMatch) {
        const sessionId = sessionIdMatch[1];
        try {
          const response = await axios.get(`/api/auth/session?session_id=${sessionId}`);
          const { session_token, ...userData } = response.data;
          login(userData, session_token);
          navigate("/dashboard", { replace: true });
        } catch (error) {
          console.error("Auth callback error:", error);
          navigate("/login", { replace: true });
        }
      } else {
        navigate("/login", { replace: true });
      }
    };

    processSession();
  }, [location, login, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full spinner mx-auto mb-4"></div>
        <p className="text-slate-600">Completing sign in...</p>
      </div>
    </div>
  );
};

// App Router
function AppRouter({ user, token, login, logout }) {
  const location = useLocation();

  // Check for session_id in URL hash (Google OAuth callback)
  if (location.hash?.includes('session_id=')) {
    return <AuthCallback login={login} />;
  }

  return (
    <Routes>
      <Route path="/" element={<LandingPage user={user} />} />
      <Route path="/login" element={user ? <Navigate to="/dashboard" replace /> : <LoginPage login={login} />} />
      <Route path="/register" element={user ? <Navigate to="/dashboard" replace /> : <RegisterPage login={login} />} />
      
      <Route path="/dashboard" element={
        <ProtectedRoute user={user} token={token}>
          <Dashboard user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/setup" element={
        <ProtectedRoute user={user} token={token}>
          <SessionSetup user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/faculty" element={
        <ProtectedRoute user={user} token={token}>
          <FacultyManagement user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/rooms" element={
        <ProtectedRoute user={user} token={token}>
          <RoomsManagement user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/sections" element={
        <ProtectedRoute user={user} token={token}>
          <SectionsManagement user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/subjects" element={
        <ProtectedRoute user={user} token={token}>
          <SubjectsManagement user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/priority" element={
        <ProtectedRoute user={user} token={token}>
          <PriorityAllocation user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="/session/:sessionId/timetable" element={
        <ProtectedRoute user={user} token={token}>
          <TimetableView user={user} token={token} logout={logout} />
        </ProtectedRoute>
      } />
      
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthContext>
        {(authProps) => (
          <>
            <AppRouter {...authProps} />
            <Toaster position="top-right" richColors />
          </>
        )}
      </AuthContext>
    </BrowserRouter>
  );
}

export default App;
