import ViewClient from "./view-client";

// Streamed instantly while the server component loads the user's data.
// Renders the real ViewClient in `chromeOnly` mode (no fetching) so the
// loading shell is pixel-identical to the first real paint: same Sidebar,
// same headers, same data-region skeletons — zero flicker on swap.
//
// chromeOnly does NOT fetch. page.tsx must resolve or time out (see
// SSR_DATABASE_TIMEOUT_MS) so the real ViewClient mounts and client fetch runs.
export default function ViewLoading() {
  return <ViewClient initialData={null} chromeOnly />;
}
