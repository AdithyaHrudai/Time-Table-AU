import { Link, useLocation, useParams } from "react-router-dom";
import {
  Calendar, LayoutDashboard, Users, BookOpen,
  GraduationCap, ListChecks, Table2, LogOut, Settings, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const Sidebar = ({ user, logout, sessionName }) => {
  const location = useLocation();
  const { sessionId } = useParams();

  const mainNavItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/dashboard" }
  ];

  const sessionNavItems = sessionId ? [
    { icon: Settings, label: "Session Setup", path: `/session/${sessionId}/setup` },
    { icon: GraduationCap, label: "Sections", path: `/session/${sessionId}/sections` },
    { icon: BookOpen, label: "Subjects", path: `/session/${sessionId}/subjects` },
    { icon: Users, label: "Faculty", path: `/session/${sessionId}/faculty` },
    { icon: ListChecks, label: "Faculty Choices", path: `/session/${sessionId}/faculty-choices` },
    { icon: Table2, label: "Timetable", path: `/session/${sessionId}/timetable` }
  ] : [];

  const isActive = (path) => location.pathname === path;

  return (
    <aside className="sidebar w-64 flex flex-col fixed left-0 top-0 bottom-0 z-40">
      <div className="p-6 border-b border-white/10">
        <Link to="/dashboard" className="flex items-center gap-2">
          <Calendar className="w-8 h-8 text-blue-400" />
          <span className="font-serif text-xl font-bold text-white">TimetableGenius</span>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        {mainNavItems.map((item) => (
          <Link
            key={item.path}
            to={item.path}
            className={cn("sidebar-link", isActive(item.path) && "active")}
            data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
          >
            <item.icon className="w-5 h-5" />
            <span>{item.label}</span>
          </Link>
        ))}

        {sessionId && (
          <>
            <div className="pt-4 pb-2">
              <div className="flex items-center gap-2 px-3 py-2">
                <ChevronRight className="w-4 h-4 text-slate-400" />
                <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  {sessionName || "Current Session"}
                </span>
              </div>
            </div>
            {sessionNavItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn("sidebar-link", isActive(item.path) && "active")}
                data-testid={`nav-${item.label.toLowerCase().replace(/ /g, '-')}`}
              >
                <item.icon className="w-5 h-5" />
                <span>{item.label}</span>
              </Link>
            ))}
          </>
        )}
      </nav>

      <div className="p-4 border-t border-white/10">
        <div className="flex items-center gap-3 px-3 py-2 mb-2">
          {user?.picture ? (
            <img src={user.picture} alt={user.name} className="w-10 h-10 rounded-full" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-medium">
              {user?.name?.charAt(0) || "U"}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-white truncate">{user?.name}</p>
            <p className="text-xs text-slate-400 truncate">{user?.email}</p>
          </div>
        </div>
        <Button
          variant="ghost"
          className="w-full justify-start text-slate-400 hover:text-white hover:bg-white/10"
          onClick={logout}
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Sign Out
        </Button>
      </div>
    </aside>
  );
};

export default Sidebar;
