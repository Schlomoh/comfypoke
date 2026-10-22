// The app: the key check, then the workspace gate. A 401 from any request brings the login back.
import { QueryClientProvider } from "@tanstack/react-query";
import { useAtom } from "jotai";
import { useEffect } from "react";

import { Login } from "@/app/login";
import { Shell } from "@/app/shell";
import { Splash } from "@/app/splash";
import { api, Locked } from "@/data/api";
import { authAtom, queryClient } from "@/data/queries";
import { Toasts } from "@/ui/toast";

function Gate() {
  const [auth, setAuth] = useAtom(authAtom);
  useEffect(() => {
    api.gpu().then(
      () => setAuth("open"),
      (e: unknown) => setAuth(e instanceof Locked ? "locked" : "open"),
    );
  }, [setAuth]);
  if (auth === "checking") return <Splash text="Connecting" />;
  if (auth === "locked") return <Login />;
  return <Shell />;
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Gate />
      <Toasts />
    </QueryClientProvider>
  );
}
