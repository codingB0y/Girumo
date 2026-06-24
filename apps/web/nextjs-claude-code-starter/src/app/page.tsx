import { getUsers, getTeams } from '@/lib/db'

export const dynamic = 'force-dynamic'

export default async function Home() {
  let users: Awaited<ReturnType<typeof getUsers>> = []
  let teams: Awaited<ReturnType<typeof getTeams>> = []
  let usersError: string | null = null
  let teamsError: string | null = null

  try {
    users = await getUsers()
  } catch (e) {
    usersError = e instanceof Error ? e.message : 'Failed to query users'
  }

  try {
    teams = await getTeams()
  } catch (e) {
    teamsError = e instanceof Error ? e.message : 'Failed to query teams'
  }

  const noConnection = usersError && teamsError

  return (
    <main>
      <div className="header">
        <img src="/xata-logo.svg" alt="Xata" />
        <h1>Next.js + Xata Starter</h1>
      </div>
      <p className="subtitle">Production-ready starter for AI apps with zero-downtime migrations</p>

      {noConnection ? (
        <div className="error-box">
          <strong>Database connection error:</strong>
          <pre style={{ marginTop: '0.5rem' }}>{usersError}</pre>
          <p style={{ marginTop: '1rem' }}>
            Make sure you&apos;ve run the setup:
          </p>
          <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem' }}>
            <li><code>xata auth login</code></li>
            <li><code>xata init</code></li>
            <li><code>xata branch url</code> → copy to <code>.env.local</code></li>
            <li><code>xata roll init</code></li>
            <li><code>xata roll start migrations/001_create_users.yaml</code></li>
            <li><code>xata roll complete</code></li>
          </ol>
        </div>
      ) : (
        <>
          <h2>Users ({users.length})</h2>
          <div className="section">
            {usersError ? (
              <p className="empty-state">Run migration 001 to create the users table.</p>
            ) : users.length === 0 ? (
              <p className="empty-state">No users yet. Add one with the command below.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Email</th>
                    <th>Name</th>
                    <th>Role</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((user) => (
                    <tr key={user.id}>
                      <td>{user.email}</td>
                      <td>{user.name || '—'}</td>
                      <td><span className="badge">{user.role}</span></td>
                      <td>{new Date(user.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {!usersError && (
            <pre>
              <code>
{`psql $(xata branch url) -c "INSERT INTO users (email, name) VALUES ('test@example.com', 'Test User');"`}
              </code>
            </pre>
          )}

          <h2>Teams ({teams.length})</h2>
          <div className="section">
            {teamsError ? (
              <p className="empty-state">Run migration 003 to create the teams table.</p>
            ) : teams.length === 0 ? (
              <p className="empty-state">No teams yet. Add one after running migration 003.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Created</th>
                  </tr>
                </thead>
                <tbody>
                  {teams.map((team) => (
                    <tr key={team.id}>
                      <td>{team.name}</td>
                      <td>{new Date(team.created_at).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      <div className="divider" />

      <h2>Next steps</h2>
      <div className="section">
        <ul className="next-steps">
          <li>
            <span className="step-label">Branch</span>
            <code>xata branch create --name feature/my-feature && xata branch wait-ready feature/my-feature</code>
          </li>
          <li>
            <span className="step-label">Migrate</span>
            <code>xata roll start migrations/002_add_role.yaml</code>
          </li>
          <li>
            <span className="step-label">Clone</span>
            <code>xata clone start --source-url $PROD_URL</code>
          </li>
        </ul>
      </div>

      <div className="footer">
        <a href="https://xata.io/documentation">Xata Docs</a>
        {' · '}
        <a href="https://github.com/xataio/pgroll">pgroll</a>
        {' · '}
        <a href="https://xata.io/discord">Discord</a>
      </div>
    </main>
  )
}
