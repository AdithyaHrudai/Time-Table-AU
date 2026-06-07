import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import axios from "axios";
import Sidebar from "@/components/Sidebar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowRight, Save } from "lucide-react";
import { toast } from "sonner";

const YEAR_OPTIONS = [1, 2, 3, 4];
const FIXED_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const FIXED_SLOTS = ["09:00–10:40", "10:40–12:20", "13:30–15:10"];

const blankYearCfg = (year) => ({
  year,
  sections_4yr: year === 1 ? 1 : 0,
  sections_6yr: 0,
  strength_per_section: 60,
});

export default function SessionSetup({ user, token, logout }) {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [session, setSession] = useState(null);
  const [sessionName, setSessionName] = useState("");
  const [years, setYears] = useState([]);
  // year -> {year, sections_4yr, sections_6yr, strength_per_section}
  const [yearCfgs, setYearCfgs] = useState({});

  useEffect(() => {
    bootstrap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const bootstrap = async () => {
    try {
      const [sessRes, ycRes] = await Promise.all([
        axios.get(`/api/sessions/${sessionId}`, { headers: { Authorization: `Bearer ${token}` } }),
        axios.get(`/api/sessions/${sessionId}/year-configs`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setSession(sessRes.data);
      setSessionName(sessRes.data.name);
      setYears(sessRes.data.years || []);

      const ycMap = {};
      (ycRes.data || []).forEach((y) => { ycMap[y.year] = y; });
      (sessRes.data.years || []).forEach((y) => {
        if (!ycMap[y]) ycMap[y] = blankYearCfg(y);
      });
      setYearCfgs(ycMap);
    } catch (error) {
      toast.error("Failed to load session");
      navigate("/dashboard");
    } finally {
      setLoading(false);
    }
  };

  const toggleYear = (y) => {
    const isSelected = years.includes(y);
    // Two independent, pure state updates — never nest one setState inside
    // another's updater (React 18/19 StrictMode flags that as an error).
    setYears((prev) =>
      prev.includes(y) ? prev.filter((x) => x !== y) : [...prev, y].sort((a, b) => a - b)
    );
    if (!isSelected) {
      setYearCfgs((prev) => (prev[y] ? prev : { ...prev, [y]: blankYearCfg(y) }));
    }
  };

  const updateYearCfg = (year, field, value) => {
    setYearCfgs((prev) => ({
      ...prev,
      [year]: { ...(prev[year] || blankYearCfg(year)), [field]: value },
    }));
  };

  const validate = () => {
    if (!sessionName.trim()) { toast.error("Session name is required"); return false; }
    if (years.length === 0) { toast.error("Select at least one year"); return false; }
    for (const y of years) {
      const cfg = yearCfgs[y];
      if (!cfg) { toast.error(`Configure year ${y}`); return false; }
      if ((cfg.sections_4yr || 0) + (cfg.sections_6yr || 0) <= 0) {
        toast.error(`Year ${y}: add at least one section (4-yr or 6-yr stream)`);
        return false;
      }
      if (!cfg.strength_per_section || cfg.strength_per_section < 2) {
        toast.error(`Year ${y}: strength must be at least 2 (for 2 batches)`);
        return false;
      }
    }
    return true;
  };

  const save = async () => {
    if (!validate()) return false;
    setSaving(true);
    try {
      await axios.put(`/api/sessions/${sessionId}`, { name: sessionName, years }, {
        headers: { Authorization: `Bearer ${token}` }
      });
      for (const y of years) {
        const cfg = yearCfgs[y];
        await axios.put(
          `/api/sessions/${sessionId}/year-configs/${y}`,
          {
            year: y,
            sections_4yr: Number(cfg.sections_4yr) || 0,
            sections_6yr: Number(cfg.sections_6yr) || 0,
            strength_per_section: Number(cfg.strength_per_section) || 60,
          },
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }
      toast.success("Session saved");
      return true;
    } catch (error) {
      toast.error(error?.response?.data?.detail || "Failed to save");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleNext = async () => {
    const ok = await save();
    if (ok) navigate(`/session/${sessionId}/sections`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full spinner"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar user={user} logout={logout} sessionName={session?.name} />

      <main className="ml-64 p-8">
        <div className="max-w-4xl">
          <h1 className="font-serif text-3xl font-bold text-slate-900 mb-2">Session Setup</h1>
          <p className="text-slate-600 mb-8">
            CSE department • Anna University main campus schedule (Mon–Sat, 3 slots/day, 1h 40min each, lunch 12:20–13:30).
          </p>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Basic Info</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="name">Session Name</Label>
                  <Input
                    id="name"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    placeholder="Odd Sem 2025-26 — CSE"
                    data-testid="session-name-input"
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Years of Study</CardTitle>
                <CardDescription>
                  Pick the years you want to schedule. Both 4-year B.Tech and 6-year integrated streams run in parallel.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  {YEAR_OPTIONS.map((y) => (
                    <div
                      key={y}
                      className={`flex items-center justify-center gap-2 p-3 rounded-lg border cursor-pointer transition-colors ${
                        years.includes(y) ? "bg-blue-50 border-blue-300" : "bg-white border-slate-200 hover:border-slate-300"
                      }`}
                      onClick={() => toggleYear(y)}
                      data-testid={`year-toggle-${y}`}
                    >
                      <Checkbox checked={years.includes(y)} onCheckedChange={() => toggleYear(y)} />
                      <span className="font-medium text-slate-700">Year {y}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {years.map((y) => {
              const cfg = yearCfgs[y] || blankYearCfg(y);
              return (
                <Card key={y}>
                  <CardHeader>
                    <CardTitle className="text-lg">Year {y} — Sections</CardTitle>
                    <CardDescription>
                      Sections will be auto-labelled. 4-yr → <code>{y}/4 CSE</code> (or <code>{y}/4 CSE - N</code> if more than one).
                      6-yr → <code>{y}/6 CSE - 1, 2, …</code>. Each section is auto-split into Batch-1 and Batch-2.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="space-y-2">
                        <Label>4-yr B.Tech sections</Label>
                        <Input
                          type="number" min="0" max="10"
                          value={cfg.sections_4yr}
                          onChange={(e) => updateYearCfg(y, "sections_4yr", parseInt(e.target.value, 10) || 0)}
                          data-testid={`y${y}-sections-4yr`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>6-yr integrated sections</Label>
                        <Input
                          type="number" min="0" max="20"
                          value={cfg.sections_6yr}
                          onChange={(e) => updateYearCfg(y, "sections_6yr", parseInt(e.target.value, 10) || 0)}
                          data-testid={`y${y}-sections-6yr`}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Strength per section</Label>
                        <Input
                          type="number" min="2" max="240"
                          value={cfg.strength_per_section}
                          onChange={(e) => updateYearCfg(y, "strength_per_section", parseInt(e.target.value, 10) || 60)}
                          data-testid={`y${y}-strength`}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Fixed Schedule (AU CSE)</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600 space-y-1">
                <div><span className="font-medium">Working days:</span> {FIXED_DAYS.join(", ")}</div>
                <div><span className="font-medium">Slots/day:</span> {FIXED_SLOTS.join("  •  ")}</div>
                <div><span className="font-medium">Lunch:</span> 12:20–13:30 (no class)</div>
              </CardContent>
            </Card>

            <div className="flex justify-between pt-4">
              <Button variant="outline" onClick={save} disabled={saving} data-testid="save-session-btn">
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save Changes"}
              </Button>
              <Button className="bg-blue-600 hover:bg-blue-700 btn-primary" onClick={handleNext} data-testid="next-step-btn">
                Next: Review Sections
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
