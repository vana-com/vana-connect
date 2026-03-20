import { NextResponse } from "next/server";

type ErrorType =
  | "authentication_error"
  | "invalid_request_error"
  | "not_found_error"
  | "conflict_error"
  | "internal_error";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export function apiError(type: ErrorType, message: string, status: number) {
  return NextResponse.json(
    { error: { type, message } },
    { status, headers: CORS_HEADERS },
  );
}

export function apiSuccess(data: Record<string, unknown>, status = 200) {
  return NextResponse.json(data, { status, headers: CORS_HEADERS });
}

export function apiOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
