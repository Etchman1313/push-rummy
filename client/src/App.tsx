import {
  Card,
  canAddToMeld,
  canReplaceWildInMeld,
  cardFace,
  GameAction,
  legalDiscardCandidates,
  MatchState,
  representedRankForWildInMeld,
  sortMeldCardsForDisplay
} from "@push-rummy/shared";
import type { CSSProperties } from "react";
import { DragEvent, useEffect, useMemo, useRef, useState } from "react";
import { DeveloperHome } from "./DeveloperHome";
import { useGameStore } from "./store";
import { ToastStack } from "./ToastStack";
import { cardArtUrl, cumulativePlaceBySeat, objectiveLabel, objectiveOrder, phaseLabel } from "./uiUtils";

function LeaderboardPanel({ variant = "full" }: { variant?: "full" | "embedded" }) {
  const user = useGameStore((s) => s.user);
  const leaderboardRows = useGameStore((s) => s.leaderboardRows);
  const leaderboardMode = useGameStore((s) => s.leaderboardMode);
  const leaderboardSort = useGameStore((s) => s.leaderboardSort);
  const setLeaderboardMode = useGameStore((s) => s.setLeaderboardMode);
  const setLeaderboardSort = useGameStore((s) => s.setLeaderboardSort);
  const embedded = variant === "embedded";
  const maxRows = embedded ? 8 : 12;
  return (
    <section className={`panel leaderboardPanel ${embedded ? "leaderboardPanel--embedded" : ""}`}>
      <div className="sectionHead">
        <h2>Leaderboard</h2>
        {!embedded && (
          <p className="panelHint">Filter by matchup type. Lower avg points is better for Push Rummy scoring.</p>
        )}
      </div>
      <div className="row leaderboardFilters">
        <select value={leaderboardMode} onChange={(e) => void setLeaderboardMode(e.target.value as never)} aria-label="Leaderboard mode">
          <option value="all">All modes</option>
          <option value="hvh">Human vs Human</option>
          <option value="hvai">Human vs AI</option>
          <option value="easy">vs AI Easy</option>
          <option value="medium">vs AI Medium</option>
          <option value="hard">vs AI Hard</option>
        </select>
        <select value={leaderboardSort} onChange={(e) => void setLeaderboardSort(e.target.value as never)} aria-label="Sort by">
          <option value="rating">Sort: Rating</option>
          <option value="wins">Sort: Wins</option>
          <option value="winRate">Sort: Win rate</option>
          <option value="avgPoints">Sort: Avg points</option>
        </select>
      </div>
      <div className="tableScroll">
        <table className="scoreTable leaderboardTable">
          <thead>
            <tr>
              <th>#</th>
              <th>Player</th>
              <th>Rating</th>
              <th>W/L</th>
              <th>Win %</th>
              <th>Avg pts</th>
            </tr>
          </thead>
          <tbody>
            {leaderboardRows.length === 0 ? (
              <tr>
                <td colSpan={6} className="emptyTableMsg">
                  No ranked players yet — be the first to finish a full match.
                </td>
              </tr>
            ) : (
              leaderboardRows.slice(0, maxRows).map((r, i) => (
                <tr key={r.userId} className={user?.id === r.userId ? "row--you" : ""}>
                  <td>{i + 1}</td>
                  <td>{r.username}</td>
                  <td>{Math.round(r.rating)}</td>
                  <td>
                    {r.wins}/{r.losses}
                  </td>
                  <td>{(r.winRate * 100).toFixed(1)}%</td>
                  <td>{r.avgPoints.toFixed(1)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Scorecard({ match }: { match: MatchState }) {
  const rows = Array.from({ length: 6 }, (_, i) => i);
  return (
    <details className="panel scorecardFold" open>
      <summary className="scorecardSummary">
        <h3>Scorecard</h3>
        <span className="scorecardHint">Tap to collapse</span>
      </summary>
      <table className="scoreTable">
        <thead>
          <tr>
            <th>Hand</th>
            {match.players.map((p) => (
              <th key={`h_${p.seat}`}>{p.name}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((i) => (
            <tr key={`row_${i}`}>
              <td>{objectiveLabel[objectiveOrder[i]]}</td>
              {match.players.map((p) => (
                <td key={`${i}_${p.seat}`}>
                  {match.handHistory[i] ? (
                    <>
                      <div>{match.handHistory[i][p.seat] ?? "-"}</div>
                      <small>
                        cum:
                        {match.handHistory
                          .slice(0, i + 1)
                          .reduce((sum, r) => sum + (r[p.seat] ?? 0), 0)}
                      </small>
                    </>
                  ) : (
                    "-"
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function HandResultsModal({
  match,
  isHost,
  onContinue,
  onLeaveTable
}: {
  match: MatchState;
  isHost: boolean;
  onContinue: () => void;
  onLeaveTable: () => void;
}) {
  const loadProfile = useGameStore((s) => s.loadProfile);
  const pushToast = useGameStore((s) => s.pushToast);
  const summary = match.pendingRoundSummary;
  const finalizedRef = useRef(false);
  useEffect(() => {
    if (match.status !== "finished") finalizedRef.current = false;
  }, [match.status]);
  useEffect(() => {
    if (match.status !== "finished" || finalizedRef.current) return;
    finalizedRef.current = true;
    void loadProfile().then(() => pushToast("Ratings updated — leaderboard refreshed.", "success"));
  }, [match.status, loadProfile, pushToast]);
  if (!summary) return null;
  const isFinalModal = match.status === "finished";
  const cumPlace = cumulativePlaceBySeat(summary.results);
  const hasPriorStandings = match.handHistory.length > 1;
  const prevPlace = hasPriorStandings
    ? cumulativePlaceBySeat(
        summary.results.map((row) => ({
          seat: row.seat,
          cumulativeScore: row.cumulativeScore - row.roundScore
        }))
      )
    : null;
  return (
    <div className="modalBackdrop">
      <div className={`modalCard modalCard--results ${isFinalModal ? "modalCard--champion" : ""}`}>
        <div className="modalCard__glow" aria-hidden />
        <h2>{objectiveLabel[summary.objective]}</h2>
        <p className="modalSub">
          Round results — lower hand score ranks higher. Overall place in parentheses; ↑/↓ vs standings before this hand.
        </p>
        <table className="scoreTable scoreTable--results">
          <thead>
            <tr>
              <th>Place</th>
              <th>Player</th>
              <th>Hand Score</th>
              <th>Cumulative</th>
            </tr>
          </thead>
          <tbody>
            {summary.results.map((r, idx) => {
              const player = match.players.find((p) => p.seat === r.seat);
              const isLeader = idx === 0;
              const curPlace = cumPlace.get(r.seat);
              const prevP = prevPlace?.get(r.seat);
              let placeSuffixClass = "cumPlaceSuffix";
              let placeMoveStr = "";
              if (hasPriorStandings && prevP != null && curPlace != null && curPlace !== prevP) {
                if (curPlace < prevP) {
                  placeSuffixClass += " cumPlaceSuffix--up";
                  placeMoveStr = `↑${prevP - curPlace}`;
                } else {
                  placeSuffixClass += " cumPlaceSuffix--down";
                  placeMoveStr = `↓${curPlace - prevP}`;
                }
              }
              return (
                <tr key={`result_${r.seat}`} className={isLeader ? "row--first" : ""}>
                  <td>{idx + 1}</td>
                  <td>
                    {player?.name}
                    {r.seat === summary.winnerSeat ? <span className="wentOutBadge">went out</span> : null}
                  </td>
                  <td>{r.roundScore}</td>
                  <td>
                    {r.cumulativeScore}{" "}
                    <span className={placeSuffixClass} title="Overall standing (lower is better). ↑ / ↓ = change vs previous hand.">
                      {curPlace != null ? (
                        <>
                          ({curPlace}
                          {placeMoveStr ? <sup className="cumPlaceDelta">{placeMoveStr}</sup> : null})
                        </>
                      ) : (
                        "(—)"
                      )}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {match.status === "between_hands" ? (
          isHost ? (
            <button className="primary modalPrimary" onClick={onContinue}>
              Continue to {objectiveLabel[objectiveOrder[match.currentHandIndex + 1]]}
            </button>
          ) : (
            <p className="waitingHost">Waiting for host to continue…</p>
          )
        ) : (
          <div className="finalBanner">
            <strong>Match complete</strong>
            <p>Lowest total score wins. Your rating is updated — see the leaderboard above.</p>
            <button type="button" className="primary modalPrimary" onClick={onLeaveTable}>
              Back to menu
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Lobby() {
  const room = useGameStore((s) => s.room);
  const user = useGameStore((s) => s.user);
  const setAiSeat = useGameStore((s) => s.setAiSeat);
  const startGame = useGameStore((s) => s.startGame);
  const leaveRoom = useGameStore((s) => s.leaveRoom);
  if (!room) return null;
  const playerId = user?.id ?? "";
  const isHost = room.hostId === playerId;
  return (
    <div className="panel lobbyPanel">
      <div className="lobbyHeader">
        <div>
          <h2>Lobby</h2>
          <p className="roomCodeLine">
            Room code <span className="roomCodePill">{room.code}</span>
          </p>
        </div>
        <button type="button" className="btnGhost" onClick={() => void leaveRoom()}>
          Leave lobby
        </button>
      </div>
      <p className="panelHint">Up to four seats. Add AI opponents or leave seats open for friends.</p>
      <div className="seatGrid">
        {[0, 1, 2, 3].map((seat) => {
          const s = room.seats.find((x) => x.seat === seat);
          return (
            <div className="seatCard" key={`seat_${seat}`}>
              <h4>Seat {seat + 1}</h4>
              {s ? (
                <>
                  <div>{s.name}</div>
                  <small>{s.isAi ? `AI (${s.aiLevel})` : "Human"}</small>
                </>
              ) : (
                <small>Open</small>
              )}
              {isHost && seat !== 0 && (!s || s.isAi) && (
                <div className="aiButtons">
                  <button onClick={() => setAiSeat(seat, "easy")}>Easy AI</button>
                  <button onClick={() => setAiSeat(seat, "medium")}>Medium AI</button>
                  <button onClick={() => setAiSeat(seat, "hard")}>Hard AI</button>
                  <button onClick={() => setAiSeat(seat, "open")}>Open</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
      {isHost && (
        <button className="primary lobbyStart" onClick={startGame}>
          Start match
        </button>
      )}
    </div>
  );
}

function GameBoard({ match }: { match: MatchState }) {
  const user = useGameStore((s) => s.user);
  const playerId = user?.id ?? "";
  const room = useGameStore((s) => s.room);
  const sendAction = useGameStore((s) => s.sendAction);
  const continueHand = useGameStore((s) => s.continueHand);
  const autoLaydown = useGameStore((s) => s.autoLaydown);
  const pushToast = useGameStore((s) => s.pushToast);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [orderedIds, setOrderedIds] = useState<string[]>([]);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [draftMelds, setDraftMelds] = useState<Array<{ type: "run" | "set"; cardIds: string[] }>>([]);
  const lastForcedDrawNonceRef = useRef<number | null>(null);
  const meldSeenRef = useRef(new Set<string>());
  const [handDealSweep, setHandDealSweep] = useState(false);
  const [enteringMelds, setEnteringMelds] = useState<Set<string>>(() => new Set());
  const me = match.players.find((p) => p.id === playerId);
  if (!me) return <div className="panel">You are spectating.</div>;
  const isHost = room?.hostId === playerId;
  const isMyTurn = match.hand.activeSeat === me.seat;
  const hand = match.hand.hands[me.seat];
  const handMap = useMemo(() => new Map(hand.map((c) => [c.id, c])), [hand]);
  const legalDiscards = useMemo(() => legalDiscardCandidates(hand, match.hand.tableMelds).map((c) => c.id), [hand, match.hand.tableMelds]);
  const canLayDown = !match.hand.laidDown[me.seat];
  const canSubmitMelds = isMyTurn && (match.hand.turnPhase === "action" || match.hand.turnPhase === "discard_required");
  const singleSelected = selectedIds.length === 1 ? selectedIds[0] : null;
  const orderedHand = orderedIds.map((id) => handMap.get(id)).filter((c): c is Card => !!c);

  const play = (action: GameAction) => sendAction(action);

  useEffect(() => {
    setHandDealSweep(true);
    const t = window.setTimeout(() => setHandDealSweep(false), 920);
    return () => window.clearTimeout(t);
  }, [match.currentHandIndex]);

  useEffect(() => {
    meldSeenRef.current.clear();
    setEnteringMelds(new Set());
  }, [match.currentHandIndex]);

  useEffect(() => {
    const seen = meldSeenRef.current;
    const brandNew: string[] = [];
    for (const m of match.hand.tableMelds) {
      if (!seen.has(m.id)) brandNew.push(m.id);
    }
    for (const m of match.hand.tableMelds) seen.add(m.id);
    if (brandNew.length === 0) return;
    setEnteringMelds(new Set(brandNew));
    const t = window.setTimeout(() => setEnteringMelds(new Set()), 560);
    return () => window.clearTimeout(t);
  }, [match.hand.tableMelds]);

  useEffect(() => {
    setOrderedIds((prev) => {
      const ids = hand.map((c) => c.id);
      const carry = prev.filter((id) => ids.includes(id));
      const added = ids.filter((id) => !carry.includes(id));
      return [...carry, ...added];
    });
    setSelectedIds((prev) => prev.filter((id) => hand.some((c) => c.id === id)));
    setDraftMelds((prev) =>
      prev
        .map((m) => ({ ...m, cardIds: m.cardIds.filter((id) => hand.some((c) => c.id === id)) }))
        .filter((m) => m.cardIds.length > 0)
    );
  }, [hand]);

  useEffect(() => {
    const event = match.hand.lastForcedDrawEvent;
    if (!event || event.seat !== me.seat) return;
    if (lastForcedDrawNonceRef.current === event.nonce) return;
    lastForcedDrawNonceRef.current = event.nonce;
    pushToast(
      `No legal discard — drew ${event.count} extra card${event.count === 1 ? "" : "s"} until you could discard.`,
      "info"
    );
  }, [match.hand.lastForcedDrawEvent, me.seat, pushToast]);

  const onCardDrop = (targetId: string) => {
    if (!draggedId || draggedId === targetId) return;
    setOrderedIds((prev) => {
      const arr = [...prev];
      const from = arr.indexOf(draggedId);
      const to = arr.indexOf(targetId);
      if (from < 0 || to < 0) return prev;
      arr.splice(from, 1);
      arr.splice(to, 0, draggedId);
      return arr;
    });
    setDraggedId(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const commitSelectedAs = (type: "run" | "set") => {
    if (selectedIds.length === 0) return;
    const taken = new Set(draftMelds.flatMap((m) => m.cardIds));
    const clean = selectedIds.filter((id) => !taken.has(id));
    if (clean.length === 0) return;
    setDraftMelds((prev) => [...prev, { type, cardIds: clean }]);
    setSelectedIds([]);
  };

  const submitLaydown = () => {
    if (!draftMelds.length) return;
    play({ type: "laydown", melds: draftMelds });
    setDraftMelds([]);
    setSelectedIds([]);
  };

  const discardWithSelected = () => {
    if (!singleSelected) return;
    play({ type: "discard", cardId: singleSelected });
  };

  return (
    <div className="board">
      <div className="tableBar">
        <div className="playerChips" aria-label="Players">
          {match.players.map((p) => {
            const active = p.seat === match.hand.activeSeat;
            const you = p.id === playerId;
            return (
              <div
                key={p.seat}
                className={`playerChip ${active ? "playerChip--active" : ""} ${you ? "playerChip--you" : ""}`}
              >
                <span className="playerChip__avatar">{p.name.slice(0, 1).toUpperCase()}</span>
                <span className="playerChip__name">{p.isAi ? p.name.split(" ")[0] : p.name}</span>
                {active && <span className="playerChip__turn">turn</span>}
              </div>
            );
          })}
        </div>
      </div>

      <div className="playTable" aria-label="Table">
        <div className="playTable__top">
          <div className="panel discardPanel discardPanel--compact">
            <h4>Discard</h4>
            {match.hand.discard.length ? (
              <img
                key={match.hand.discard[match.hand.discard.length - 1]!.id}
                className="discardArt"
                src={cardArtUrl(match.hand.discard[match.hand.discard.length - 1]!)}
                alt="Discard top"
              />
            ) : (
              <p className="discardPanel__empty">—</p>
            )}
            {isMyTurn && match.hand.turnPhase === "draw_choice" && (
              <div className="actionRow compactActions">
                <button className="primary" onClick={() => play({ type: "choose_pickup" })}>Pick Up</button>
                <button onClick={() => play({ type: "choose_push" })}>Push</button>
              </div>
            )}
          </div>

          <div className={`panel statusPanel statusPanel--compact ${isMyTurn ? "statusPanel--yourTurn" : ""}`}>
            <div className="statusStrip">
              <h2 className="statusStrip__round">Round {match.currentHandIndex + 1}</h2>
              <span className="objectiveBadge">{objectiveLabel[match.hand.objective]}</span>
              <div className="statusStrip__meta">
                <span className="statusStrip__active">
                  <strong>{match.players.find((p) => p.seat === match.hand.activeSeat)?.name}</strong>
                  <span key={match.hand.turnPhase} className="phasePill phasePill--flash">
                    {phaseLabel(match.hand.turnPhase)}
                  </span>
                </span>
              </div>
            </div>
            <p className="panelHint statusStrip__hint" title="Build melds for the round objective, then discard.">
              Objective melds, then discard to end your turn.
            </p>
          </div>

          <LeaderboardPanel variant="embedded" />
        </div>

        <div className="panel actionsPanel actionsPanel--inTable">
        {canSubmitMelds && (
          <>
            <div className="actionRow">
              <button onClick={() => commitSelectedAs("run")}>Tag Selected as Run</button>
              <button onClick={() => commitSelectedAs("set")}>Tag Selected as Set</button>
              <button className="primary" onClick={submitLaydown} disabled={draftMelds.length === 0}>
                {canLayDown ? "Submit Objective Laydown" : "Lay New Meld(s)"} ({draftMelds.length})
              </button>
              <button onClick={() => setDraftMelds([])} disabled={draftMelds.length === 0}>
                Clear Draft
              </button>
              {canLayDown && <button onClick={autoLaydown}>Auto Laydown Objective</button>}
            </div>
            {draftMelds.length > 0 && (
              <div className="draftMelds">
                {draftMelds.map((m, idx) => (
                  <div key={`draft_${idx}`} className="draftMeld">
                    <strong>{m.type.toUpperCase()}</strong>: {m.cardIds.map((id) => cardFace(handMap.get(id) as Card)).join(" ")}
                    <button onClick={() => setDraftMelds((prev) => prev.filter((_, i) => i !== idx))}>Remove</button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {isMyTurn && (match.hand.turnPhase === "action" || match.hand.turnPhase === "discard_required") && (
          <div className="actionRow">
            <button
              className={singleSelected && legalDiscards.includes(singleSelected) ? "discard legal" : "discard illegal"}
              disabled={!singleSelected}
              onClick={discardWithSelected}
            >
              Discard Selected
            </button>
            <small>Select one card in your hand to discard.</small>
          </div>
        )}
        </div>

        <div className="handMeldSplit handMeldSplit--inTable">
        <div className="panel handPanel">
          <div className="handPanel__head">
            <h3>Your hand</h3>
            <span className="handCount">{hand.length} cards</span>
          </div>
          <p className="panelHint handHint">Drag to reorder · Click to multi-select · Highlighted = legal discard</p>
          <div className={`cards handRail ${handDealSweep ? "handRail--dealSweep" : ""}`}>
            {orderedHand.map((c, i) => (
              <button
                key={c.id}
                className={`card cardArtWrap ${selectedIds.includes(c.id) ? "selected" : ""} ${
                  legalDiscards.includes(c.id) ? "isLegalDiscard" : ""
                } ${draggedId === c.id ? "isDragging" : ""}`}
                style={handDealSweep ? ({ ["--deal-i" as string]: i } as CSSProperties) : undefined}
                onClick={() => toggleSelect(c.id)}
                draggable
                onDragStart={() => setDraggedId(c.id)}
                onDragEnd={() => setDraggedId(null)}
                onDragOver={(e: DragEvent<HTMLButtonElement>) => e.preventDefault()}
                onDrop={() => onCardDrop(c.id)}
                title={`${cardFace(c)}${legalDiscards.includes(c.id) ? " (legal discard)" : ""}`}
              >
                <img src={cardArtUrl(c)} alt={cardFace(c)} className="cardArt" />
              </button>
            ))}
          </div>
        </div>

        <div className="panel tableMeldsPanel">
          <h3>Table Melds</h3>
          {match.hand.tableMelds.length === 0 ? (
            <div className="emptyState">No melds on the table yet. Lay down to start the board.</div>
          ) : (
            <div className="meldGrid tableMeldsGrid">
              {match.hand.tableMelds.map((m) => {
                const displayCards = sortMeldCardsForDisplay(m);
                const selectedCard = singleSelected ? handMap.get(singleSelected) : undefined;
                const showAdd =
                  Boolean(selectedCard && canAddToMeld(selectedCard, m));
                const showReplace =
                  Boolean(selectedCard && canReplaceWildInMeld(selectedCard, m) !== null);
                return (
                  <div className={`meld ${enteringMelds.has(m.id) ? "meld--enter" : ""}`} key={m.id}>
                    <div>{m.type.toUpperCase()} ({m.cards.length})</div>
                    <small>owner seat {m.ownerSeat + 1}</small>
                    <div className="cards compact meldCardsRow">
                      {displayCards.map((c) => {
                        const rep = representedRankForWildInMeld(c, m);
                        const tip = c.isWild && rep ? `${cardFace(c)} — represents ${rep}` : cardFace(c);
                        return (
                          <span key={c.id} className={c.isWild ? "wild compactCard" : "compactCard"} title={tip}>
                            <img src={cardArtUrl(c)} alt={cardFace(c)} className="compactCardArt" title={tip} />
                          </span>
                        );
                      })}
                    </div>
                    {isMyTurn && match.hand.laidDown[me.seat] && (showAdd || showReplace) && (
                      <div className="actionRow meldActions">
                        {showAdd && (
                          <button type="button" onClick={() => play({ type: "add_to_meld", meldId: m.id, cardId: singleSelected! })}>
                            Add selected
                          </button>
                        )}
                        {showReplace && (
                          <button type="button" onClick={() => play({ type: "replace_wild", meldId: m.id, cardId: singleSelected! })}>
                            Replace wild
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
      </div>

      <Scorecard match={match} />
      <HandResultsModal
        match={match}
        isHost={!!isHost}
        onContinue={continueHand}
        onLeaveTable={() => void useGameStore.getState().leaveRoom()}
      />
    </div>
  );
}

export default function App() {
  const connect = useGameStore((s) => s.connect);
  const room = useGameStore((s) => s.room);
  const user = useGameStore((s) => s.user);
  const profile = useGameStore((s) => s.profile);
  const register = useGameStore((s) => s.register);
  const login = useGameStore((s) => s.login);
  const logout = useGameStore((s) => s.logout);
  const loadProfile = useGameStore((s) => s.loadProfile);
  const developerHomeAccess = useGameStore((s) => s.developerHomeAccess);
  const createRoom = useGameStore((s) => s.createRoom);
  const joinRoom = useGameStore((s) => s.joinRoom);
  const error = useGameStore((s) => s.error);
  const [username, setUsername] = useState("player1");
  const [password, setPassword] = useState("password");
  const [code, setCode] = useState("");
  const [developerHomeOpen, setDeveloperHomeOpen] = useState(false);

  const ratings = profile?.ratings as { global_rating?: number } | undefined;
  const records = profile?.records as { wins?: number; losses?: number } | undefined;
  const globalRating = ratings?.global_rating != null ? Math.round(ratings.global_rating) : null;

  useEffect(() => {
    useGameStore.getState().loadLeaderboard();
  }, []);

  useEffect(() => {
    connect();
  }, [connect, user]);

  useEffect(() => {
    if (user) void loadProfile();
  }, [user, loadProfile]);

  const inMatch = Boolean(room?.match);
  const showDeveloperNav = Boolean(user && developerHomeAccess);

  useEffect(() => {
    if (inMatch) setDeveloperHomeOpen(false);
  }, [inMatch]);

  useEffect(() => {
    if (!user || !developerHomeAccess) setDeveloperHomeOpen(false);
  }, [user, developerHomeAccess]);

  const developerView = showDeveloperNav && developerHomeOpen;

  return (
    <main className={`app ${inMatch ? "app--inGame" : ""}`}>
      <ToastStack />
      <header className="hero">
        <div className="hero__text">
          <p className="hero__eyebrow">Push Pile · Push Your Luck · Push Rummy</p>
          <h1>Push Rummy</h1>
          <p className="hero__sub">
            Online card pressure for 2–4 players. Build objectives, steal wilds, and force the table to choke on discards.
          </p>
          {showDeveloperNav && !inMatch && !developerView && (
            <p className="hero__devLink">
              <button type="button" className="hero__devLinkBtn" onClick={() => setDeveloperHomeOpen(true)}>
                Developer Home
              </button>
            </p>
          )}
        </div>
        {user && (
          <div className="userDock">
            <div className="userDock__who">
              <span className="userDock__name">{user.username}</span>
              {globalRating != null && <span className="ratingOrb">{globalRating}</span>}
            </div>
            <div className="userDock__meta">
              {records != null && (
                <span>
                  {records.wins ?? 0}W · {records.losses ?? 0}L
                </span>
              )}
              <button type="button" className="btnGhost btnGhost--small" onClick={() => void loadProfile()}>
                Refresh stats
              </button>
              <button type="button" className="btnGhost btnGhost--small" onClick={logout}>
                Log out
              </button>
            </div>
          </div>
        )}
      </header>

      {developerView ? (
        <DeveloperHome onBack={() => setDeveloperHomeOpen(false)} />
      ) : (
        <>
          {!user && (
            <div className="loginHero panel">
              <div className="loginHero__copy">
                <h2>Play competitively</h2>
                <p>Create an account to save your rating, track HvH vs AI splits, and climb the leaderboard.</p>
              </div>
              <div className="loginHero__form">
                <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Username" autoComplete="username" />
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Password"
                  type="password"
                  autoComplete="current-password"
                />
                <div className="loginHero__actions">
                  <button className="primary" type="button" onClick={() => void login(username, password)}>
                    Log in
                  </button>
                  <button type="button" onClick={() => void register(username, password)}>
                    Register
                  </button>
                </div>
              </div>
            </div>
          )}

          {inMatch ? (
            room?.match && <GameBoard match={room.match} />
          ) : (
            <>
              <LeaderboardPanel />

              {user && !room && (
                <section className="panel playPanel">
                  <h2>Table</h2>
                  <p className="panelHint">Host a new room or join with a code from a friend.</p>
                  <div className="playGrid">
                    <button className="primary playTile" type="button" onClick={() => void createRoom()}>
                      <strong>New room</strong>
                      <span>Host — you get seat 1</span>
                    </button>
                    <div className="playJoin">
                      <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="ROOM CODE" />
                      <button type="button" onClick={() => void joinRoom(code)}>
                        Join
                      </button>
                    </div>
                  </div>
                  {error && <p className="error">{error}</p>}
                </section>
              )}

              {room && room.status === "lobby" && <Lobby />}

              {user && error && !room && <p className="error error--standalone">{error}</p>}
            </>
          )}
        </>
      )}
    </main>
  );
}
