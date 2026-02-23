"use client";

import type { FormEvent } from "react";
import { useState } from "react";
import { registerAdminApp } from "../_lib/register-admin-app";

type AdminState = "form" | "loading" | "result";

const DEFAULT_APP_URL = "";

export function useAdminRegistration() {
  const [state, setState] = useState<AdminState>("form");
  const [appUrl, setAppUrl] = useState(DEFAULT_APP_URL);
  const [privateKey, setPrivateKey] = useState<`0x${string}` | "">("");
  const [copied, setCopied] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedUrl = appUrl.trim();
    if (!trimmedUrl) {
      return;
    }

    setAppUrl(trimmedUrl);
    setCopied(false);
    setState("loading");

    const { privateKey: nextPrivateKey } = await registerAdminApp({
      appUrl: trimmedUrl,
    });

    setPrivateKey(nextPrivateKey);
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
    setAppUrl(DEFAULT_APP_URL);
    setPrivateKey("");
    setState("form");
  }

  return {
    state,
    appUrl,
    privateKey,
    copied,
    setAppUrl,
    submit,
    copy,
    reset,
  };
}
