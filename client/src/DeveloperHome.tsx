import { useGameStore } from "./store";

type Props = {
  onBack: () => void;
};

export function DeveloperHome({ onBack }: Props) {
  const user = useGameStore((s) => s.user);
  const developerHomeAccess = useGameStore((s) => s.developerHomeAccess);
  if (!developerHomeAccess) {
    return (
      <div className="panel devHome">
        <p className="error">You do not have access to Developer Home.</p>
        <button type="button" className="btnGhost" onClick={onBack}>
          Back
        </button>
      </div>
    );
  }
  const profile = useGameStore((s) => s.profile);
  const loadProfile = useGameStore((s) => s.loadProfile);

  return (
    <div className="devHome">
      <div className="devHome__toolbar">
        <button type="button" className="btnGhost" onClick={onBack}>
          ← Back to Push Rummy
        </button>
      </div>

      <header className="devHome__header">
        <h2 className="devHome__title">Developer Home</h2>
        <p className="panelHint">Internal references and tooling. Not shown to other accounts.</p>
      </header>

      <section className="panel devHome__card">
        <h3 className="devHome__cardTitle">Account management</h3>
        <p className="devHome__muted">
          Current session: <strong>{user?.username}</strong>
          {user?.id && (
            <>
              {" "}
              · user id <code className="devHome__code">{user.id}</code>
            </>
          )}
        </p>
        <p className="devHome__muted">
          Ratings and records load from the server profile. Password changes are not exposed in this UI yet; manage accounts via the server or DB if
          needed.
        </p>
        <button type="button" className="primary devHome__action" onClick={() => void loadProfile()}>
          Refresh profile from server
        </button>
        {profile && (
          <details className="devHome__raw">
            <summary>Raw profile payload (debug)</summary>
            <pre className="devHome__pre">{JSON.stringify(profile, null, 2)}</pre>
          </details>
        )}
      </section>

      <section className="panel devHome__card">
        <h3 className="devHome__cardTitle">Unit tests</h3>
        <p className="devHome__muted">Run from the repository root (requires dev dependencies installed):</p>
        <pre className="devHome__pre">
          {`npm test
npm run test:coverage`}
        </pre>
        <p className="devHome__muted">See <code className="devHome__code">docs/README.md</code> for documentation index.</p>
      </section>

      <section className="panel devHome__card">
        <h3 className="devHome__cardTitle">Documentation</h3>
        <ul className="devHome__list">
          <li>
            <code className="devHome__code">docs/README.md</code> — doc index
          </li>
          <li>
            <code className="devHome__code">docs/ARCHITECTURE.md</code> — system design
          </li>
          <li>
            <code className="devHome__code">docs/GAMEPLAY.md</code> — product flow
          </li>
          <li>
            <code className="devHome__code">docs/RULES.md</code> — card rules
          </li>
          <li>
            <code className="devHome__code">docs/SECURITY.md</code> — ops / security
          </li>
          <li>
            <code className="devHome__code">docs/PERFORMANCE.md</code> — scaling notes
          </li>
        </ul>
      </section>

      <section className="panel devHome__card">
        <h3 className="devHome__cardTitle">Repository</h3>
        <p className="devHome__muted">
          Clone path and CI are local to your environment. Root <code className="devHome__code">README.md</code> covers Docker, env vars, and scripts.
        </p>
      </section>
    </div>
  );
}
