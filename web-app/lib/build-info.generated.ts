/** CI rewrites this file before `railway up`. Defaults for local/dev. */
export const BUILD_INFO: {
  git_commit: string
  built_at: string
  run_id: string
} = {
  git_commit: "unknown",
  built_at: "",
  run_id: "",
}
