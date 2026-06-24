import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error(
    'DATABASE_URL is not set. Run `xata branch url` and add it to .env.local'
  )
}

export const sql = postgres(connectionString)

// Types for our schema
export interface User {
  id: string
  email: string
  name: string | null
  role: string
  team_id: string | null
  created_at: Date
}

export interface Team {
  id: string
  name: string
  created_at: Date
}

// Query helpers
export async function getUsers(): Promise<User[]> {
  return sql<User[]>`SELECT * FROM users ORDER BY created_at DESC`
}

export async function getUserById(id: string): Promise<User | null> {
  const [user] = await sql<User[]>`SELECT * FROM users WHERE id = ${id}`
  return user || null
}

export async function createUser(
  email: string,
  name?: string
): Promise<User> {
  const [user] = await sql<User[]>`
    INSERT INTO users (email, name)
    VALUES (${email}, ${name || null})
    RETURNING *
  `
  return user
}

export async function getTeams(): Promise<Team[]> {
  return sql<Team[]>`SELECT * FROM teams ORDER BY created_at DESC`
}

export async function createTeam(name: string): Promise<Team> {
  const [team] = await sql<Team[]>`
    INSERT INTO teams (name)
    VALUES (${name})
    RETURNING *
  `
  return team
}
