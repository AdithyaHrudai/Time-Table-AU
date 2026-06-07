import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Calendar, Mail, Lock, ArrowLeft } from "lucide-react";
import { toast } from "sonner";

export default function LoginPage({ login }) {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  // Surface Google OAuth failures (backend redirects to /login?error=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      toast.error("Google sign-in failed. Please try again or use email/password.");
      window.history.replaceState({}, "", "/login");
    }
  }, []);

  const handleChange = (e) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const response = await axios.post("/api/auth/login", formData);
      login(response.data.user, response.data.access_token);
      toast.success("Welcome back!");
      navigate("/dashboard");
    } catch (error) {
      toast.error(error.response?.data?.detail || "Invalid credentials");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = () => {
    // Standard Google OAuth 2.0 — the backend handles the consent flow and
    // redirects back to /dashboard with a token in the URL fragment.
    const backendUrl = axios.defaults.baseURL || "";
    window.location.href = `${backendUrl}/api/auth/google/login`;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Left Panel - Image */}
      <div 
        className="hidden lg:flex lg:w-1/2 relative"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1718327453695-4d32b94c90a4?crop=entropy&cs=srgb&fm=jpg&ixid=M3w4NjA1NDh8MHwxfHNlYXJjaHwxfHx1bml2ZXJzaXR5JTIwc3R1ZGVudHMlMjBzdHVkeWluZyUyMGxpYnJhcnl8ZW58MHx8fHwxNzcwMzEzNzgxfDA&ixlib=rb-4.1.0&q=85)`,
          backgroundSize: 'cover',
          backgroundPosition: 'center'
        }}
      >
        <div className="absolute inset-0 bg-slate-900/60"></div>
        <div className="relative z-10 flex flex-col justify-end p-12">
          <div className="flex items-center gap-2 mb-4">
            <Calendar className="w-8 h-8 text-white" />
            <span className="font-serif text-2xl font-bold text-white">TimetableGenius</span>
          </div>
          <p className="text-xl text-white/90 max-w-md">
            "Finally, a scheduling tool that understands academic constraints. 
            Saved our department hours of manual work."
          </p>
          <p className="text-white/60 mt-4">— Dr. Sarah Mitchell, Department Head</p>
        </div>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <Link to="/" className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-900 mb-8 transition-colors">
            <ArrowLeft className="w-4 h-4" />
            Back to home
          </Link>

          <Card className="border-slate-200 shadow-lg">
            <CardHeader className="space-y-1">
              <CardTitle className="font-serif text-2xl">Welcome back</CardTitle>
              <CardDescription>Sign in to your account to continue</CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="email"
                      name="email"
                      type="email"
                      placeholder="professor@university.edu"
                      value={formData.email}
                      onChange={handleChange}
                      className="pl-10"
                      required
                      data-testid="login-email-input"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      id="password"
                      name="password"
                      type="password"
                      placeholder="••••••••"
                      value={formData.password}
                      onChange={handleChange}
                      className="pl-10"
                      required
                      data-testid="login-password-input"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-blue-600 hover:bg-blue-700 btn-primary"
                  disabled={loading}
                  data-testid="login-submit-btn"
                >
                  {loading ? (
                    <span className="flex items-center gap-2">
                      <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full spinner"></span>
                      Signing in...
                    </span>
                  ) : "Sign In"}
                </Button>
              </form>

              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-200"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="px-4 bg-white text-slate-500">or continue with</span>
                </div>
              </div>

              <Button 
                type="button"
                variant="outline" 
                className="w-full border-slate-300 hover:bg-slate-50"
                onClick={handleGoogleLogin}
                data-testid="google-login-btn"
              >
                <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
                Continue with Google
              </Button>

              <p className="text-center text-sm text-slate-600 mt-6">
                Don't have an account?{" "}
                <Link to="/register" className="text-blue-600 hover:text-blue-700 font-medium">
                  Create one
                </Link>
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
