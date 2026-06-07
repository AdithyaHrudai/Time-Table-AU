import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Calendar, Users, Building2, FileDown, CheckCircle, ArrowRight, Clock, Shield } from "lucide-react";

export default function LandingPage({ user }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Navigation */}
      <nav className="fixed top-0 left-0 right-0 z-50 glass-header">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <Calendar className="w-8 h-8 text-blue-600" />
              <span className="font-serif text-xl font-bold text-slate-900">TimetableGenius</span>
            </div>
            <div className="flex items-center gap-4">
              {user ? (
                <Link to="/dashboard">
                  <Button data-testid="dashboard-btn" className="bg-blue-600 hover:bg-blue-700 text-white">
                    Go to Dashboard
                    <ArrowRight className="w-4 h-4 ml-2" />
                  </Button>
                </Link>
              ) : (
                <>
                  <Link to="/dashboard">
                    <Button data-testid="login-btn" variant="ghost" className="text-slate-700 hover:text-slate-900">
                      Sign In
                    </Button>
                  </Link>
                  <Link to="/dashboard">
                    <Button data-testid="register-btn" className="bg-blue-600 hover:bg-blue-700 text-white btn-primary">
                      Get Started
                    </Button>
                  </Link>
                </>
              )}
            </div>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section 
        className="hero-section pt-16"
        style={{
          backgroundImage: `url(https://images.unsplash.com/photo-1680444873773-7c106c23ac52?crop=entropy&cs=srgb&fm=jpg&ixid=M3w3NTY2ODh8MHwxfHNlYXJjaHwxfHx1bml2ZXJzaXR5JTIwY2FtcHVzJTIwYXJjaGl0ZWN0dXJlJTIwbW9kZXJufGVufDB8fHx8MTc3MDMxMzc3Nnww&ixlib=rb-4.1.0&q=85)`
        }}
      >
        <div className="hero-overlay"></div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-32 lg:py-48">
          <div className="max-w-3xl">
            <h1 className="font-serif text-4xl sm:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
              Design Conflict-Free Timetables in Minutes
            </h1>
            <p className="text-lg sm:text-xl text-slate-300 mb-8 leading-relaxed">
              The intelligent scheduling platform for universities. Eliminate overlaps, respect faculty preferences, 
              and generate print-ready timetables with our powerful constraint-based algorithm.
            </p>
            <div className="flex flex-wrap gap-4">
              <Link to="/dashboard">
                <Button data-testid="hero-get-started-btn" size="lg" className="bg-blue-600 hover:bg-blue-700 text-white btn-primary px-8 py-6 text-lg">
                  Start Free
                  <ArrowRight className="w-5 h-5 ml-2" />
                </Button>
              </Link>
              <a href="#features">
                <Button data-testid="hero-learn-more-btn" size="lg" variant="outline" className="bg-white/10 border-white/30 text-white hover:bg-white/20 px-8 py-6 text-lg">
                  Learn More
                </Button>
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Everything You Need for Perfect Scheduling
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              Built by academics, for academics. Our platform understands the unique challenges of university timetabling.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8 stagger-children">
            {/* Feature 1 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center mb-4">
                <Users className="w-6 h-6 text-blue-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">Faculty Management</h3>
              <p className="text-slate-600">
                Track preferences, unavailable slots, and weekly hour requirements. No more double bookings.
              </p>
            </div>

            {/* Feature 2 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center mb-4">
                <Building2 className="w-6 h-6 text-emerald-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">Room & Lab Allocation</h3>
              <p className="text-slate-600">
                Manage classrooms and laboratories separately. Automatic assignment based on requirements.
              </p>
            </div>

            {/* Feature 3 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">No Back-to-Back</h3>
              <p className="text-slate-600">
                Our algorithm ensures no faculty member has consecutive lectures. Healthy workload distribution.
              </p>
            </div>

            {/* Feature 4 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-purple-100 rounded-xl flex items-center justify-center mb-4">
                <Calendar className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">Priority Slots</h3>
              <p className="text-slate-600">
                Let senior faculty choose their preferred slots first. The system fills remaining slots automatically.
              </p>
            </div>

            {/* Feature 5 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-rose-100 rounded-xl flex items-center justify-center mb-4">
                <CheckCircle className="w-6 h-6 text-rose-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">Zero Conflicts</h3>
              <p className="text-slate-600">
                Real-time conflict detection. Our algorithm guarantees no overlaps between faculty, sections, or rooms.
              </p>
            </div>

            {/* Feature 6 */}
            <div className="stat-card card-hover">
              <div className="w-12 h-12 bg-cyan-100 rounded-xl flex items-center justify-center mb-4">
                <FileDown className="w-6 h-6 text-cyan-600" />
              </div>
              <h3 className="font-serif text-xl font-bold text-slate-900 mb-2">PDF Export</h3>
              <p className="text-slate-600">
                Generate print-ready PDFs. Export master timetable, faculty-wise, or section-wise views.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-24 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="font-serif text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Simple 4-Step Process
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From setup to PDF export in under 10 minutes
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { step: "01", title: "Configure Session", desc: "Set working days, time slots, and weekly hour limits" },
              { step: "02", title: "Add Resources", desc: "Enter faculty, rooms, sections, and subjects" },
              { step: "03", title: "Set Priorities", desc: "Let faculty select their preferred time slots" },
              { step: "04", title: "Generate & Export", desc: "Auto-generate timetable and download PDF" }
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-16 h-16 bg-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4 text-white font-mono font-bold text-xl">
                  {item.step}
                </div>
                <h3 className="font-serif text-lg font-bold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 bg-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <Clock className="w-16 h-16 text-blue-400 mx-auto mb-6" />
          <h2 className="font-serif text-3xl sm:text-4xl font-bold text-white mb-4">
            Save Hours of Manual Work
          </h2>
          <p className="text-lg text-slate-400 mb-8 max-w-2xl mx-auto">
            Join hundreds of department heads who've switched to automated timetabling. 
            Focus on what matters—teaching and research.
          </p>
          <Link to="/dashboard">
            <Button data-testid="cta-get-started-btn" size="lg" className="bg-blue-600 hover:bg-blue-700 text-white btn-primary px-10 py-6 text-lg">
              Create Your First Timetable
              <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 bg-slate-900 border-t border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <Calendar className="w-6 h-6 text-blue-400" />
              <span className="font-serif text-lg font-bold text-white">TimetableGenius</span>
            </div>
            <p className="text-slate-500 text-sm">
              © 2024 TimetableGenius. Built for Academic Excellence.
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}
