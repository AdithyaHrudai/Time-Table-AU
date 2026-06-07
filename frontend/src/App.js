import { useState } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import axios from "axios";
import { Toaster } from "@/components/ui/sonner";

// Pages
import LandingPage from "@/pages/LandingPage";
import Dashboard from "@/pages/Dashboard";
import SessionSetup from "@/pages/SessionSetup";
import FacultyManagement from "@/pages/FacultyManagement";
import SectionsManagement from "@/pages/SectionsManagement";
import SubjectsManagement from "@/pages/SubjectsManagement";
import FacultyChoices from "@/pages/FacultyChoices";
import TimetableView from "@/pages/TimetableView";

// Single-origin: the React app is served by the FastAPI backend, so API calls
// are relative (same host). REACT_APP_BACKEND_URL is only used as an override
// for split local dev; default to "" (relative) which is what production uses.
const BACKEND_URL = process.env.REACT_APP_BACKEND_URL || "";

// Configure axios defaults
axios.defaults.baseURL = BACKEND_URL;
axios.defaults.withCredentials = true;

// Auth has been removed — this is a single shared department workspace. Everyone
// who opens the app is the same "Department" user, so there's no login/signup.
const SHARED_USER = { user_id: "shared", name: "Department", email: "department@local" };

export const AuthContext = ({ children }) => {
  const [user] = useState(SHARED_USER);

  // login/logout are kept as no-ops so existing pages that receive them as props
  // don't break. There is nothing to authenticate.
  const login = () => {};
  const logout = () => {};

  return children({ user, token: null, login, logout, loading: false });
};

// Protected Route — auth is removed, so this just renders its children. Kept as
// a thin wrapper so the route definitions below don't need to change.
const ProtectedRoute = ({ children }) => children;

// App Router
function AppRouter({ user, token, login, logout }) {
  return (
    <Routes>
      <Route path="/" element={<LandingPage user={user} />} />
      {/* Auth removed: old login/register links land straight in the app. */}
      <Route path="/login" element={<Navigate to="/dashboard" replace />} />
      <Route path="/register" element={<Navigate to="/dashboard" replace />} />

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
      
      <Route path="/session/:sessionId/faculty-choices" element={
        <ProtectedRoute user={user} token={token}>
          <FacultyChoices user={user} token={token} logout={logout} />
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
