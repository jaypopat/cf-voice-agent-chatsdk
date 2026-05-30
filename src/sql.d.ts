// Allow importing .sql files as text modules (used by drizzle-kit migrations)
declare module "*.sql" {
  const sql: string;
  export default sql;
}
