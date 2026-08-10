"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { api, getToken } from "@/lib/api";

export default function Home() {
  const router = useRouter();
  useEffect(() => {
    if (getToken()) {
      router.replace("/dashboard");
      return;
    }
    api
      .get<{ needsSetup: boolean }>("/auth/setup-status")
      .then((s) => router.replace(s.needsSetup ? "/setup" : "/login"))
      .catch(() => router.replace("/login"));
  }, [router]);
  return <div className="grid min-h-screen place-items-center text-sm text-ink/50">Loading…</div>;
}
