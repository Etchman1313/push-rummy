import type { ReactNode } from "react";
import { useGameStore } from "./store";

type Period = {
  games: number;
  wins: number;
  losses: number;
  winRate: number | null;
  avgPoints: number | null;
};

type AnalyticsPayload = {
  last7d: Period;
  last30d: Period;
  streak: { kind: "win" | "loss" | "none"; length: number };
  recentForm: Array<"W" | "L">;
};

type Standing = {
  displayName: string;
  placement: number;
  score: number;
  isAi: boolean;
};

type HistoryRow = {
  matchId: string;
  endedAt: string;
  tableMode: string;
  myPlacement: number;
  myScore: number;
  won: boolean;
  standings: Standing[];
};

function Metric({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="analyticsMetric">
      <div className="analyticsMetric__label">{label}</div>
      <div className="analyticsMetric__value">{children}</div>
    </div>
  );
}

function periodBlock(label: string, p: Period) {
  const pct = p.winRate == null ? "—" : `${(p.winRate * 100).toFixed(0)}%`;
  const pts = p.avgPoints == null ? "—" : p.avgPoints.toFixed(1);
  return (
    <div className="analyticsPeriod">
      <h4 className="analyticsPeriod__title">{label}</h4>
      <div className="analyticsPeriod__stats">
        <Metric label="Games">{p.games}</Metric>
        <Metric label="W–L">
          {p.games ? `${p.wins}–${p.losses}` : "—"}
        </Metric>
        <Metric label="Win rate">{pct}</Metric>
        <Metric label="Avg pts">{pts}</Metric>
      </div>
    </div>
  );
}

export function AnalyticsPanel() {
  const profile = useGameStore((s) => s.profile);
  const analytics = profile?.analytics as AnalyticsPayload | undefined;
  const matchHistory = profile?.matchHistory as HistoryRow[] | undefined;

  if (!profile || !analytics) return null;

  const streak = analytics.streak;
  const streakLabel =
    streak.kind === "none" || streak.length === 0
      ? "No streak yet"
      : streak.kind === "win"
        ? `${streak.length}-match win streak`
        : `${streak.length}-match slide`;

  return (
    <section className="analyticsBand" aria-labelledby="analyticsHeading">
      <div className="analyticsBand__glow" aria-hidden />
      <div className="analyticsBand__inner">
        <div className="analyticsBand__head">
          <h2 id="analyticsHeading">Your analytics</h2>
          <p className="analyticsBand__sub">Completed matches only · lower points rank higher</p>
        </div>

        <div className="analyticsBand__grid">
          <div
            className={`analyticsStreak ${
              streak.kind === "win" ? "analyticsStreak--hot" : streak.kind === "loss" ? "analyticsStreak--cold" : ""
            }`}
          >
            <span className="analyticsStreak__eyebrow">Current form</span>
            <p className="analyticsStreak__main">{streakLabel}</p>
          </div>
          {periodBlock("Last 7 days", analytics.last7d)}
          {periodBlock("Last 30 days", analytics.last30d)}
        </div>

        {analytics.recentForm.length > 0 && (
          <div className="analyticsFormBlock">
            <h3 className="analyticsFormBlock__title">Recent results</h3>
            <p className="analyticsFormBlock__hint">Oldest → newest (last {analytics.recentForm.length} matches)</p>
            <div className="formStrip" role="list" aria-label="Win loss sequence">
              {analytics.recentForm.map((o, i) => (
                <span
                  key={`${i}_${o}`}
                  role="listitem"
                  className={`formCell ${o === "W" ? "formCell--w" : "formCell--l"}`}
                  title={o === "W" ? "Win" : "Loss"}
                >
                  {o}
                </span>
              ))}
            </div>
          </div>
        )}

        {matchHistory && matchHistory.length > 0 && (
          <details className="analyticsHistoryFold">
            <summary className="analyticsHistoryFold__summary">Match scorecards ({matchHistory.length})</summary>
            <div className="analyticsHistoryList">
              {matchHistory.map((m) => (
                <details key={m.matchId} className="analyticsHistoryCard">
                  <summary className="analyticsHistoryCard__summary">
                    <span className="analyticsHistoryCard__date">{new Date(m.endedAt).toLocaleString()}</span>
                    <span className={`analyticsHistoryCard__pill ${m.won ? "analyticsHistoryCard__pill--win" : ""}`}>
                      {m.won ? "1st" : `${m.myPlacement}th`} · {m.tableMode.toUpperCase()} · {m.myScore} pts
                    </span>
                  </summary>
                  <table className="scoreTable analyticsMiniTable">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Player</th>
                        <th>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {m.standings.map((s) => (
                        <tr key={`${m.matchId}_${s.placement}`}>
                          <td>{s.placement}</td>
                          <td>
                            {s.displayName}
                            {s.isAi ? <span className="analyticsAiTag"> AI</span> : null}
                          </td>
                          <td>{s.score}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ))}
            </div>
          </details>
        )}

        {matchHistory && matchHistory.length === 0 && (
          <p className="analyticsEmpty">Finish a full match to build history, streaks, and trends here.</p>
        )}
      </div>
    </section>
  );
}
