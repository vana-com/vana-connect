"use client";

import type { ConnectionStatus } from "@opendatalabs/connect/core";
import { useVanaData } from "@opendatalabs/connect/react";
import { useEffect, useRef } from "react";

// -- Types matching the instagram.ads + instagram.profile schemas --

interface AdInterestsData {
  advertisers: { name: string }[];
  ad_topics: { name: string }[];
}

interface ProfileData {
  username: string;
  full_name: string;
  bio?: string;
  follower_count?: number;
  following_count?: number;
  media_count?: number;
  is_private?: boolean;
  is_verified?: boolean;
  is_business?: boolean;
}

interface InstagramData {
  "instagram.ads"?: AdInterestsData;
  "instagram.profile"?: ProfileData;
}

// -- Status display --

const STATUS_DISPLAY: Record<
  ConnectionStatus,
  { dot: string; label: string; className: string }
> = {
  idle: { dot: "\u25CB", label: "Idle", className: "status-default" },
  connecting: {
    dot: "\u25CB",
    label: "Connecting",
    className: "status-default",
  },
  waiting: {
    dot: "\u25CB",
    label: "Waiting for approval",
    className: "status-waiting",
  },
  approved: { dot: "\u25CF", label: "Approved", className: "status-approved" },
  denied: { dot: "\u25CF", label: "Denied", className: "status-denied" },
  expired: { dot: "\u25CF", label: "Expired", className: "status-expired" },
  error: { dot: "\u25CF", label: "Error", className: "status-error" },
};

// -- Data display components --

function ProfileCard({ profile }: { profile: ProfileData }) {
  return (
    <div className="card">
      <div className="profile-header">
        <div className="profile-avatar">
          {profile.full_name.charAt(0).toUpperCase()}
        </div>
        <div>
          <div style={{ fontWeight: 600, fontSize: 16 }}>
            {profile.full_name}
          </div>
          <div className="mono" style={{ fontSize: 13 }}>
            @{profile.username}
          </div>
        </div>
      </div>
      {profile.bio && (
        <p style={{ fontSize: 13, color: "#a1a1aa", marginTop: 12 }}>
          {profile.bio}
        </p>
      )}
      <div className="stats-row">
        {profile.follower_count != null && (
          <div className="stat">
            <span className="stat-value">
              {profile.follower_count.toLocaleString()}
            </span>
            <span className="stat-label">Followers</span>
          </div>
        )}
        {profile.following_count != null && (
          <div className="stat">
            <span className="stat-value">
              {profile.following_count.toLocaleString()}
            </span>
            <span className="stat-label">Following</span>
          </div>
        )}
        {profile.media_count != null && (
          <div className="stat">
            <span className="stat-value">
              {profile.media_count.toLocaleString()}
            </span>
            <span className="stat-label">Posts</span>
          </div>
        )}
      </div>
    </div>
  );
}

function AdInsightsCard({ ads }: { ads: AdInterestsData }) {
  return (
    <div className="card">
      <div className="label" style={{ marginBottom: 16 }}>
        Your Ad Profile
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
          Ad Topics ({ads.ad_topics.length})
        </div>
        <div className="tag-grid">
          {ads.ad_topics.map((topic) => (
            <span key={topic.name} className="tag tag-topic">
              {topic.name}
            </span>
          ))}
        </div>
      </div>

      <div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 8 }}>
          Advertisers ({ads.advertisers.length})
        </div>
        <div className="tag-grid">
          {ads.advertisers.map((adv) => (
            <span key={adv.name} className="tag tag-advertiser">
              {adv.name}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// -- Main flow --

export default function ConnectFlow() {
  const {
    status,
    grant,
    data,
    error,
    connectUrl,
    initConnect,
    fetchData,
    isLoading,
  } = useVanaData({
    environment: (process.env.NEXT_PUBLIC_VANA_ENV as "dev" | "prod") ?? "dev",
  });

  const initRef = useRef(false);
  useEffect(() => {
    if (!initRef.current) {
      initRef.current = true;
      void initConnect();
    }
  }, [initConnect]);

  const display = STATUS_DISPLAY[status];
  const sessionReady = !!connectUrl;
  const hasConnectFailure = !sessionReady && !!error;
  const igData = data as InstagramData | null;

  return (
    <div>
      {/* Connect card — shown until data is loaded */}
      {!igData && (
        <div className="card">
          <div style={{ marginBottom: 20 }}>
            <div className="field-row">
              <span className="label">Status</span>
              <span className={`mono ${display.className}`}>
                {display.dot} {display.label}
              </span>
            </div>
          </div>

          {status === "approved" && grant ? (
            <button
              type="button"
              onClick={fetchData}
              disabled={isLoading}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              {isLoading ? (
                <>
                  <span className="spinner" /> Loading your data...
                </>
              ) : (
                "View My Ad Profile"
              )}
            </button>
          ) : sessionReady ? (
            <a
              href={connectUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary"
              style={{
                display: "inline-block",
                boxSizing: "border-box",
                fontSize: 13,
                textDecoration: "none",
                textAlign: "center",
                width: "100%",
              }}
            >
              Connect Instagram with Vana
            </a>
          ) : (
            <button
              type="button"
              onClick={() => {
                void initConnect();
              }}
              disabled={isLoading}
              className="btn-primary"
              style={{ width: "100%" }}
            >
              {isLoading ? (
                <>
                  <span className="spinner" /> Creating session...
                </>
              ) : hasConnectFailure ? (
                "Retry"
              ) : (
                "Connect Instagram"
              )}
            </button>
          )}
        </div>
      )}

      {/* Data display */}
      {igData?.["instagram.profile"] && (
        <ProfileCard profile={igData["instagram.profile"]} />
      )}
      {igData?.["instagram.ads"] && (
        <AdInsightsCard ads={igData["instagram.ads"]} />
      )}

      {/* Errors */}
      {error && (
        <div className="card card-error">
          <p className="text-error" style={{ margin: 0 }}>
            {error}
          </p>
        </div>
      )}

      {/* Reset */}
      {status !== "idle" && status !== "connecting" && (
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="btn-ghost"
          style={{ marginTop: 12 }}
        >
          Reset
        </button>
      )}
    </div>
  );
}
