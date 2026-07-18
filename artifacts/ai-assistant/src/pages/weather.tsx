import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { customFetch } from "@workspace/api-client-react";
import { useFamilyStatus } from "@/contexts/family-context";
import { RefreshCw, Settings, X, CloudSun } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface WeatherCard { day: string; emoji: string; high: string; low: string; summary: string; }
interface WeatherBriefing { city: string; text: string; cards: WeatherCard[]; needsSetup: boolean; }

export default function WeatherPage() {
  const qc = useQueryClient();
  const { isAdmin } = useFamilyStatus();
  const [showCityModal, setShowCityModal] = useState(false);
  const [cityInput, setCityInput] = useState("");

  const briefingKey = ["/api/weather/briefing"];
  const cityKey = ["/api/weather/city"];

  const { data: cityData } = useQuery<{ city: string }>({
    queryKey: cityKey,
    queryFn: () => customFetch(`${BASE}/api/weather/city`),
  });

  const { data, isLoading, refetch, isFetching } = useQuery<WeatherBriefing>({
    queryKey: briefingKey,
    queryFn: () => customFetch(`${BASE}/api/weather/briefing`),
    staleTime: 3 * 60 * 60 * 1000,
  });

  const saveCityMutation = useMutation({
    mutationFn: (city: string) => customFetch(`${BASE}/api/settings/home`, { method: "PATCH", body: JSON.stringify({ city }), headers: { "Content-Type": "application/json" } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: cityKey });
      qc.invalidateQueries({ queryKey: briefingKey });
      setShowCityModal(false);
    },
  });

  const loading = isLoading || isFetching;

  if (data?.needsSetup || (!loading && !data?.city)) {
    return (
      <div className="flex flex-col h-full items-center justify-center gap-6 p-6">
        <div className="text-6xl">🌤️</div>
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Weather Setup</h1>
          <p className="text-muted-foreground">
            {isAdmin ? "Set your home city to get AI-powered weather briefings." : "An admin needs to set the home city first."}
          </p>
        </div>
        {isAdmin && (
          <button onClick={() => { setCityInput(cityData?.city ?? ""); setShowCityModal(true); }}
            className="flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90">
            <Settings className="h-4 w-4" /> Set Home City
          </button>
        )}
        {showCityModal && <CityModal city={cityInput} onChange={setCityInput} onSave={() => saveCityMutation.mutate(cityInput)} onClose={() => setShowCityModal(false)} pending={saveCityMutation.isPending} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto p-6 gap-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <CloudSun className="h-6 w-6 text-amber-400" /> Weather
          </h1>
          <p className="text-sm text-muted-foreground">{data?.city || cityData?.city}</p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && (
            <button onClick={() => { setCityInput(data?.city ?? cityData?.city ?? ""); setShowCityModal(true); }}
              className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground">
              <Settings className="h-4 w-4" /> Change City
            </button>
          )}
          <button onClick={() => refetch()} disabled={loading}
            className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <div className="text-5xl animate-pulse">⛅</div>
          <p className="text-muted-foreground">Fetching weather briefing…</p>
        </div>
      ) : (
        <>
          {/* Hero briefing card */}
          {data?.text && (
            <div className="bg-gradient-to-br from-blue-500/10 to-indigo-500/10 border border-blue-500/20 rounded-2xl p-6">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-2xl">{data.cards?.[0]?.emoji ?? "🌤️"}</span>
                <div>
                  <p className="font-semibold text-foreground">{data.city}</p>
                  <p className="text-xs text-muted-foreground">Today — {data.cards?.[0]?.high} / {data.cards?.[0]?.low}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground leading-relaxed">{data.text}</p>
            </div>
          )}

          {/* 5-day cards */}
          {data?.cards && data.cards.length > 0 && (
            <div className="grid grid-cols-5 gap-3">
              {data.cards.map((card, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 flex flex-col items-center gap-1 text-center">
                  <p className="text-xs font-medium text-muted-foreground">{card.day}</p>
                  <p className="text-3xl">{card.emoji}</p>
                  <p className="text-xs text-foreground">{card.summary}</p>
                  <div className="flex gap-1 text-xs mt-1">
                    <span className="text-orange-400 font-medium">{card.high}</span>
                    <span className="text-muted-foreground">/</span>
                    <span className="text-blue-400 font-medium">{card.low}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            AI-generated briefing based on seasonal weather patterns. Cached for 3 hours.
          </p>
        </>
      )}

      {showCityModal && (
        <CityModal city={cityInput} onChange={setCityInput} onSave={() => saveCityMutation.mutate(cityInput)} onClose={() => setShowCityModal(false)} pending={saveCityMutation.isPending} />
      )}
    </div>
  );
}

function CityModal({ city, onChange, onSave, onClose, pending }: { city: string; onChange: (v: string) => void; onSave: () => void; onClose: () => void; pending: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="bg-card border border-border rounded-2xl w-full max-w-sm p-6 shadow-2xl flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Set Home City</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <input autoFocus placeholder="e.g. New York, NY"
          className="bg-input border border-border rounded-lg px-3 py-2 text-sm text-foreground w-full placeholder:text-muted-foreground"
          value={city} onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && city.trim() && onSave()} />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm text-muted-foreground hover:bg-accent">Cancel</button>
          <button onClick={onSave} disabled={!city.trim() || pending}
            className="px-4 py-2 rounded-lg text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
