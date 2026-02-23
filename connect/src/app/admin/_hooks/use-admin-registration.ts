"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { registerAdminApp } from "../_lib/register-admin-app";

type AdminState = "form" | "loading" | "result" | "error";

const DEFAULT_APP_URL = "";

export function useAdminRegistration() {
  const [state, setState] = useState<AdminState>("form");
  const [appUrl, setAppUrl] = useState(DEFAULT_APP_URL);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | "">("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleAppUrlChange(value: string) {
    setError(null);
    if (state === "error") {
      setState("form");
    }
    setAppUrl(value);
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = appUrl.trim();
    if (!trimmedUrl) {
      return;
    }

    setAppUrl(trimmedUrl);
    setCopied(false);
    setError(null);
    setState("loading");

    const result = await registerAdminApp({
      appUrl: trimmedUrl,
    });
    if (!result.ok) {
      setState("error");
      setError(result.error.message);
      return;
    }

    setPrivateKey(result.data.privateKey);
    setState("result");
  }

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  function reset() {
    setCopied(false);
    setError(null);
    setAppUrl(DEFAULT_APP_URL);
    setPrivateKey("");
    setState("form");
  }

  return {
    state,
    appUrl,
    privateKey,
    copied,
    error,
    setAppUrl: handleAppUrlChange,
    submit,
    copy,
    reset,
  };
}
